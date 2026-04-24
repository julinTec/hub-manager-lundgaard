

# Corrigir transição: aceita não aparece na coluna "Aceita"

## Diagnóstico

Banco mostra a devis `DE202604001`:
- `accepted_at = 03:50:25` (aceite registrado ✓)
- `status = aguardando_aceite` ❌ (deveria ser `aceita`)
- `updated_at = 03:50:54` — 29 s **depois** do aceite, alguém/algo reverteu

A edge function `accept-devis-proposal` está correta (seta `status='aceita'`). O problema é que **algo sobrescreve o status depois**. Causas possíveis, todas tratadas no plano:

1. **Cron job sem trava**: `auto_advance_sent_devis` filtra só por `status='enviada_ao_cliente'`, mas não há proteção contra estados terminais. Em uma race (aceite + cron rodando simultaneamente) ou se um arrasto reverter status, o cron pode reempurrar.
2. **Drag acidental no Kanban**: hoje qualquer card pode ser arrastado para qualquer coluna do pipeline, inclusive "voltar" de `aceita` → `aguardando_aceite`.
3. **Realtime ainda não atualiza Kanban** sem refresh quando o cron muda status (já implementado, mas vamos validar).

## Correções

### 1. Hotfix imediato no banco
- `UPDATE devis SET status='aceita' WHERE id='33aedba2-…' AND accepted_at IS NOT NULL AND rejected_at IS NULL` — corrige o card atual.

### 2. Blindar o cron `auto_advance_sent_devis`
Adicionar filtros para nunca tocar em devis terminais:
```sql
UPDATE public.devis
   SET status = 'aguardando_aceite'
 WHERE status = 'enviada_ao_cliente'
   AND sent_at IS NOT NULL
   AND sent_at < now() - interval '30 seconds'
   AND accepted_at IS NULL
   AND rejected_at IS NULL;
```

### 3. Bloquear regressões no Kanban (`DevisKanban.tsx`)
Hoje `handleDragEnd` só valida `requiresValidation`. Adicionar regra:
- Se `card.accepted_at IS NOT NULL` → status só pode ir para `aceita`, `cobranca_pendente`, `entrada_recebida`, `enviado_para_operacao`. Bloqueia voltar.
- Se `card.rejected_at IS NOT NULL` → só pode ficar em `rejeitada`. Bloqueia qualquer movimento.
- Toast claro: "Esta proposta já foi aceita/recusada pelo cliente — não é possível voltar para etapas anteriores."

### 4. Validar Realtime
- Confirmar via `supabase--read_query` que `devis` está em `supabase_realtime` publication. Se não estiver, adicionar.
- Confirmar que `Comercial.tsx` invalida `['devis']` em qualquer mudança (já implementado conforme histórico).

## Arquivos afetados

- **Migration nova:** hotfix do registro atual + recriar função `auto_advance_sent_devis` com filtros adicionais + garantir publication realtime em `devis`.
- **Editar:** `src/components/devis/DevisKanban.tsx` — regras de bloqueio em `handleDragEnd` para cards aceitos/rejeitados.

## Fora do escopo

- Auto-transição `aceita` → `cobranca_pendente`.
- Logo grande do Lovable na URL pública (depende de publicar com badge oculto — você ainda não aprovou esse passo).

