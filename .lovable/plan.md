Plano para incluir os pequenos cards de indicadores na página Comercial:

1. Adicionar uma faixa de indicadores no topo da aba Devis, antes dos filtros.
   - Devis Enviados: quantidade com status `enviada_ao_cliente`.
   - Devis Aguardando: quantidade com status `aguardando_aceite`.
   - Devis Aceitos: quantidade com status `aceita` e o valor total somado dos Devis aceitos.

2. Usar o visual de cards coloridos/gradiente, seguindo o estilo já usado na tela Início.
   - Cards menores, responsivos, com ícone, título e número destacado.
   - Cores alinhadas ao funil: azul/ciano para enviados, amarelo/âmbar para aguardando, verde/emerald para aceitos.

3. Implementar os cálculos diretamente a partir da lista de Devis já carregada na página.
   - Sem alterar banco de dados.
   - Sem criar novas consultas; os dados já vêm de `devisList`.
   - O valor total dos aceitos será a soma de `total_amount` onde `status === "aceita"`.

4. Validar com checagem TypeScript após a alteração.