## Redesign da Conciliação no estilo Conta Azul (lado a lado)

Hoje a página de Conciliação tem uma tabela única do extrato + um card separado de "Sugestões". Vou trocar por um layout pareado em duas colunas, inspirado na imagem do Conta Azul.

### Layout proposto

```text
┌──────────────────────────────────────────┬──────────────────────────────────────────┐
│  🏦 Lançamentos do banco (extrato)        │  💼 Lançamentos internos (sistema)        │
├──────────────────────────────────────────┼──────────────────────────────────────────┤
│ ┌──────────────────────────┐             │ ┌──────────────────────────┐            │
│ │ 10/01  Quinta            │             │ │ Descrição                │            │
│ │ Transf. enviada -4.000,00│  [Conciliar]│ │ Fornecedor / Categoria   │            │
│ │ [✏️] [🗑️] [Ignorar]       │             │ │ Valor                    │            │
│ └──────────────────────────┘             │ └──────────────────────────┘            │
│                                           │                                          │
│ ┌──────────────────────────┐             │ ┌──────────────────────────┐            │
│ │ 14/01  Cheque comp.      │  [Conciliar]│ │ (sem candidato — buscar) │            │
│ └──────────────────────────┘             │ └──────────────────────────┘            │
└──────────────────────────────────────────┴──────────────────────────────────────────┘
```

Cada **linha** representa um par: card do extrato à esquerda, botão **Conciliar** ao centro, card do lançamento interno correspondente à direita.

### Comportamento

1. **Carregamento inicial**: para cada `bank_statement_entry` ainda não conciliado, tentar encontrar o melhor candidato em `financial_entries` pendentes usando a heurística atual (mesmo valor + data próxima ±5 dias + similaridade de descrição). Se houver match já em `conciliation_matches` com status `sugerido`, usar esse pareamento.

2. **Card esquerdo (extrato)** mostra: data, dia da semana, descrição, valor (verde se entrada / vermelho se saída), badge de status. Ações: ✏️ editar, 🗑️ excluir, **Ignorar** (marca como `divergente` ou cria registro de "ignorado").

3. **Card direito (lançamento interno)** tem 3 estados:
   - **Match sugerido**: mostra dados do `financial_entry` + botão "Trocar" (abre busca) e "Editar".
   - **Sem candidato**: caixa vazia com botão **"Buscar lançamento"** (abre `Dialog` com lista pesquisável de `financial_entries` pendentes para o usuário escolher manualmente) e **"Novo lançamento"** (abre formulário rápido para criar um `financial_entry` na hora — data, descrição, fornecedor, valor, conta, negócio — e já parear).
   - **Conciliado**: ambos os cards ficam com fundo verde claro e o botão central vira "Desfazer".

4. **Botão central "Conciliar"**: só fica habilitado quando há um candidato escolhido. Ao clicar:
   - cria/atualiza `conciliation_matches` com `status = 'confirmado'`
   - atualiza `bank_statement_entries.conciliation_status = 'conciliado'`
   - atualiza `financial_entries.conciliation_status = 'conciliado'`

5. **Filtros no topo da coluna esquerda**: busca por descrição, filtro por status (Todos / Pendentes / Conciliados / Ignorados) e por direção (Entradas / Saídas). Os cards de resumo (Conciliado, Pendente, Sugestões, Entradas, Saídas) e o upload de extrato continuam acima.

6. **Responsivo**: em telas < 1024px as duas colunas viram empilhadas (extrato em cima, candidato logo abaixo, com uma divisória discreta), preservando o pareamento visual.

### Mudanças técnicas

- **`src/pages/Conciliacao.tsx`** reescrita da seção da "Tabela do extrato" e "Sugestões". O upload, mutações de match (confirmar / rejeitar), edição e exclusão de linhas já existentes serão reutilizados.
- Novo componente local `PairRow` (no mesmo arquivo) que renderiza a linha pareada.
- Novo `Dialog` "Buscar lançamento interno" com `Input` de busca + lista virtual simples filtrando `financial_entries` por valor/descrição/data.
- Novo `Dialog` "Novo lançamento financeiro" — reutiliza estrutura de form do `Financeiro.tsx` (campos básicos: `entry_date`, `business_unit`, `movement_account`, `movement_description`, `counterparty_name`, `amount_in`/`amount_out` deduzido do `direction` do extrato).
- A função de pareamento automático passa a rodar **na hora de carregar** (em memória, sem persistir) para já mostrar os candidatos sugeridos no lado direito; só persiste em `conciliation_matches` quando o usuário clica em **Conciliar**.

### Sem mudanças

- Banco de dados, RLS, edge functions: nenhuma alteração.
- Outras páginas: nenhuma alteração.

### O que fica de fora desta etapa (podemos fazer depois se quiser)

- Drag & drop entre cards (Conta Azul não usa, e adiciona complexidade).
- Categorização automática por IA (regras sugeridas de categoria/centro de custo).
- Conciliação 1-para-N (um lançamento bancário casando com vários internos somando o mesmo valor).
