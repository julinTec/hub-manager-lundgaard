# Ajuste de organização do Hub e menu lateral

## O que será alterado

1. **Reordenar os cards do Hub** na sequência solicitada:
   - Comercial
   - Financeiro
   - Operação
   - Gestão
   - BI
   - Opções / Usuários

2. **Remover o card Conciliação da tela principal do Hub**
   - Ele não aparecerá mais como card separado.
   - A Conciliação passará a ficar acessível dentro da área Financeiro.

3. **Remover Conciliação da lateral esquerda**
   - O menu lateral não terá mais um item separado chamado “Conciliação”.
   - A navegação principal ficará mais enxuta.

4. **Manter Conciliação dentro do Financeiro**
   - Na página Financeiro, será adicionado um acesso claro para Conciliação, por exemplo um botão/atalho “Conciliação” no topo da tela.
   - A rota técnica `/conciliacao` continuará existindo para não quebrar a tela atual, mas o usuário chegará nela pelo Financeiro.

5. **Renomear Administração**
   - Onde hoje aparece “Administração”, passará a aparecer:
     - **Opções / Usuários**
   - Isso será aplicado no card do Hub e no menu lateral.
   - A regra de visibilidade continua igual: só aparece para usuário admin.

6. **Retirar os demais cards/itens não solicitados**
   - O Hub deixará visíveis apenas os módulos listados acima.
   - Não haverá card separado para Início nem Conciliação.

## Resultado visual esperado

```text
Hub

[ Comercial ] [ Financeiro ] [ Operação ]
[ Gestão    ] [ BI         ] [ Opções / Usuários ]
```

Menu lateral:

```text
Principal
- Início
- Comercial
- Financeiro
- Operação

Gestão
- Gestão
- Consolidação / BI
- Opções / Usuários
```

## Arquivos que serão ajustados

- `src/pages/Hub.tsx`
  - Reordenar/remover cards.
  - Renomear Administração para Opções / Usuários.

- `src/components/AppSidebar.tsx`
  - Remover Conciliação do menu lateral.
  - Renomear Administração para Opções / Usuários.

- `src/pages/Financeiro.tsx`
  - Adicionar acesso para a tela de Conciliação dentro da área Financeiro.

## Observação

Não será feita alteração no banco de dados. É apenas reorganização de navegação e nomenclatura na interface.