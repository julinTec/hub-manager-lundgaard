Plano ajustado:

1. Adicionar um botão **Voltar** no topo à direita das páginas/áreas principais:
   - Comercial
   - Financeiro
   - Operação
   - Conciliação

2. O botão ficará no cabeçalho de cada tela, alinhado à direita, junto aos botões de ação que já existem quando houver.

3. Comportamento do botão:
   - Ao clicar em **Voltar**, o sistema retorna para a tela anterior usando a navegação do navegador.
   - Como essas áreas normalmente são acessadas a partir do Início/Hub, isso levará o usuário de volta para a tela anterior de onde ele veio.

4. Visual:
   - Usar o componente padrão `Button` com estilo `outline`.
   - Incluir ícone de seta para a esquerda antes do texto **Voltar**.
   - Manter os demais botões e layout atuais sem alterar funcionalidades.

Detalhes técnicos:
- Em `Comercial.tsx`, já existe `useNavigate`; será usado `navigate(-1)`.
- Em `Financeiro.tsx`, já existe `useNavigate`; será usado `navigate(-1)`.
- Em `Operacao.tsx` e `Conciliacao.tsx`, será importado `useNavigate` de `react-router-dom`.
- Importar/adicionar o ícone `ArrowLeft` de `lucide-react` onde necessário.