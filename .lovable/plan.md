Plano para ajustar o card “Devis Aguardando”:

1. Alterar somente a regra desse indicador.
   - Devis Aguardando passará a contar apenas Devis com `status === "aguardando_aceite"`.
   - Devis aceitos não serão mais incluídos nesse card.

2. Manter as regras dos demais cards como estão.
   - Devis Enviados continua considerando Devis que foram enviados ou avançaram no funil.
   - Devis Aceitos continua contando aceitos e somando o valor total.

3. Validar o projeto com TypeScript após a alteração.