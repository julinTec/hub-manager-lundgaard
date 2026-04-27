Vou ajustar o acesso ao menu **Opções / Usuários** para voltar a abrir corretamente.

Plano de correção:

1. Corrigir o controle de autenticação
   - Hoje a página `/admin` depende de `userRole === "admin"`, mas o carregamento do perfil pode terminar antes da função de usuário ser carregada.
   - Vou separar o estado de carregamento da sessão e o estado de carregamento da função/perfil do usuário, evitando que o sistema redirecione antes de saber que o usuário é admin.

2. Ajustar a rota protegida de administrador
   - A rota `/admin` só será bloqueada depois que a verificação de permissões terminar.
   - Enquanto isso, aparecerá a tela de carregamento “Verificando permissões...”.
   - Isso evita o clique aparentemente “não fazer nada” ou voltar silenciosamente para `/hub`.

3. Ajustar o item do menu lateral
   - O botão **Opções / Usuários** continuará visível para usuários logados.
   - O clique navegará para `/admin` normalmente.
   - A proteção real continuará na rota, com base na função admin do usuário.

4. Melhorar tratamento de falhas
   - Caso a consulta da função falhe temporariamente, o app não ficará preso em um estado inconsistente.
   - O logout também limpará sessão, usuário e função localmente para evitar sessão antiga quebrada.

5. Validar
   - Rodar verificação TypeScript.
   - Confirmar que o usuário atual tem função `admin` no backend e que `/admin` deve abrir para ele.

Resultado esperado:
- Ao clicar em **Opções / Usuários**, a tela de administração abrirá novamente.
- Se a permissão ainda estiver carregando, o usuário verá um carregamento em vez de ser jogado de volta ao Hub.
- Usuários sem admin continuarão sem acesso à tela administrativa.