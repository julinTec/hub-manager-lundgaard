import {
  authenticate,
  corsHeaders,
  getServiceClient,
  jsonResponse,
  parsePagination,
} from "../_shared/bi-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await authenticate(req, "operacao");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const { page, pageSize, from, to } = parsePagination(url);
  const supabase = getServiceClient();

  let q = supabase
    .from("services")
    .select(
      "id, devis_id, client_id, title, status, start_date, expected_end_date, actual_end_date, business_unit, responsible_sector, assigned_to, final_charge_generated, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });
  if (from) q = q.gte("created_at", from);
  if (to) q = q.lte("created_at", `${to}T23:59:59`);

  const { data, error, count } = await q.range((page - 1) * pageSize, page * pageSize - 1);
  if (error) return jsonResponse({ error: error.message }, 500);

  return jsonResponse({
    data,
    meta: { page, page_size: pageSize, total: count ?? 0, generated_at: new Date().toISOString() },
  });
});
