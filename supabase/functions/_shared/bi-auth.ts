// Helper compartilhado para autenticação das APIs de BI via x-api-key
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function authenticate(
  req: Request,
  requiredScope: "comercial" | "financeiro" | "operacao",
): Promise<
  | { ok: true; key: { id: string; name: string; scopes: string[] } }
  | { ok: false; response: Response }
> {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "Missing x-api-key header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      ),
    };
  }
  const hash = await sha256Hex(apiKey);
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("validate_api_key", { _key_hash: hash });
  if (error || !data || data.length === 0) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Invalid or revoked API key" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }
  const key = data[0];
  if (!key.scopes.includes(requiredScope)) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: `Key lacks required scope: ${requiredScope}` }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      ),
    };
  }
  return { ok: true, key };
}

export function parsePagination(url: URL) {
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    1000,
    Math.max(1, parseInt(url.searchParams.get("page_size") ?? "500", 10) || 500),
  );
  const from = url.searchParams.get("from"); // YYYY-MM-DD
  const to = url.searchParams.get("to");
  return { page, pageSize, from, to };
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
