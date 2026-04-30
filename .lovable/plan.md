## Objetivo
Continuar usando o Resend em **modo sandbox**, apenas atualizando a API key para a nova fornecida.

## O que será feito

### 1. Atualizar o secret `RESEND_API_KEY`
- Substituir o valor atual pelo novo: `re_JEytbRvb_GYsWkWwFYApgXSDHYja5oVWW`.
- A função `send-devis-proposal` já lê esse secret via `Deno.env.get("RESEND_API_KEY")` — nenhuma mudança de código necessária.

### 2. Manter o remetente sandbox
- O `from` em `supabase/functions/send-devis-proposal/index.ts` permanece como `Lundgaard Jensen <onboarding@resend.dev>`.
- O aviso amarelo "Modo de teste do Resend" no diálogo de envio (`SendDevisDialog.tsx`) também é mantido, pois continua válido.

## ⚠️ Limitações importantes do modo sandbox (não mudam com a nova key)

Enquanto estiver em sandbox, o Resend **só entrega para o e-mail do dono da conta Resend** (o e-mail usado para criar a conta onde essa API key foi gerada). Qualquer envio para outros destinatários retorna erro 403.

Isso significa:
- ✅ Você consegue testar o fluxo completo enviando para o **seu próprio e-mail** (o cadastrado na conta Resend).
- ❌ Não dá para enviar propostas para clientes reais ainda.
- Para liberar envio a clientes, será necessário verificar um domínio em `resend.com/domains` depois — mas isso fica para quando você quiser dar esse passo.

## Bug paralelo (não incluído neste plano)
No template do email, o botão **Recusar** aponta para a mesma URL do **Aceitar**. Fica registrado para tratarmos em uma próxima rodada, se quiser.

## Próximo passo
Vou solicitar a atualização do secret `RESEND_API_KEY` na Cloud assim que esse plano for aprovado.