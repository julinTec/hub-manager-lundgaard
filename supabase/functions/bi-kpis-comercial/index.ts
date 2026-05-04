import {
  authenticate,
  corsHeaders,
  getServiceClient,
  jsonResponse,
} from "../_shared/bi-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await authenticate(req, "comercial");
  if (!auth.ok) return auth.response;

  const supabase = getServiceClient();
  const { data: devis, error } = await supabase
    .from("devis")
    .select("id, status, total_amount, commercial_responsible, created_at, accepted_at");
  if (error) return jsonResponse({ error: error.message }, 500);

  const total = devis?.length ?? 0;
  const accepted = (devis ?? []).filter((d) => d.status === "aceita" || d.accepted_at);
  const rejected = (devis ?? []).filter((d) => d.status === "recusada");
  const totalAmount = (devis ?? []).reduce((s, d) => s + Number(d.total_amount ?? 0), 0);
  const acceptedAmount = accepted.reduce((s, d) => s + Number(d.total_amount ?? 0), 0);
  const acceptanceRate = total > 0 ? accepted.length / total : 0;
  const avgTicket = total > 0 ? totalAmount / total : 0;

  // Por mês
  const byMonth: Record<string, { count: number; amount: number; accepted: number }> = {};
  for (const d of devis ?? []) {
    const ym = (d.created_at ?? "").slice(0, 7);
    if (!ym) continue;
    byMonth[ym] ??= { count: 0, amount: 0, accepted: 0 };
    byMonth[ym].count += 1;
    byMonth[ym].amount += Number(d.total_amount ?? 0);
    if (d.status === "aceita" || d.accepted_at) byMonth[ym].accepted += 1;
  }

  // Ranking por responsável
  const byResp: Record<string, { count: number; amount: number; accepted: number }> = {};
  for (const d of devis ?? []) {
    const k = d.commercial_responsible ?? "sem_responsavel";
    byResp[k] ??= { count: 0, amount: 0, accepted: 0 };
    byResp[k].count += 1;
    byResp[k].amount += Number(d.total_amount ?? 0);
    if (d.status === "aceita" || d.accepted_at) byResp[k].accepted += 1;
  }

  return jsonResponse({
    data: {
      totals: {
        proposals: total,
        accepted: accepted.length,
        rejected: rejected.length,
        total_amount: totalAmount,
        accepted_amount: acceptedAmount,
        avg_ticket: avgTicket,
        acceptance_rate: acceptanceRate,
      },
      by_month: Object.entries(byMonth)
        .map(([month, v]) => ({ month, ...v }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      by_responsible: Object.entries(byResp).map(([commercial_responsible, v]) => ({
        commercial_responsible,
        ...v,
      })),
    },
    meta: { generated_at: new Date().toISOString() },
  });
});
