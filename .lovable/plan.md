## Diagnóstico do erro

Os logs da edge function mostram exatamente o que está acontecendo:

```
AI gateway error 402 {"type":"payment_required","message":"Not enough credits"}
Falling back to manual parser. AI status: 402
Manual parser failed Error: Invalid PDF structure.
  at unpdf@0.12.1/denonext/pdfjs.mjs ...
```

Ou seja:

1. A IA retorna **402 (sem créditos)** — esperado, é o gatilho do fallback.
2. O fallback manual **tenta extrair o texto com `unpdf@0.12.1`** e falha com `InvalidPDFException: Invalid PDF structure`.
3. Como o parser manual não produziu nenhuma transação, a edge function devolve a mensagem de erro "Créditos de IA esgotados e não foi possível ler o PDF automaticamente…".

O problema **não é o seu PDF** nem o regex — é a biblioteca `unpdf` que está engasgando com a estrutura do PDF (provavelmente cross-reference em formato comprimido, comum em PDFs gerados pelos bancos). Ela aborta antes mesmo do nosso regex rodar.

## O que fazer

### 1. Trocar a extração de texto por uma rota mais robusta

Substituir `unpdf` pelo `pdfjs-dist` legacy build, que aceita PDFs com xref comprimido e é o engine de referência (o `unpdf` é um wrapper em cima dele, mas a versão fixada está com bug nesses extratos):

```ts
// nova função extractPdfText
import * as pdfjs from "https://esm.sh/pdfjs-dist@4.7.76/legacy/build/pdf.mjs?target=denonext";

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  // desabilita worker no edge runtime
  // @ts-ignore
  pdfjs.GlobalWorkerOptions.workerSrc = "";
  const pdf = await pdfjs.getDocument({
    data: bytes,
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Reconstrói linhas usando a coordenada Y (transform[5]) — pdfjs solta
    // os itens em ordem de leitura mas sem \n; agrupar por Y mantém a noção
    // de "linha" do extrato.
    const byY = new Map<number, { x: number; str: string }[]>();
    for (const it of content.items as any[]) {
      const y = Math.round(it.transform[5]);
      const x = it.transform[4];
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y)!.push({ x, str: it.str });
    }
    const lines = [...byY.entries()]
      .sort((a, b) => b[0] - a[0]) // y maior = topo da página
      .map(([, items]) =>
        items.sort((a, b) => a.x - b.x).map((i) => i.str).join(" ").replace(/\s+/g, " ").trim(),
      )
      .filter(Boolean);
    pages.push(lines.join("\n"));
  }
  return pages.join("\n");
}
```

Por que muda o jogo:
- `pdfjs-dist` lida nativamente com xref comprimido (causa do `Invalid PDF structure` do unpdf).
- Reconstruir linha por coordenada Y devolve os lançamentos em **linhas reais**, exatamente o que os regex do BB/Bradesco esperam (hoje o `mergePages: true` do unpdf concatena tudo numa salada).

### 2. Endurecer o parser manual

Com texto bem formatado em mãos, ajustar o `parseManually` em `supabase/functions/parse-bank-statement-pdf/index.ts`:

- **Banco do Brasil**: reduzir o regex para `^(\d{2}\/\d{2}\/\d{4}).+?([\d\.]+,\d{2})\s*([DC])\b` e ignorar a primeira data (Dt. balancete) usando `lastIndex` — pega tanto entradas (`C`) quanto saídas (`D`).
- **Bradesco**: como agora as colunas mantêm a ordem por X, decidir crédito vs débito pela posição do valor na linha (índice do match no texto): se o valor da movimentação está mais à esquerda que o saldo e antes do meio da linha após o histórico, é crédito; senão débito. Como fallback, manter a lógica atual de "se há 2 valores antes do saldo, primeiro = crédito, segundo = débito".
- **Genérico**: manter, mas com lista ampliada de palavras-chave (`recebido`, `enviado`, `compra`, `boleto`, `transf` etc.) e tolerar valor com sinal negativo (`-1.234,56` → saída).
- **Fallback de último recurso**: se nenhum dos três detectores acertou, varrer todas as linhas com regex `data + qualquer texto + valor` e classificar tudo como entrada (com aviso no toast pedindo revisão). Melhor importar lançamentos com direção possivelmente errada do que travar.

### 3. Garantir que o frontend não trate fallback como erro fatal

`src/pages/Conciliacao.tsx` já está correto (lê `data?.error` e `data?.source`), só preciso ajustar a mensagem do erro final para refletir o novo cenário: quando o PDF for ilegível mesmo após o pdfjs, sugerir OFX/CSV. Sem mudança estrutural.

### 4. QA

- Reimplantar a edge function.
- Testar com `supabase--curl_edge_functions` enviando os dois PDFs anexados (BB agosto/2022 e Bradesco maio) em base64 e validar que `transactions.length > 0` e cobre tanto entradas quanto saídas.
- Conferir os logs: não deve mais aparecer `Invalid PDF structure`.

## Limitações que permanecem

- **PDF escaneado (imagem)** continua exigindo IA — não há texto para extrair. Nesse caso o usuário precisa OFX/CSV. Vou deixar essa mensagem explícita no toast.
- Bancos não cobertos (Itaú, Caixa, Santander) caem no detector genérico; a direção pode sair invertida em casos sem palavra-chave clara — daí o aviso "Revise antes de conciliar".

## Arquivos a alterar

- `supabase/functions/parse-bank-statement-pdf/index.ts` — substituir `extractPdfText` (pdfjs-dist + reconstrução por Y), ajustar regex BB/Bradesco/Genérico, adicionar fallback de último recurso.
- `src/pages/Conciliacao.tsx` — pequeno ajuste na mensagem de erro final (sem mudança de fluxo).

## Fora do escopo

- OCR de PDF escaneado.
- Parsers dedicados para Itaú/Caixa/Santander (entram conforme aparecerem PDFs reais).
- Mudança no layout da tela de conciliação.
