

# Plano: Criar seu usuário admin e habilitar cadastro inicial

## Diagnóstico

Verifiquei o banco: **não existe nenhum usuário cadastrado** (`auth.users` e `profiles` estão vazias). O erro "Invalid login credentials" acontece porque a conta `juliocezarvieira21@gmail.com` nunca foi criada. A tela `/auth` atual só tem login, sem cadastro.

## O que será feito

### 1. Criar seu usuário admin diretamente via migration
Uma migration SQL irá:
- Criar o usuário `juliocezarvieira21@gmail.com` com a senha `Julio35@` em `auth.users` (email já confirmado, sem precisar verificar)
- Criar o registro correspondente em `profiles` (nome: "Julio Cezar Vieira")
- Atribuir o papel **`admin`** em `user_roles`

Após isso, você consegue logar imediatamente em `/auth` com essas credenciais e acessar `/admin` para criar os demais usuários.

### 2. Ajustar a tela `/auth` para uso futuro
Atualmente ela só permite login. Como o sistema usa criação de usuários **pelo admin** (via `/admin` → "Novo Usuário"), isso está correto e não precisa mudar — novos usuários serão criados por você dentro do painel admin, não por auto-cadastro público.

### 3. Confirmar o login
Depois da migration aplicada, você entra com:
- **Email:** `juliocezarvieira21@gmail.com`
- **Senha:** `Julio35@` (atenção ao "J" maiúsculo)

## Observação sobre a senha

Você escreveu `julio35@` (minúsculo) na mensagem, mas nas tentativas de login no replay aparece `Julio35@` (J maiúsculo). Vou usar **`Julio35@`** na criação. Se preferir outra senha, me avise antes de aprovar.

## Resultado esperado

Login funcional com perfil admin → acesso ao Hub, Comercial, Financeiro, Conciliação, Operação, Gestão, BI e Administração.

Aprove para eu aplicar a migration e criar seu acesso.

