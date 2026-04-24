

# Implementação: Botão "Enviar" com Lovable Emails (link de aceite + PDF)

Você escolheu **Opção A — Lovable Emails (nativo)**. Vou implementar tudo de uma vez assim que aprovar.

## Pré-requisito automático: domínio de envio

Lovable Emails precisa de um subdomínio remetente (ex: `notify.lundgaardjensen.com`) verificado. Quando você aprovar, abro o dialog de configuração — você informa o domínio uma vez e o sistema:
- Adiciona os registros NS no seu provedor de DNS (com instruções claras)
- Provisiona SPF/DKIM/MX automaticamente
- Cria toda a infra de fila/retry/log de envios

Enquanto o DNS propaga (até 72h), o restante da implementação fica pronto e o sistema enfileira; assim que o domínio fica `active`, os e-mails saem.

## O que vou implementar

### 1. Backend — fila e infraestrutura
- Configurar infra de e-mails (fila pgmq + cron + tabelas de log/supressão/unsubscribe) — automático após o domínio
- Criar template React Email `devis-proposal.tsx` em `supabase/functions/_shared/transactional-email-templates/`:
  - Cabeçalho Lundgaard Jensen
  - Mensagem editável vinda do dialog
  - **Botão verde grande "Aceitar Proposta"** linkando pra `{origin}/aceitar-proposta/{accept_token}`
  - Link `📎 Baixar proposta em PDF` apontando pro arquivo no Storage
  - Versões PT / FR / EN / ES
- Registrar o template no `registry.ts`
- Função `send-transactional-email` (criada pelo scaffold) cuida do envio

### 2. Backend — armazenar o PDF
- Migration: criar bucket privado `devis-pdfs` no Storage com RLS (só o autor da devis lê; service role escreve)
- O cliente só precisa do link assinado de 30 dias — não vê o bucket diretamente

### 3. Frontend
- **Novo componente** `src/components/devis/SendDevisDialog.tsx`:
  - Campos: Para (pré-preenchido com e-mail do cliente, editável; aceita múltiplos), Assunto (pré-preenchido), Mensagem (textarea editável, 4 idiomas)
  - Preview do link de aceite (`{origin}/aceitar-proposta/{token}`) — visível mas não editável
  - Aviso: *"O link de aceite e o link do PDF serão adicionados automaticamente ao e-mail."*
  - Botão "Enviar agora"
- **Editar `src/lib/exportDevisPdf.ts`**: adicionar `generateDevisPdfBlob(container, fileName): Promise<Blob>` (mesma lógica, retorna Blob em vez de baixar)
- **Editar `src/pages/DevisDetail.tsx`**:
  - Botão verde **"📧 Enviar ao cliente"** ao lado de "Exportar PDF" — visível só quando `status === 'pronta_para_envio'`
  - Handler: renderiza template off-screen → gera Blob do PDF → faz upload pro bucket `devis-pdfs/{devis_id}/{devis_number}.pdf` → cria signed URL (30 dias) → invoca `send-transactional-email` com `templateData: { client_name, devis_number, message_text, accept_url, pdf_url, language }`
  - Em sucesso: registra `devis.sent_at` + muda `status` para `enviada_ao_cliente` + toast + invalidate queries

### 4. Migration
- `ALTER TABLE devis ADD COLUMN sent_at TIMESTAMPTZ NULL`
- Criar bucket `devis-pdfs` (privado) + políticas RLS

## O fluxo do cliente (sem travas)

1. Recebe e-mail bonito, do seu domínio, em qualquer caixa de entrada
2. Vê a mensagem + botão verde **"Aceitar Proposta"** + link **"Baixar PDF"**
3. Clica em "Baixar PDF" → abre o contrato no padrão Lundgaard Jensen
4. Clica em "Aceitar Proposta" → cai na página `/aceitar-proposta/:token` (já existente, sem login)
5. Confirma → status vira `cobranca_pendente`, cobrança 50% e serviço criados (já implementado)

## Arquivos afetados

- **Setup:** infra de e-mails (automático) + bucket Storage
- **Criar:** `supabase/functions/_shared/transactional-email-templates/devis-proposal.tsx`
- **Editar:** `supabase/functions/_shared/transactional-email-templates/registry.ts`
- **Criar:** `src/components/devis/SendDevisDialog.tsx`
- **Editar:** `src/lib/exportDevisPdf.ts` (helper Blob)
- **Editar:** `src/pages/DevisDetail.tsx` (botão + integração)
- **Migration:** `devis.sent_at` + bucket `devis-pdfs` + RLS

## Fora do escopo (futuro)

- Histórico de envios na tela do devis com botão "reenviar"
- Tracking de abertura do e-mail
- Realtime na devis pra atualizar sozinho quando o cliente aceitar (5 min — só pedir se quiser)

Aprove e eu sigo. Primeiro passo após aprovação: abrir o dialog de configuração do domínio remetente.

