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

  const auth = await authenticate(req, "financeiro");
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const { page, pageSize, from, to } = parsePagination(url);
  const dataset = url.searchParams.get("dataset") ?? "entries"; // entries | bank_statement
  const supabase = getServiceClient();

  if (dataset === "bank_statement") {
    let q = supabase
      .from("bank_statement_entries")
      .select(
        "id, bank_account_id, transaction_date, document_number, description, amount, direction, conciliation_status, import_batch_id, created_at",
        { count: "exact" },
      )
      .order("transaction_date", { ascending: false });
    if (from) q = q.gte("transaction_date", from);
    if (to) q = q.lte("transaction_date", to);
    const { data, error, count } = await q.range((page - 1) * pageSize, page * pageSize - 1);
    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({
      data,
      meta: { page, page_size: pageSize, total: count ?? 0, dataset, generated_at: new Date().toISOString() },
    });
  }

  let q = supabase
    .from("financial_entries")
    .select(
      "id, entry_date, competence_month, business_unit, movement_account, movement_description, counterparty_name, amount_in, amount_out, amount_signed, entry_type, source_type, conciliation_status, document_reference, bank_account_id, created_at",
      { count: "exact" },
    )
    .order("entry_date", { ascending: false });
  if (from) q = q.gte("entry_date", from);
  if (to) q = q.lte("entry_date", to);

  const { data, error, count } = await q.range((page - 1) * pageSize, page * pageSize - 1);
  if (error) return jsonResponse({ error: error.message }, 500);

  return jsonResponse({
    data,
    meta: { page, page_size: pageSize, total: count ?? 0, dataset: "entries", generated_at: new Date().toISOString() },
  });
});
