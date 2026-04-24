

# Implementação: Envio de proposta via Resend (conector nativo)

Ajuste no plano: vamos usar o **conector Resend** do Lovable em vez de secret manual — mais seguro e é o padrão recomendado.

## Passo 0 — Segurança (faça agora)

1. Acesse resend.com/api-keys
2. **Revogue** a key `re_jQ1DP3MN_…` (já está exposta neste chat)
3. Quando eu abrir o conector, você cria/cola uma key nova num campo seguro

## Passo 1 — Conectar o Resend (eu abro o dialog)

Abro o `connect` do conector Resend. Você:
- Cria conta gratuita em resend.com (se ainda não tem)
- Gera uma API key nova
- Cola no dialog do conector (campo seguro, não fica no chat)

A chave fica disponível como `RESEND_API_KEY` nas edge functions, roteada via `https://connector-gateway.lovable.dev/resend`.

## Limitação do remetente provisório

Sem domínio verificado, o Resend opera em **modo de teste**:
- E-mail sai de `onboarding@resend.dev`
- **Só consegue enviar para o e-mail cadastrado na sua conta Resend** (geralmente o seu próprio)
- Para clientes reais → precisa verificar um domínio depois

Bom pra validar o fluxo agora; quando tiver domínio, troca o `from` em 1 linha.

## Implementação

### Migration
- `ALTER TABLE devis ADD COLUMN sent_at TIMESTAMPTZ NULL` (se ainda não existir)

### Edge function `send-devis-proposal`
- Valida JWT do usuário interno
- Recebe: `devis_id`, `to[]`, `subject`, `message_text`, `pdf_base64`, `pdf_filename`, `accept_url`, `client_name`, `devis_number`, `language`
- Validação Zod de todos os campos
- Monta HTML do e-mail:
  - Cabeçalho Lundgaard Jensen
  - Mensagem (vinda do dialog, escapada)
  - **Botão verde grande "Aceitar Proposta"** linkando pro `accept_url`
  - Rodapé com endereço/contatos
- Envia via gateway Resend (`POST /emails`) com:
  - `from: "Lundgaard Jensen <onboarding@resend.dev>"`
  - `to`, `subject`, `html`, `text` (fallback)
  - `attachments: [{ filename, content: pdf_base64 }]`
- Em sucesso: `UPDATE devis SET sent_at = now(), status = 'enviada_ao_cliente' WHERE id = devis_id`
- Insere linha em `audit_logs` com ação `devis_email_sent`
- Retorna `{ success, message_id }` ou erro detalhado (incluindo o caso "modo de teste, destinatário não permitido" com instrução clara)

### Frontend — `src/lib/exportDevisPdf.ts`
- Adicionar `generateDevisPdfBase64(container, fileName): Promise<{ base64, filename }>` (mesma lógica do export, retorna base64)

### Frontend — `src/components/devis/SendDevisDialog.tsx` (novo)
- **Para** (pré-preenchido com `client.email`, editável; aceita múltiplos separados por vírgula)
- **Assunto** (pré-preenchido: `Proposta {devis_number} — Lundgaard Jensen`)
- **Mensagem** (textarea editável, texto padrão por idioma PT/FR/EN/ES detectado do `proposal_structure`)
- **Preview do link de aceite** (`{origin}/aceitar-proposta/{token}`) — visível, não editável
- Aviso amarelo: *"Modo de teste do Resend: só envia para o e-mail cadastrado na sua conta Resend. Para clientes reais, verifique um domínio em resend.com/domains."*
- Botão "Enviar agora" → renderiza PDF off-screen → base64 → invoca `send-devis-proposal`

### Frontend — `src/pages/DevisDetail.tsx`
- Botão verde **"📧 Enviar ao cliente"** ao lado de "Exportar PDF"
- Visível só quando `status === 'pronta_para_envio'`
- Abre `SendDevisDialog`
- Em sucesso: toast + `queryClient.invalidateQueries(['devis', id])` (status atualiza pra "Enviada ao cliente")

### Texto padrão (4 idiomas)

```
Prezado(a) {client_name},

Conforme conversado, segue em anexo a proposta {devis_number} da
Lundgaard Jensen Advocacia e Consultoria Internacional.

Para aceitar a proposta de forma rápida e segura, clique no botão
"Aceitar Proposta" abaixo.

Permanecemos à disposição.

Atenciosamente,
Equipe Lundgaard Jensen
```

(Equivalentes em FR / EN / ES.)

## Fluxo do cliente (sem travas — já funciona)

1. Recebe e-mail com PDF anexo + botão verde "Aceitar Proposta"
2. Clica no botão → cai em `/aceitar-proposta/:token` (página pública existente)
3. Confirma → status vira `cobranca_pendente`, cobrança 50% e serviço criados automaticamente

## Arquivos afetados

- **Conectar:** Resend (conector nativo, via dialog)
- **Migration:** `devis.sent_at` (se necessário)
- **Criar:** `supabase/functions/send-devis-proposal/index.ts`
- **Criar:** `src/components/devis/SendDevisDialog.tsx`
- **Editar:** `src/lib/exportDevisPdf.ts` (helper base64)
- **Editar:** `src/pages/DevisDetail.tsx` (botão + integração)

## Próximos passos após aprovar

1. Você revoga a key exposta em resend.com/api-keys
2. Eu abro o dialog do conector Resend
3. Você cria/cola uma key nova no campo seguro
4. Eu sigo com toda a implementação automaticamente

## Evolução futura (quando tiver domínio)

Trocar `from: "onboarding@resend.dev"` por `from: "noreply@seudominio.com"` — 1 linha, zero mudança no resto.

