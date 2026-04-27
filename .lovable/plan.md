Plano ajustado para a tela de BI:

1. Renomear somente o título da página
- Trocar “Consolidação / BI” por “Dashboards Gerenciais”.
- Manter exatamente o subtítulo atual: “Indicadores consolidados e integração com ferramentas de BI”.

2. Substituir os cards atuais por 3 cards clicáveis
- Remover os cards atuais de “Receita x Despesa”, “Fluxo de Caixa”, “Indicadores Gerenciais” e “API para BI Externo”.
- Criar três cards principais:
  - Dashboard Comercial
  - Dashboard Financeiro
  - Dashboard Operação
- Aplicar estilo de card clicável com hover, destaque visual e indicação de seleção.

3. Abrir o BI dentro da própria tela
- Ao clicar em um card, mostrar uma área logo abaixo dos cards.
- Essa área exibirá o dashboard selecionado dentro do sistema.
- Como os links/embeds reais dos BIs ainda não foram fornecidos, deixarei um painel preparado com estado vazio/placeholder para cada dashboard, pronto para receber futuramente o iframe, link ou componente do BI correspondente.

4. Manter funcionamento simples e responsivo
- A tela continuará em `/bi`.
- Não haverá mudança de rota nem abertura em nova aba.
- Em desktop os cards ficarão lado a lado; em telas menores, empilhados.

Detalhes técnicos:
- A alteração será feita em `src/pages/BI.tsx`.
- Usarei estado local do React para controlar qual dashboard está selecionado.
- Não será necessário alterar banco de dados nem backend nesta etapa.