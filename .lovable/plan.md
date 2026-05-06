## Problema confirmado

No extrato Bradesco em PDF (formato de tabela com colunas `Data | Histórico | Docto. | Crédito (R$) | Débito (R$) | Saldo (R$)`), o parser manual atual está:

1. **Pegando o "Docto." (número do documento) como descrição** — por isso aparecem números como "1629047", "1639065" no lugar de "PIX QR CODE ESTATIC" / "TRANSFERENCIA PIX".
2. **Classificando tudo como entrada (receita)** — porque a heurística atual ("primeiro valor = crédito, segundo = débito") quebra: quando só há valor na coluna Débito, o parser vê `[debito, saldo]` e trata o débito como crédito.
3. **Ignorando linhas sem data** — a maioria das linhas do Bradesco tem a data preenchida só na primeira ocorrência do dia (data herdada).

### Causa raiz técnica

O parser atual (`parseBradesco`) trabalha com a linha já achatada em string. Mas o `extractPdfText` já agrupa items por coordenada Y — temos acesso à coordenada **X** de cada texto, que é exatamente o que distingue a coluna Crédito da coluna Débito visualmente. Estamos jogando essa informação fora.

## Plano de correção

### 1. Mudar `extractPdfText` para preservar coordenadas X por página

Em vez de retornar uma string `string`, retornar uma estrutura por página com items posicionados:

```ts
type PdfLine = { y: number; items: { x: number; str: string }[] };
type PdfPage = { width: number; lines: PdfLine[] };
```

Manter uma função auxiliar `flattenPages(pages): string` para os parsers que ainda usam texto puro (BB, Generic, LastResort).

### 2. Reescrever `parseBradesco` baseado em colunas (X)

Algoritmo:

1. **Detectar cabeçalho** procurando a linha que contém `Histórico`, `Crédito`, `Débito`, `Saldo` (case-insensitive). Capturar o `x` central de cada uma dessas palavras → define limites de coluna `X_HIST`, `X_DOC`, `X_CRED`, `X_DEB`, `X_SALDO`.
2. Para cada linha de dados:
   - Pegar data se existir no início (X pequeno + match `dd/mm/yyyy`); senão herdar `lastDate`.
   - Coletar **valores numéricos** (`/[\d\.]+,\d{2}/`) com seus X.
   - Para cada valor, classificar pela coluna mais próxima (`X_CRED`, `X_DEB`, `X_SALDO`) usando `argmin(|x - col|)`.
   - Se valor caiu em **CRED** → `entrada`; em **DEB** → `saida`; **SALDO** descartado.
   - **Histórico** = todos os items de texto (não-numéricos, não-data) com `x < X_DOC` concatenados, limpos de `REM:`/`DES:` opcionalmente preservados.
3. Suportar **linhas de continuação**: quando uma linha não tem nenhum valor numérico mas tem texto na coluna Histórico, anexar à descrição da última transação aberta (ex: a linha `REM: MADALENA VIANA MARTIN 02/05` é continuação de `PIX QR CODE ESTATIC`).
4. Ignorar linhas com `RENTAB.INVEST` opcionalmente? Não — o usuário quer todos os lançamentos. Manter.
5. Filtrar linhas de `SALDO ANTERIOR`, `SALDO DO DIA`, totais (já feito por `shouldIgnoreLine`).

### 3. Detecção de banco

Antes de chamar parsers, identificar Bradesco pelo cabeçalho (`Crédito (R$)` + `Débito (R$)` + `Saldo (R$)` na mesma linha) e ir direto para `parseBradesco` posicional. Se não houver cabeçalho identificável, cair em BB → Generic → LastResort como hoje.

### 4. Manter `parseBancoDoBrasil`, `parseGeneric`, `parseLastResort` como fallback

Continuam recebendo texto plano via `flattenPages`. Sem mudanças funcionais.

### 5. QA

- Testar com o PDF anexo do Bradesco: deve retornar `PIX QR CODE ESTATIC - REM: MADALENA VIANA MARTIN 02/05` como descrição, `direction: entrada`, `amount: 10.00` etc., e `TRANSFERENCIA PIX - DES: Kariny...` como `direction: saida`, `amount: 5428.50`.
- Validar via `supabase--curl_edge_functions` enviando o PDF base64.
- Garantir que parser BB ainda funciona (não regredir).

## Arquivos a alterar

- `supabase/functions/parse-bank-statement-pdf/index.ts` (única mudança).
- Re-deploy da edge function.

## Fora de escopo

- Mudanças no frontend (`Conciliacao.tsx`).
- OCR de PDFs escaneados.
- Parsers dedicados para Itaú/Caixa/Santander (continuam no Generic).
