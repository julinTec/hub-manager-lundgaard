# Ajuste do Upload de Extrato Bancário (PDF e OFX)

Hoje a página `Conciliação` aceita apenas `.csv,.xlsx` e o handler processa tudo como CSV com separador `;`. Vamos trocar para os formatos reais de extrato bancário: **PDF** e **OFX**.

## Mudanças

### 1. `src/pages/Conciliacao.tsx`
- Trocar `accept=".csv,.xlsx"` por `accept=".ofx,.pdf"` no input de upload.
- Atualizar o texto/label do botão para deixar claro: "Upload Extrato (PDF ou OFX)".
- Reescrever `handleUpload` para detectar o tipo do arquivo pela extensão e direcionar para o parser correto:
  - `.ofx` → parser OFX local (no navegador).
  - `.pdf` → enviar para uma edge function que extrai as transações.
- Manter a mesma lógica de criação de `import_batches` e inserção em `bank_statement_entries` (campos: `transaction_date`, `description`, `amount`, `direction`, `import_batch_id`, `raw_payload`).

### 2. Parser OFX (client-side)
- Criar `src/lib/parseOfx.ts` que recebe o texto do arquivo e devolve uma lista de transações `{ date, description, amount, direction }`.
- OFX é um formato semi-XML com tags `<STMTTRN>`, `<DTPOSTED>`, `<TRNAMT>`, `<MEMO>`/`<NAME>`. Faremos parsing por regex (suficiente e sem dependência extra), tratando datas no formato `YYYYMMDD[HHMMSS]` e `direction` por sinal do `TRNAMT`.

### 3. Parser PDF (edge function)
- Criar edge function `supabase/functions/parse-bank-statement-pdf/index.ts`.
- Recebe o PDF em base64, envia para o **Lovable AI Gateway** (modelo `google/gemini-2.5-flash` com input multimodal/PDF) com um prompt pedindo as transações em JSON estrito: `[{ date: "YYYY-MM-DD", description, amount, direction: "entrada"|"saida" }]`.
- Retorna o array já normalizado para o front-end inserir em `bank_statement_entries`.
- Sem necessidade de API key adicional (usa `LOVABLE_API_KEY` já disponível no Cloud).
- Configurar `verify_jwt = false` no `supabase/config.toml` apenas se necessário; manter padrão (autenticada) já que o usuário está logado.

### 4. Feedback ao usuário
- Toasts diferenciados para "Lendo PDF..." (pode demorar) vs OFX (instantâneo).
- Mensagens de erro claras quando o arquivo não tem transações reconhecíveis.

## Detalhes Técnicos

**Detecção de formato**
```
const ext = file.name.toLowerCase().split('.').pop();
if (ext === 'ofx') { ...parse local... }
else if (ext === 'pdf') { ...invoke edge function... }
else toast.error("Formato inválido. Use PDF ou OFX.");
```

**Edge function chamada via**
```
const { data, error } = await supabase.functions.invoke('parse-bank-statement-pdf', {
  body: { fileBase64, fileName }
});
```

**Inserção** continua igual ao fluxo atual (loop por transação criando `bank_statement_entries` com `import_batch_id`).

## Fora do escopo
- Não vamos remover suporte a outros formatos no banco/lógica de matching (continua igual).
- Não mexemos em `ValidationChecklist`, Kanban, ou outras telas.
- Não criamos UI nova de pré-visualização das transações antes de importar (mantém o fluxo direto atual).
