

# Híbrido visual: card aceito aparece em 3 colunas simultâneas

## Comportamento desejado

Quando o cliente aceita a proposta, o card do devis aparece **simultaneamente** em três colunas do Kanban:

- **Aceita** — porque o cliente aceitou (`accepted_at IS NOT NULL`)
- **Cobrança pendente** — porque a `financial_entries` da cobrança 50% foi criada e está pendente
- **Enviado para operação** — porque o `service` foi criado

À medida que cada artefato evolui (cobrança conciliada, serviço iniciado), o card sai/entra das colunas correspondentes automaticamente.

```text
[Aguardando aceite] → cliente aceita
                        │
                        ▼
[Aceita] ✓   [Cobrança pendente] ✓   [Enviado para operação] ✓
   │             │                          │
   │             ▼ (cobrança conciliada)    │
   │         [Entrada recebida] ✓           │
   │                                        ▼ (serviço concluído)
   │                                    (sai da coluna)
```

## Mudanças

### 1. Modelo: derivar presença em colunas, não usar `status` único

O campo `devis.status` deixa de controlar sozinho em quais colunas o card aparece. Em vez disso, o Kanban calcula flags por devis a partir de **dados reais relacionados**:

- `inAceita` = `accepted_at IS NOT NULL && rejected_at IS NULL`
- `inCobrancaPendente` = existe `financial_entries` ligada (via `document_reference = devis.reference_number` ou `devis.id`) com `conciliation_status = 'pendente'`
- `inEntradaRecebida` = existe `financial_entries` ligada com `conciliation_status = 'conciliada'`
- `inEnviadoParaOperacao` = existe `service` ligado (`services.devis_id = devis.id`) com `status IN ('a_iniciar', 'pronto_para_iniciar')`

As colunas pré-aceite (`reuniao_realizada`, `proposta_em_geracao`, `aguardando_validacao`, `pronta_para_envio`, `enviada_ao_cliente`, `aguardando_aceite`, `rejeitada`) continuam usando `status` único como hoje. **Só as 4 colunas pós-aceite** (`aceita`, `cobranca_pendente`, `entrada_recebida`, `enviado_para_operacao`) passam a ser derivadas — o card pode estar em várias delas ao mesmo tempo.

### 2. Edge function `accept-devis-proposal`
- Manter `status = 'aceita'` no aceite (não muda).
- Continuar criando `financial_entries` e `services` (já faz).
- Sem outras mudanças.

### 3. Frontend `DevisKanban.tsx`
- Buscar (via React Query) `financial_entries` e `services` ligadas aos devis visíveis.
- Função `getColumnsForDevis(devis)` que retorna o array de colunas onde o card deve aparecer:
  - Pré-aceite: `[devis.status]` (comportamento atual)
  - Pós-aceite: combinação das flags acima
- Agrupar cards por coluna usando essa função (em vez do `groupBy(status)` atual).
- O **mesmo card** é renderizado em N colunas (mesma `id` no React, key diferenciada por `${devis.id}-${columnId}` para evitar warnings).

### 4. Drag & Drop (comportamento)
- Cards pós-aceite não devem ser arrastáveis entre colunas pós-aceite (a presença é derivada de dados, não de status). Tornar `draggable = false` para essas colunas.
- Cards pré-aceite continuam arrastáveis como hoje.
- Ainda permitir arrastar de pré-aceite para pós-aceite manualmente? **Não** — uma vez aceito, transições são automáticas via dados.

### 5. Visual
- Badge sutil no card mostrando "💰 Cobrança gerada" / "🔧 Serviço criado" quando aplicável (opcional, ajuda a entender por que o card está em múltiplas colunas).
- Tooltip ao passar o mouse: "Este card aparece nas colunas X, Y, Z".

## Arquivos afetados

- **Editar:** `src/components/devis/DevisKanban.tsx` — lógica de agrupamento por flags derivadas, desabilitar drag em colunas pós-aceite.
- **Editar:** `src/pages/Comercial.tsx` — buscar `financial_entries` e `services` (ou via novo hook); incluir nas dependências da query do Kanban.
- **Sem mudanças no banco** — modelo permanece igual, só a apresentação muda.

## Trade-offs / Observações

- **Vantagem:** reflete a realidade dos dados sem precisar duplicar registros nem inventar status compostos.
- **Limitação:** o usuário não pode mais "mover" um card pós-aceite arrastando — a presença nas colunas é consequência dos dados (cobrança conciliada na tela de Conciliação, serviço atualizado na tela de Operação).
- **Coluna "Aceita"** vira basicamente uma coluna "histórico do aceite" — todo card aceito fica lá enquanto não for arquivado/concluído. Se preferir que ele saia depois (ex: quando entrada é recebida), me diga.

## Fora do escopo

- Auto-conciliação financeira (continua manual no módulo Conciliação).
- Notificação para a equipe de operação no aceite.
- Arquivar/concluir devis (sair de todas as colunas).

