## Objetivo

Manter a IA como **primeira opção** para extrair lançamentos do PDF do extrato. Quando a IA falhar (especialmente erros 402 — créditos esgotados — ou 429 — rate limit), aplicar um **parser manual em texto** dentro da própria edge function, lendo o PDF como texto e extraindo as transações via regex. O usuário continua subindo o mesmo PDF, sem etapas adicionais.

## Análise dos dois extratos anexados

Os PDFs analisados representam dois layouts comuns no Brasil — a base do parser cobre ambos:

**1. Banco do Brasil (`08._Agosto_2022.pdf`)**
- Colunas: `Dt. balancete | Dt. movimento | Ag. origem | Lote | Histórico | Documento | Valor R$ | Saldo`
- Valor traz sufixo `D` (débito) ou `C` (crédito): ex. `93,00 D`, `742,49 C`
- Linhas de saldo (`Saldo Anterior`, `S A L D O`) devem ser ignoradas
- Datas no formato `DD/MM/YYYY`

**2. Bradesco (`Mai.pdf`)**
- Colunas: `Data | Histórico | Docto. | Crédito (R$) | Débito (R$) | Saldo (R$)`
- Crédito e débito em colunas separadas (uma das duas vem vazia por linha)
- Data pode estar vazia em linhas seguintes (herdar a última data preenchida)
- Linhas `COD. LANC. 0`, `Total`, e cabeçalhos repetidos por página devem ser ignorados
- Histórico pode ocupar 2 linhas (descrição + REM/DES)

## Estratégia

### Edge function `parse-bank-statement-pdf`

1. **Tentar IA primeiro** (fluxo atual mantido — Gemini 2.5 Flash via Lovable AI).
2. **Em caso de falha 402 / 429 / 5xx ou resposta inválida**, cair para o **parser manual**:
   - Extrair texto do PDF usando `unpdf` (já usado em outra edge function do projeto).
   - Rodar uma cadeia de detectores de layout em ordem:
     - **Detector BB**: regex que reconhece linhas `DD/MM/YYYY ... <histórico> ... <valor>,<centavos> [DC] ...`
     - **Detector Bradesco**: linhas com 1 data + histórico + valor em coluna de crédito/débito (deduzido pela posição/sinal)
     - **Detector genérico**: data + descrição + valor numérico no fim da linha; usa palavras-chave (`PIX`, `TED`, `DOC`, `Tarifa`, `Saldo`) para classificar e ignorar.
   - Retornar o mesmo formato `{ transactions: [{ date, description, amount, direction }] }` da IA.
3. Resposta inclui um campo `source: "ai" | "manual"` e, no caso manual, um aviso para o frontend.

### Frontend `Conciliacao.tsx`

- Tratar a resposta do edge function:
  - Se `source === "manual"`, mostrar `toast.warning("IA indisponível — extrato lido em modo manual. Confira os lançamentos antes de conciliar.")`.
  - Se mesmo o manual retornar lista vazia, mostrar `toast.error` com instrução de tentar OFX/CSV (já suportados via `parseOfx`).
- Nenhuma mudança de UI estrutural — só feedback ao usuário.

## Detalhes técnicos

### Arquivo: `supabase/functions/parse-bank-statement-pdf/index.ts`

```ts
// Pseudo-estrutura
const aiResult = await tryAi(fileBase64, fileName); // já existe
if (aiResult.ok) return json({ transactions: aiResult.transactions, source: "ai" });

// Fallback
const text = await extractPdfText(bytes); // import unpdf
const transactions = parseManually(text);
return json({ transactions, source: "manual", ai_error: aiResult.errorCode });
```

### `parseManually(text)` — heurísticas

```text
Linha BB:     ^(\d{2}/\d{2}/\d{4})\s+.*?\s+([\d\.]+,\d{2})\s+([DC])\b
Linha Bradesco: data opcional + histórico + 1 valor numérico no fim
                + decisão D/C pela posição (penúltima coluna = débito)
```

- Normalizar valor: `"1.234,56"` → `1234.56`.
- Direction: `D` → `saida`, `C` → `entrada`.
- Filtrar linhas: `Saldo`, `S A L D O`, `Total`, `COD. LANC. 0`, cabeçalhos repetidos.
- Datas vazias herdam a última data válida (Bradesco).
- Limite de segurança: descartar valores absurdos (>10⁹) ou descrição vazia.

### `Conciliacao.tsx` — ajuste mínimo

Onde hoje há:
```ts
const { data, error } = await supabase.functions.invoke("parse-bank-statement-pdf", { body: { fileBase64, fileName } });
```

Adicionar:
```ts
if (data?.source === "manual") {
  toast.warning("Extrato lido em modo manual (IA indisponível). Revise os lançamentos.");
}
if (!data?.transactions?.length) {
  toast.error("Não foi possível ler o extrato. Tente exportar como OFX/CSV.");
  return;
}
```

## Limitações conhecidas

- Parser manual é **best-effort**: pode perder linhas em layouts muito incomuns (Itaú, Caixa, Santander têm formatações diferentes). Cobre BB e Bradesco com boa precisão, e tenta o detector genérico nos demais.
- PDFs **escaneados** (imagem) continuam exigindo IA — sem texto extraível, o fallback retorna lista vazia e o frontend instrui a usar OFX/CSV.
- Não substitui a IA na riqueza de descrição (a IA limpa melhor histórico fragmentado em múltiplas linhas).

## Out of scope

- Treinar parsers específicos para Itaú, Caixa, Santander (pode vir depois conforme PDFs reais aparecerem).
- OCR de PDF escaneado (não cabe em edge function leve).
- Mudança no layout da tela de conciliação.

## Arquivos alterados

- `supabase/functions/parse-bank-statement-pdf/index.ts` — adicionar extração de texto com `unpdf` e função `parseManually` como fallback.
- `src/pages/Conciliacao.tsx` — toasts informativos sobre a fonte (`ai` vs `manual`) e fallback final OFX/CSV.
