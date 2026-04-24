

# Ajustes finais: pipeline + aceite + visual + botão Rejeitar

## 1. Auto-transição "Enviada ao cliente" → "Aguardando aceite" (30s)

- Habilitar extensão `pg_cron` no banco.
- Criar job que roda a cada 15s:
  ```sql
  UPDATE devis
     SET status = 'aguardando_aceite'
   WHERE status = 'enviada_ao_cliente'
     AND sent_at < now() - interval '30 seconds';
  ```
- Habilitar **Realtime** na tabela `devis` (`ALTER PUBLICATION supabase_realtime ADD TABLE devis`).
- Em `src/pages/Comercial.tsx`: assinar `postgres_changes` e invalidar a query `['devis']` em qualquer mudança → Kanban atualiza sozinho.

## 2. Aceite vai para "Aceita" (e fica lá)

- Editar `supabase/functions/accept-devis-proposal/index.ts`: trocar `status: 'cobranca_pendente'` por `status: 'aceita'`.
- Cobrança 50% e criação do `service` continuam acontecendo no aceite (sem mudança).
- Transição `aceita` → `cobranca_pendente` passa a ser manual (arrastar no Kanban).

## 3. Novo botão "Rejeitar proposta" no e-mail e na página pública

### Edge function `accept-devis-proposal` — adicionar ação `reject`

- Aceitar `?action=reject` no POST.
- Quando `action=reject`:
  - Validar token, exigir `accepted_at IS NULL` e `rejected_at IS NULL`.
  - `UPDATE devis SET status='rejeitada', rejected_at=now(), rejected_ip=<ip> WHERE id=...`.
  - **Não** cria cobrança nem service.
  - Registra `audit_logs` com ação `devis_rejected_by_client`.
- GET continua só retornando o preview (inclui agora `rejected_at`).

### Migration

- `ALTER TABLE devis ADD COLUMN rejected_at TIMESTAMPTZ NULL`
- `ALTER TABLE devis ADD COLUMN rejected_ip TEXT NULL`

### `src/pages/AceitarProposta.tsx` — dois botões lado a lado

- Botão verde **"Aceitar proposta"** (existente) à esquerda.
- Botão vermelho outline **"Recusar proposta"** à direita.
- Ao clicar em Recusar → modal de confirmação ("Tem certeza? Esta ação não pode ser desfeita.") com campo opcional de motivo (texto livre, salvo em `audit_logs.details.reason`).
- Estados novos: `rejecting`, `rejected`, `already_rejected`.
- Card de sucesso vermelho quando rejeitada: "Proposta recusada. Agradecemos seu retorno."
- Se já rejeitada/aceita ao abrir o link → mostra o estado final, esconde os botões.

### E-mail (`send-devis-proposal/index.ts`)

- No HTML, ao lado do botão verde "Aceitar Proposta", adicionar botão **"Recusar"** (link para a mesma URL `/aceitar-proposta/:token`, o cliente decide na página).
- Visual: dois botões em uma linha (`<table>` lado a lado, padrão React Email/HTML email para compatibilidade), verde + cinza/vermelho outline.
- Texto do e-mail (4 idiomas) ajustado: "Você pode aceitar ou recusar a proposta clicando nos botões abaixo."

> Decisão de design: **manter um único link** (`/aceitar-proposta/:token`) e a escolha aceitar/recusar acontece na página, não no e-mail. Motivo: evita aceite/recusa acidental por preview de e-mail (alguns clientes pré-carregam links GET) e dá ao cliente a chance de revisar a proposta antes de decidir. Os dois botões no e-mail dão a sinalização visual; ambos levam para a mesma página.

## 4. Visual da página pública mais clean/profissional

- Header maior: logo Lundgaard Jensen + nome em tipografia elegante, divisor sutil.
- Espaçamentos e tipografia refinados (max-width menor, mais respiro).
- Footer com endereço e contato da empresa.
- Garantir que nada na página remeta a "demo".

## 5. Logo grande do Lovable na URL do cliente

- **Publicar o projeto** com `hide_badge = true` (Opção A — requer plano Pro).
- URL passa a ser `*.lovable.app` sem barra grande.
- Se não estiver no Pro, te aviso para fazer upgrade ou usamos Opção C (badge pequeno) provisoriamente.

## Pipeline de status (atualizado)

```text
... → enviada_ao_cliente → (30s) → aguardando_aceite → ┬→ aceita → cobranca_pendente → ...
                                                       └→ rejeitada (cliente clicou Recusar)
```

## Arquivos afetados

- **Migration:** habilitar `pg_cron` + job de auto-transição; habilitar Realtime em `devis`; adicionar `rejected_at` e `rejected_ip`.
- **Editar:** `supabase/functions/accept-devis-proposal/index.ts` (status `aceita` + ação `reject`).
- **Editar:** `supabase/functions/send-devis-proposal/index.ts` (botão Rejeitar no HTML, copy 4 idiomas).
- **Editar:** `src/pages/AceitarProposta.tsx` (dois botões + modal de recusa + estados + visual refinado).
- **Editar:** `src/pages/Comercial.tsx` (subscribe realtime).
- **Publish settings:** ocultar badge + publicar.

## Fora do escopo

- Auto-transição `aceita` → `cobranca_pendente`.
- Domínio próprio (`app.lundgaardjensen.com`).
- Bloquear arrasto retroativo no Kanban (ex: impedir voltar de `aceita` para colunas anteriores).

