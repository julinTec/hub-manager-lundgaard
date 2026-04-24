

# Plano: Upload de Ata/Relatório com IA para criar Cliente + Devis automaticamente

## Objetivo

Adicionar na página **Comercial** um fluxo automático que recebe uma **Ata de reunião** (PDF ou DOCX) em **PT / FR / EN / ES**, extrai dados via IA e:
1. Identifica o cliente (se já existe → vincula; se não → propõe criar)
2. Estrutura uma nova **Devis** seguindo o padrão do contrato `DE202511065` (objeto, escopo de serviços com itens A, B, C..., valores, responsáveis)
3. Abre o modal "Novo Devis" pré-preenchido para revisão e salvamento

## UX — Tela Comercial

### Novo botão na aba "Devis"

```text
[ToggleGroup Lista|Kanban]   [📤 Upload de Relatório / Ata]  [+ Novo Devis]
```

### Fluxo do dialog "Upload de Relatório / Ata"

```text
Passo 1: Upload         →  Passo 2: Análise IA      →  Passo 3: Revisão
─────────────────────       ──────────────────────       ────────────────────
Drop/select arquivo         Spinner "Analisando         Card cliente:
(.pdf .docx .doc .txt)      em [idioma detectado]"        ✓ Existe: João Silva
Idioma: Auto / PT/FR/                                     ✗ Novo: [form pré-preenchido]
EN/ES (override)                                        Card devis:
                                                          [campos pré-preenchidos]
                                                        [Confirmar e abrir Devis]
```

Ao confirmar → cria cliente (se novo) e abre o modal **Novo Devis** já existente, com todos os campos preenchidos (incluindo `service_type`, `responsible_sector`, `scope_description`, `proposal_structure`, `total_amount`).

## Estrutura da Devis gerada (espelhando DE202511065)

A IA preenche `proposal_structure` em markdown seguindo este molde:

```text
## I. Identificação das Partes
CONTRATANTE: {client_name}
CONTRATADO: Lundgaard Jensen Advocacia...

## II. Objeto do Contrato
{descrição geral}

### Escopo de Serviços
A) {Serviço 1} — BRL {valor}
   {descrição detalhada}
B) {Serviço 2} — BRL {valor}
   ...

## III. Honorários
Total: BRL {total}
Entrada (50%): BRL {down}

## IV. Prazo
{prazo estimado}
```

Versão bilíngue PT/FR opcional quando o idioma da ata não for português (segue o padrão do anexo).

## Implementação técnica

### 1. Edge Function nova: `analyze-meeting-report`

Recebe `{ file_base64, file_name, mime_type, language_hint }`. Faz:

- **Extração de texto** do arquivo:
  - `.txt` → direto
  - `.pdf` → `pdf-parse` via esm.sh
  - `.docx` → `mammoth` via esm.sh
- **Detecção de idioma** (heurística + IA confirma)
- **Chamada Lovable AI** (`google/gemini-2.5-pro` para qualidade multilíngue) com tool calling estruturado:

```json
{
  "name": "extract_meeting_data",
  "parameters": {
    "detected_language": "pt|fr|en|es",
    "client": {
      "name": "...", "email": "...", "phone": "...",
      "document": "...", "type": "PF|PJ", "address": "...",
      "city": "...", "notes": "..."
    },
    "meeting": {
      "date": "YYYY-MM-DD", "summary": "...", "report": "..."
    },
    "devis": {
      "title": "...",
      "service_type": "...",
      "responsible_sector": "...",
      "scope_description": "markdown",
      "proposal_structure": "markdown completo no padrão DE202511065",
      "scope_items": [
        { "letter": "A", "title": "...", "description": "...", "amount": 1100 }
      ],
      "total_amount": 0,
      "deadline_date": "YYYY-MM-DD"
    }
  }
}
```

System prompt instrui: responder no **idioma do documento** para `summary`, `report`, `scope_description` e `proposal_structure`; estruturar SEMPRE no formato do contrato Lundgaard Jensen; calcular total como soma dos itens.

### 2. Match de cliente no frontend

Após receber resposta da edge function, busca em `clients`:
- Match por `document` (CPF/CNPJ) → exato
- Match por `email` → exato
- Match por `name` (similaridade fuzzy simples) → sugestão "Talvez seja: ..."

Mostra card:
- ✅ **Cliente encontrado**: vincula `client_id`
- ⚠️ **Possível match**: usuário escolhe vincular ou criar novo
- ➕ **Novo cliente**: form pré-preenchido editável

### 3. Componente novo: `src/components/devis/UploadAtaDialog.tsx`

Steps com `Tabs` interno ou estado local:
- Step 1: Dropzone (`<input type=file>` simples + drag) + select de idioma
- Step 2: Loading com `Loader2`
- Step 3: Cards de revisão (cliente + devis) + botão "Abrir formulário Devis"

### 4. Integração com modal existente

Adicionar prop opcional ao state `devisForm` para receber os dados pré-preenchidos, e setar `aiAccepted` automaticamente com os campos da IA antes de abrir o `Dialog Novo Devis`.

### 5. Sem upload para Storage (por ora)

O arquivo é processado em memória na edge function e descartado. Apenas o texto extraído fica em `meeting_report`. Isso evita criar bucket e mantém simples. **Se quiser arquivar o PDF original, posso adicionar storage depois.**

## Idiomas suportados

A IA recebe instrução explícita: *"Detect language among PT/FR/EN/ES. Extract data and produce summary/scope IN THE SAME LANGUAGE as the source document, but ALWAYS use the Lundgaard Jensen contract structure (Identificação/Objeto/Escopo A,B,C/Honorários/Prazo) — translate the section titles to the detected language."*

Treinamento adicional via **few-shot examples** no system prompt: incluo trechos do contrato `DE202511065` (PT + FR) como referência de formato.

## Arquivos a criar / editar

- **Criar** `supabase/functions/analyze-meeting-report/index.ts`
- **Criar** `src/components/devis/UploadAtaDialog.tsx`
- **Editar** `src/pages/Comercial.tsx` — adicionar botão e wiring com modal Novo Devis

## Fora do escopo (posso fazer depois)

- Geração do PDF final da Devis no formato do contrato (assinatura, logo, paginação) — hoje só estruturamos o texto
- Storage do arquivo original da ata
- OCR de PDFs escaneados (apenas PDFs com texto nativo serão suportados nesta entrega)

Aprove para eu implementar.

