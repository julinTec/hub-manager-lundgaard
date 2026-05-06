## Funcionalidade: Excluir todos os lançamentos do extrato de uma vez

Adicionar um botão **"Excluir todos"** no cabeçalho do card "Conciliação por par", mantendo a exclusão individual existente.

### Comportamento

- O botão fica ao lado do filtro de status, com ícone `Trash2` e variant destrutiva discreta (`variant="outline"` + texto vermelho).
- **Respeita o filtro ativo**: se o usuário selecionou "Pendentes", exclui só os pendentes visíveis; se "Todos", exclui todos os lançamentos do extrato carregados (até 200 do limit atual).
- **Bloqueio de segurança**: lançamentos com status `conciliado` são automaticamente excluídos da seleção (mesma regra da exclusão unitária, que pede para rejeitar antes). Se a seleção final for vazia, mostra aviso.
- **Confirmação obrigatória**: AlertDialog mostrando a quantidade exata que será apagada (ex: "Excluir 47 lançamentos? Esta ação é permanente.").
- Remove primeiro os `conciliation_matches` relacionados (via `.in('bank_statement_entry_id', ids)`), depois os `bank_statement_entries` (via `.in('id', ids)`) — mesma ordem da exclusão unitária.
- Toast de sucesso com a contagem; invalida queries `bank-statements` e `conciliation-matches`.

### Mudanças de código

**Arquivo único:** `src/pages/Conciliacao.tsx`

1. Novo estado `confirmDeleteAll: boolean` e mutation `deleteAllEntries` (recebe `ids: string[]`).
2. Botão "Excluir todos" no `CardHeader` da seção "Conciliação por par", visível apenas quando `filteredStatements.length > 0`.
3. Novo `<AlertDialog>` de confirmação reutilizando o padrão visual do dialog de exclusão unitária existente.

### Fora de escopo

- Exclusão dos `financial_entries` (lançamentos internos) — só extrato bancário, conforme pedido.
- Mudanças no backend / RLS — políticas atuais já permitem `DELETE` para admin/financeiro.
