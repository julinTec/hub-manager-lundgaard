# Cards Financeiros: Separar Pendentes de Realizados

## Problema
Hoje os cards "Total Entradas", "Total Saídas" e "Saldo" somam **todos** os lançamentos, incluindo os que ainda não foram pagos pelo cliente (status `pendente`). Isso infla o caixa real.

## Mudança em `src/pages/Financeiro.tsx`

### 1. Ajustar os totais existentes
Filtrar `entries` para considerar apenas lançamentos **conciliados** (`conciliation_status === "conciliado"`) nos totais de:
- Total Entradas
- Total Saídas
- Saldo

Lançamentos `pendente`, `divergente` e `ignorado` ficam fora desses três cards (ou seja, "zerados" enquanto não houver entrada efetiva em caixa).

### 2. Novo card "Entradas (pendentes)"
- **Posição**: primeiro card da grade (antes de "Total Entradas").
- **Valor**: soma de `amount_in` de todos os lançamentos com `conciliation_status === "pendente"`.
- **Visual**: ícone `Clock` (lucide-react) em cor `warning`, mesmo padrão visual dos outros cards (ícone à esquerda + label + valor).

### 3. Grid layout
Alterar de `md:grid-cols-3` para `md:grid-cols-2 lg:grid-cols-4` para acomodar 4 cards mantendo bom espaçamento na viewport atual (1336px).

## Detalhes técnicos

```ts
const conciliated = entries.filter(e => e.conciliation_status === "conciliado");
const pending = entries.filter(e => e.conciliation_status === "pendente");

const totalIn = conciliated.reduce((s, e) => s + Number(e.amount_in || 0), 0);
const totalOut = conciliated.reduce((s, e) => s + Number(e.amount_out || 0), 0);
const totalPendingIn = pending.reduce((s, e) => s + Number(e.amount_in || 0), 0);
```

Ordem dos cards na UI:
1. **Entradas (pendentes)** — `Clock`, cor warning
2. **Total Entradas** — `ArrowDownCircle`, cor success (apenas conciliados)
3. **Total Saídas** — `ArrowUpCircle`, cor destructive (apenas conciliados)
4. **Saldo** — apenas conciliados (`totalIn - totalOut`)

## Fora do escopo
- Não alteramos a tabela de lançamentos nem os filtros existentes.
- Não tocamos em RLS, schema ou outras páginas.
- O badge de status na tabela continua mostrando o estado individual de cada lançamento.
