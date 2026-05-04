import {
  authenticate,
  corsHeaders,
  getServiceClient,
  jsonResponse,
} from "../_shared/bi-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await authenticate(req, "financeiro");
  if (!auth.ok) return auth.response;

  const supabase = getServiceClient();
  const { data: entries, error } = await supabase
    .from("financial_entries")
    .select("entry_date, business_unit, counterparty_name, amount_in, amount_out, conciliation_status");
  if (error) return jsonResponse({ error: error.message }, 500);

  const conc = (entries ?? []).filter((e) => e.conciliation_status === "conciliado");
  const pend = (entries ?? []).filter((e) => e.conciliation_status === "pendente");

  const totalIn = conc.reduce((s, e) => s + Number(e.amount_in ?? 0), 0);
  const totalOut = conc.reduce((s, e) => s + Number(e.amount_out ?? 0), 0);
  const pendingIn = pend.reduce((s, e) => s + Number(e.amount_in ?? 0), 0);
  const pendingOut = pend.reduce((s, e) => s + Number(e.amount_out ?? 0), 0);

  const byMonth: Record<string, { in: number; out: number; pending_in: number }> = {};
  for (const e of entries ?? []) {
    const ym = (e.entry_date ?? "").slice(0, 7);
    if (!ym) continue;
    byMonth[ym] ??= { in: 0, out: 0, pending_in: 0 };
    if (e.conciliation_status === "conciliado") {
      byMonth[ym].in += Number(e.amount_in ?? 0);
      byMonth[ym].out += Number(e.amount_out ?? 0);
    } else if (e.conciliation_status === "pendente") {
      byMonth[ym].pending_in += Number(e.amount_in ?? 0);
    }
  }

  const byCounterparty: Record<string, { in: number; out: number }> = {};
  for (const e of conc) {
    const k = e.counterparty_name ?? "—";
    byCounterparty[k] ??= { in: 0, out: 0 };
    byCounterparty[k].in += Number(e.amount_in ?? 0);
    byCounterparty[k].out += Number(e.amount_out ?? 0);
  }

  return jsonResponse({
    data: {
      totals: {
        total_in: totalIn,
        total_out: totalOut,
        balance: totalIn - totalOut,
        pending_in: pendingIn,
        pending_out: pendingOut,
      },
      by_month: Object.entries(byMonth)
        .map(([month, v]) => ({ month, ...v }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      top_counterparties: Object.entries(byCounterparty)
        .map(([counterparty, v]) => ({ counterparty, ...v }))
        .sort((a, b) => b.in + b.out - (a.in + a.out))
        .slice(0, 20),
    },
    meta: { generated_at: new Date().toISOString() },
  });
});
