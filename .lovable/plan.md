## Objetivo

Expor endpoints HTTP que ferramentas externas (Power BI, Looker, Metabase, Tableau) consigam consumir para alimentar dashboards dos três módulos: Comercial, Financeiro e Operação. Dois formatos por módulo: **dados brutos paginados** e **KPIs agregados**.

## ⚠️ Ponto crítico antes de seguir

Você pediu "API pública sem token, exposta apenas no sistema para admins". Isso tem um problema de segurança importante que precisa ficar claro:

- A URL de uma edge function pública **fica visível em qualquer ferramenta de BI** (Power BI salva a URL no relatório, logs de proxy corporativo registram, etc.). Uma vez vazada, **qualquer pessoa na internet** consegue baixar todo o financeiro, comercial e operacional do grupo — sem login, sem rastro de quem foi.
- "Só admins veem a URL no sistema" não impede vazamento: basta um admin compartilhar o relatório do Power BI, ou a URL aparecer num print, num e-mail, no histórico do navegador.

**Recomendação forte:** usar **API Keys gerenciáveis** (a 3ª opção da pergunta original). É exatamente tão fácil de configurar no Power BI quanto uma URL pura (Power BI tem campo "Web → Advanced → Header `x-api-key`"), e te dá:
- Revogação instantânea se vazar
- Log de quem/quando consumiu
- Possibilidade de ter chaves diferentes por ferramenta (uma pra Power BI, uma pra Metabase)
- Admin gerencia tudo dentro do próprio sistema

**Vou seguir o plano com API Keys gerenciáveis pelo admin**. Se mesmo após esse aviso você quiser 100% público sem token, me diga e eu refaço o plano — mas registro aqui que **não recomendo**.

---

## Escopo

### 1. Infraestrutura de API Keys

Nova tabela `api_keys` (admin gerencia em nova tela `/admin/api-keys`):

| Campo | Descrição |
|---|---|
| `id`, `created_at` | padrão |
| `name` | rótulo amigável ("Power BI - Diretoria") |
| `key_hash` | SHA-256 da chave (chave em claro só aparece 1x na criação) |
| `key_prefix` | primeiros 8 chars pra identificar nos logs |
| `created_by` | uuid do admin |
| `last_used_at`, `usage_count` | telemetria |
| `revoked_at` | revogação lógica |
| `scopes` | array: `comercial`, `financeiro`, `operacao` |

RLS: só admin lê/cria/revoga. Função SECURITY DEFINER `validate_api_key(key text)` retorna o registro se válido (usada pelas edge functions).

Tela `/admin/api-keys`: listar, criar (mostra chave 1x num modal pra copiar), revogar, ver último uso.

### 2. Edge Functions (uma por módulo + uma de KPIs)

Todas com `verify_jwt = false`, validam header `x-api-key` chamando `validate_api_key`, registram `last_used_at`, retornam JSON.

**Endpoints brutos (paginados, filtros por data):**
- `GET /bi-comercial` → devis + clients (campos relevantes)
- `GET /bi-financeiro` → financial_entries + bank_statement_entries
- `GET /bi-operacao` → services

Query params padrão: `?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&page_size=500` (máx 1000).

**Endpoints de KPIs (agregados prontos):**
- `GET /bi-kpis/comercial` → total propostas, taxa aceite, ticket médio, ranking por responsável, evolução mensal
- `GET /bi-kpis/financeiro` → entradas/saídas conciliadas por mês, pendentes, saldo, top contrapartes
- `GET /bi-kpis/operacao` → serviços por status, prazo médio, vencidos, produtividade por setor

Resposta padronizada:
```json
{
  "data": [...],
  "meta": { "page": 1, "page_size": 500, "total": 1234, "generated_at": "2026-05-04T..." }
}
```

### 3. Documentação interna (página `/admin/api-keys` → aba "Documentação")

- URL base, formato do header (`x-api-key: lk_xxx...`)
- Lista de endpoints, parâmetros, exemplo de resposta JSON
- Snippet pronto pra colar no Power BI (Get Data → Web → Advanced)
- Snippet curl

### 4. Rate limiting básico

In-memory por chave (ex: 60 req/min). Suficiente pra BI que tipicamente puxa 1x/hora. Aviso na doc que produção pesada pode precisar evoluir.

## Detalhes técnicos

**Migrations:**
- Cria `api_keys` + RLS admin-only
- Função `public.validate_api_key(key_plain text) returns api_keys` (SECURITY DEFINER, faz hash + checa revoked_at + atualiza last_used_at/usage_count)

**Edge Functions criadas:**
- `bi-comercial`, `bi-financeiro`, `bi-operacao` (brutos)
- `bi-kpis-comercial`, `bi-kpis-financeiro`, `bi-kpis-operacao` (agregados)

Cada uma:
1. CORS headers (incluindo `x-api-key` em allow-headers)
2. Lê `x-api-key`, chama `validate_api_key` via service_role
3. Se inválida → 401
4. Valida `from`/`to`/`page`/`page_size` com Zod
5. Query no Supabase com service_role (RLS bypass intencional, justificado pela validação de chave)
6. Retorna JSON padronizado

**Front-end:**
- Nova página `src/pages/admin/ApiKeys.tsx` (list/create/revoke + doc)
- Rota `/admin/api-keys` protegida por role admin
- Link no menu admin existente

## Fora de escopo

- Webhooks de push pro BI (só pull)
- Cache server-side (BI tipicamente cacheia do lado dele)
- OAuth2 / chaves rotativas automáticas
- Dashboards internos na página /bi (continua shell visual; pode ser passo seguinte usando os mesmos endpoints)
- Exportação agendada para storage

## Próximo passo após aprovação

Implemento na ordem: migration + função de validação → tela admin de API Keys → edge functions brutas → edge functions de KPI → documentação na tela admin.
