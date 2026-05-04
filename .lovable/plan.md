## Ajuste de rótulo no card

Encontrei o card "Entradas (pendentes)" em `src/pages/Financeiro.tsx` (linha 155). Na página de Conciliação (`src/pages/Conciliacao.tsx`) não existe esse card — os cards lá são "Conciliado", "Pendente", "Sugestões", "Entradas" e "Saídas".

Vou assumir que se refere a este card do Financeiro (foi adicionado recentemente conforme nossa conversa anterior).

### Mudança

- `src/pages/Financeiro.tsx` linha 155: trocar o texto `Entradas (pendentes)` por `Entradas (a receber)`.

Nenhuma outra alteração é necessária — apenas o rótulo visual muda; o cálculo (`totalPendingIn`) permanece o mesmo.

Se na verdade você queria renomear algo na página de Conciliação, me diga qual card exatamente para eu ajustar lá.