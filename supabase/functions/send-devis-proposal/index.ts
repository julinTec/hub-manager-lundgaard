import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/resend";

const BodySchema = z.object({
  devis_id: z.string().uuid(),
  to: z.array(z.string().email()).min(1).max(10),
  subject: z.string().min(1).max(300),
  message_text: z.string().min(1).max(5000),
  pdf_base64: z.string().min(100),
  pdf_filename: z.string().min(1).max(200),
  accept_url: z.string().url(),
  client_name: z.string().min(1).max(200),
  devis_number: z.string().min(1).max(50),
  language: z.enum(["pt", "fr", "en", "es"]).default("pt"),
});

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const ACCEPT_LABEL: Record<string, string> = {
  pt: "Aceitar Proposta",
  fr: "Accepter la Proposition",
  en: "Accept Proposal",
  es: "Aceptar la Propuesta",
};

const REJECT_LABEL: Record<string, string> = {
  pt: "Recusar",
  fr: "Refuser",
  en: "Decline",
  es: "Rechazar",
};

const HELPER_LABEL: Record<string, string> = {
  pt: "Você pode aceitar ou recusar a proposta clicando nos botões abaixo.",
  fr: "Vous pouvez accepter ou refuser la proposition en cliquant sur les boutons ci-dessous.",
  en: "You can accept or decline the proposal by clicking the buttons below.",
  es: "Puede aceptar o rechazar la propuesta haciendo clic en los botones a continuación.",
};

function buildHtml(message_text: string, accept_url: string, language: string) {
  const safeMsg = escapeHtml(message_text).replace(/\n/g, "<br/>");
  const accept = ACCEPT_LABEL[language] || ACCEPT_LABEL.pt;
  const reject = REJECT_LABEL[language] || REJECT_LABEL.pt;
  const helper = HELPER_LABEL[language] || HELPER_LABEL.pt;
  return `<!doctype html>
<html><body style="margin:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#222">
  <div style="max-width:620px;margin:0 auto;background:#ffffff;padding:32px 28px">
    <div style="border-bottom:3px solid #B8860B;padding-bottom:16px;margin-bottom:24px">
      <div style="font-size:20px;font-weight:bold;letter-spacing:1px;color:#0a0a0a">LUNDGAARD JENSEN</div>
      <div style="font-size:11px;color:#666;letter-spacing:2px">ADVOCACIA &amp; CONSULTORIA INTERNACIONAL</div>
    </div>
    <div style="font-size:14px;line-height:1.6;color:#333">${safeMsg}</div>
    <p style="font-size:13px;color:#555;text-align:center;margin:28px 0 12px">${helper}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 8px">
      <tr>
        <td style="padding:0 8px">
          <a href="${accept_url}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:bold;padding:14px 28px;border-radius:6px;font-size:15px">${accept}</a>
        </td>
        <td style="padding:0 8px">
          <a href="${accept_url}" style="display:inline-block;background:#ffffff;color:#b91c1c;border:1.5px solid #b91c1c;text-decoration:none;font-weight:bold;padding:13px 26px;border-radius:6px;font-size:15px">${reject}</a>
        </td>
      </tr>
    </table>
    <div style="font-size:11px;color:#888;margin-top:32px;border-top:1px solid #eee;padding-top:16px;line-height:1.5">
      Rua João Cordeiro, 831 – Praia de Iracema<br/>
      +55 (85) 9 9406-6042 &nbsp;|&nbsp; +55 (85) 9 3037-9931<br/>
      lundgaardjensen.com &nbsp;|&nbsp; @lundgaard.jensen
    </div>
  </div>
</body></html>`;
}

function buildText(message_text: string, accept_url: string, language: string) {
  const accept = ACCEPT_LABEL[language] || ACCEPT_LABEL.pt;
  const reject = REJECT_LABEL[language] || REJECT_LABEL.pt;
  const helper = HELPER_LABEL[language] || HELPER_LABEL.pt;
  return `${message_text}\n\n${helper}\n${accept} / ${reject}: ${accept_url}\n\n--\nLundgaard Jensen Advocacia & Consultoria Internacional\nRua João Cordeiro, 831 – Praia de Iracema\n+55 (85) 9 9406-6042 | +55 (85) 9 3037-9931`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) throw new Error("Supabase env not configured");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

    // Auth
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = userData.user;

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = parsed.data;

    const html = buildHtml(body.message_text, body.accept_url, body.language);
    const text = buildText(body.message_text, body.accept_url, body.language);

    const resendRes = await fetch(`${GATEWAY_URL}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Lundgaard Jensen <onboarding@resend.dev>",
        to: body.to,
        subject: body.subject,
        html,
        text,
        attachments: [{ filename: body.pdf_filename, content: body.pdf_base64 }],
      }),
    });

    const resendJson = await resendRes.json().catch(() => ({}));
    if (!resendRes.ok) {
      const msg = (resendJson as any)?.message || JSON.stringify(resendJson);
      // Caso típico do modo de teste do Resend
      if (resendRes.status === 403 && /testing emails|verify a domain|own email/i.test(msg)) {
        return new Response(
          JSON.stringify({
            error:
              "Modo de teste do Resend: só é possível enviar para o e-mail cadastrado na sua conta Resend. Verifique um domínio em resend.com/domains para enviar a clientes reais.",
            details: msg,
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Resend [${resendRes.status}]: ${msg}`);
    }

    const messageId = (resendJson as any)?.id ?? null;

    // Atualiza devis + audit (service role)
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    await admin
      .from("devis")
      .update({ sent_at: new Date().toISOString(), status: "enviada_ao_cliente" as any })
      .eq("id", body.devis_id);

    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "devis_email_sent",
      entity_type: "devis",
      entity_id: body.devis_id,
      details: { to: body.to, message_id: messageId, devis_number: body.devis_number },
    });

    return new Response(JSON.stringify({ success: true, message_id: messageId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("send-devis-proposal error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
