Plano para corrigir a tela de Opções / Usuários:

1. Corrigir leitura dos perfis na tela
- Ajustar a forma como a página Admin carrega usuários e perfis para que o papel atualizado seja exibido imediatamente após salvar.
- Garantir que erros de carregamento de `profiles` e `user_roles` apareçam como mensagem clara, em vez de a tela mostrar `—` silenciosamente.

2. Corrigir permissões de visualização dos papéis
- Adicionar novamente uma regra segura para que administradores possam visualizar todos os registros de `user_roles`.
- Manter usuários comuns limitados a visualizar apenas o próprio perfil/papel.
- Evitar expor a função interna de validação de admin diretamente ao app.

3. Melhorar atualização após salvar
- Após alterar o perfil, invalidar e recarregar as consultas de usuários e papéis.
- Atualizar a tabela com os dados retornados, para que o novo perfil apareça sem precisar sair/entrar ou recarregar a página.

4. Validar fluxo completo
- Testar a função `manage-users` para confirmar que o admin consegue alterar perfil sem 403.
- Confirmar que o banco contém o novo papel salvo.
- Rodar verificação de TypeScript para garantir que o app continua compilando.

Detalhes técnicos:
- A função de backend já salva a alteração corretamente.
- O problema atual está na sincronização da tela com a tabela `user_roles` e na ausência da política “admin pode ver todos os papéis”.
- A correção será feita sem mexer nos arquivos auto-gerados da integração de backend.