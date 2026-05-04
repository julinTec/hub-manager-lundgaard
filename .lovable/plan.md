## Editar e excluir lançamentos do extrato na Conciliação

Atualmente a tabela "Extrato Bancário Importado" em `src/pages/Conciliacao.tsx` apenas exibe as linhas (data, descrição, direção, valor, status). Vou adicionar ações por linha para **editar** e **excluir** cada lançamento da tabela `bank_statement_entries`.

### Mudanças em `src/pages/Conciliacao.tsx`

1. **Nova coluna "Ações"** na tabela do extrato, com dois botões por linha:
   - ✏️ Editar (ícone `Pencil`) — abre um diálogo
   - 🗑️ Excluir (ícone `Trash2`) — abre um `AlertDialog` de confirmação

2. **Diálogo de edição** (`Dialog` do shadcn) com os campos:
   - Data da transação (`transaction_date`)
   - Descrição (`description`)
   - Direção (`direction`: entrada/saída via `Select`)
   - Valor (`amount` via `CurrencyInputBRL`)
   
   Ao salvar: `update` em `bank_statement_entries` pelo `id` e invalidação da query `bank-statements`.

3. **Exclusão com confirmação** (`AlertDialog`):
   - Antes de excluir, remover quaisquer `conciliation_matches` que referenciem o `bank_statement_entry_id` (para não deixar matches órfãos).
   - Depois `delete` em `bank_statement_entries` pelo `id`.
   - Invalidar `bank-statements` e `conciliation-matches`.
   - Bloquear exclusão (com toast de aviso) se o status for `conciliado` — para evitar quebrar conciliações já confirmadas; o usuário precisará rejeitar/desfazer o match antes.

4. **Permissões**: as policies já permitem que admin e financeiro façam `ALL` em `bank_statement_entries` e `conciliation_matches`, então não há mudanças de RLS nem de banco.

### Detalhes técnicos

- Usar `useMutation` do `@tanstack/react-query` para update e delete, seguindo o padrão já existente no arquivo (`confirmMatch`, `rejectMatch`).
- Estados locais novos: `editingEntry` (linha em edição) e `deletingId` (linha em confirmação de exclusão).
- Reaproveitar componentes shadcn já presentes no projeto: `Dialog`, `AlertDialog`, `Select`, `Input`, `CurrencyInputBRL`.
- Sem alterações em banco de dados, edge functions, ou em outras páginas.
