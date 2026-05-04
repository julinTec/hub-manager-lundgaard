import {
  authenticate,
  corsHeaders,
  getServiceClient,
  jsonResponse,
} from "../_shared/bi-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);

  const auth = await authenticate(req, "operacao");
  if (!auth.ok) return auth.response;

  const supabase = getServiceClient();
  const { data: services, error } = await supabase
    .from("services")
    .select("status, business_unit, responsible_sector, start_date, expected_end_date, actual_end_date, created_at");
  if (error) return jsonResponse({ error: error.message }, 500);

  const today = new Date().toISOString().slice(0, 10);
  const byStatus: Record<string, number> = {};
  const bySector: Record<string, { total: number; concluidos: number; atrasados: number }> = {};
  let overdue = 0;
  let leadTimeSum = 0;
  let leadTimeCount = 0;

  for (const s of services ?? []) {
    const st = s.status ?? "—";
    byStatus[st] = (byStatus[st] ?? 0) + 1;

    const sec = s.responsible_sector ?? "—";
    bySector[sec] ??= { total: 0, concluidos: 0, atrasados: 0 };
    bySector[sec].total += 1;
    if (st === "concluido") bySector[sec].concluidos += 1;

    const isOverdue =
      s.expected_end_date &&
      s.expected_end_date < today &&
      st !== "concluido" &&
      st !== "cancelado";
    if (isOverdue) {
      overdue += 1;
      bySector[sec].atrasados += 1;
    }

    if (s.start_date && s.actual_end_date) {
      const d1 = new Date(s.start_date).getTime();
      const d2 = new Date(s.actual_end_date).getTime();
      if (d2 >= d1) {
        leadTimeSum += (d2 - d1) / (1000 * 60 * 60 * 24);
        leadTimeCount += 1;
      }
    }
  }

  return jsonResponse({
    data: {
      totals: {
        services: services?.length ?? 0,
        overdue,
        avg_lead_time_days: leadTimeCount > 0 ? leadTimeSum / leadTimeCount : 0,
      },
      by_status: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
      by_sector: Object.entries(bySector).map(([sector, v]) => ({ sector, ...v })),
    },
    meta: { generated_at: new Date().toISOString() },
  });
});
