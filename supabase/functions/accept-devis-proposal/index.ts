import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const action = url.searchParams.get("action") ?? "accept";

    if (!token || !UUID_RE.test(token)) {
      return json({ error: "Token inválido" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: devis, error: fetchErr } = await supabase
      .from("devis")
      .select(
        "id, title, reference_number, total_amount, down_payment_amount, deadline_date, scope_description, proposal_structure, accepted_at, rejected_at, status, sent_at, client_id, business_unit, initial_charge_generated",
      )
      .eq("accept_token", token)
      .maybeSingle();

    if (fetchErr) {
      console.error("fetch error", fetchErr);
      return json({ error: "Erro ao buscar proposta" }, 500);
    }
    if (!devis) return json({ error: "Proposta não encontrada" }, 404);

    let clientName: string | null = null;
    if (devis.client_id) {
      const { data: c } = await supabase
        .from("clients")
        .select("name")
        .eq("id", devis.client_id)
        .maybeSingle();
      clientName = c?.name ?? null;
    }

    const preview = {
      title: devis.title,
      client_name: clientName,
      total_amount: devis.total_amount,
      down_payment_amount: devis.down_payment_amount,
      deadline_date: devis.deadline_date,
      scope_description: devis.scope_description,
      proposal_structure: devis.proposal_structure,
      accepted_at: devis.accepted_at,
      rejected_at: (devis as any).rejected_at ?? null,
    };

    if (req.method === "GET") return json(preview);

    if (req.method !== "POST") return json({ error: "Método não suportado" }, 405);

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      null;

    // ============ REJEIÇÃO ============
    if (action === "reject") {
      if (devis.accepted_at) {
        return json({ ...preview, already_accepted: true });
      }
      if ((devis as any).rejected_at) {
        return json({ ...preview, already_rejected: true });
      }

      let reason: string | null = null;
      try {
        const body = await req.json().catch(() => ({}));
        if (body && typeof body.reason === "string") {
          reason = body.reason.slice(0, 1000);
        }
      } catch { /* ignore */ }

      const { data: updated, error: upErr } = await supabase
        .from("devis")
        .update({
          rejected_at: new Date().toISOString(),
          rejected_ip: ip,
          status: "rejeitada",
        } as any)
        .eq("id", devis.id)
        .is("accepted_at", null)
        .is("rejected_at" as any, null)
        .select("rejected_at")
        .maybeSingle();

      if (upErr) {
        console.error("reject update error", upErr);
        return json({ error: "Não foi possível registrar a recusa" }, 500);
      }
      if (!updated) {
        return json({ ...preview, already_rejected: true });
      }

      await supabase.from("audit_logs").insert({
        action: "devis_rejected_by_client",
        entity_type: "devis",
        entity_id: devis.id,
        details: { rejected_at: (updated as any).rejected_at, rejected_ip: ip, reason, client_name: clientName },
      });

      return json({
        ...preview,
        rejected_at: (updated as any).rejected_at,
        rejected: true,
      });
    }

    // ============ ACEITE ============
    if (devis.accepted_at) {
      return json({ ...preview, already_accepted: true, charge_created: false });
    }
    if ((devis as any).rejected_at) {
      return json({ ...preview, already_rejected: true });
    }

    const { data: updated, error: upErr } = await supabase
      .from("devis")
      .update({
        accepted_at: new Date().toISOString(),
        accepted_ip: ip,
        status: "aceita",
        initial_charge_generated: true,
      })
      .eq("id", devis.id)
      .is("accepted_at", null)
      .select("accepted_at")
      .maybeSingle();

    if (upErr) {
      console.error("update error", upErr);
      return json({ error: "Não foi possível registrar o aceite" }, 500);
    }

    if (!updated) {
      return json({ ...preview, already_accepted: true, charge_created: false });
    }

    const total = Number(devis.total_amount) || 0;
    const chargeAmount = Number(devis.down_payment_amount) > 0
      ? Number(devis.down_payment_amount)
      : total * 0.5;

    const today = new Date();
    const todayISO = today.toISOString().slice(0, 10);
    const competence = todayISO.slice(0, 7);

    const refLabel = devis.reference_number ? `#${devis.reference_number}` : `#${devis.id.slice(0, 8)}`;
    const description = `Cobrança inicial 50% — Devis ${refLabel} — ${devis.title}`;

    const { data: feRow, error: feErr } = await supabase
      .from("financial_entries")
      .insert({
        entry_date: todayISO,
        amount_in: chargeAmount,
        amount_out: 0,
        entry_type: "receita",
        counterparty_name: clientName,
        movement_description: description,
        business_unit: devis.business_unit,
        competence_month: competence,
        source_type: "manual",
        conciliation_status: "pendente",
        document_reference: devis.reference_number ?? devis.id,
      })
      .select("id")
      .maybeSingle();

    if (feErr) {
      console.error("financial_entries insert error", feErr);
    }

    let serviceId: string | null = null;
    let serviceCreated = false;

    const { data: existingService } = await supabase
      .from("services")
      .select("id")
      .eq("devis_id", devis.id)
      .maybeSingle();

    if (existingService) {
      serviceId = existingService.id;
    } else {
      const { data: devisFull } = await supabase
        .from("devis")
        .select("responsible_sector")
        .eq("id", devis.id)
        .maybeSingle();

      const { data: svcRow, error: svcErr } = await supabase
        .from("services")
        .insert({
          devis_id: devis.id,
          client_id: devis.client_id,
          title: devis.title,
          description: devis.scope_description,
          business_unit: devis.business_unit,
          status: "a_iniciar",
          expected_end_date: devis.deadline_date,
          responsible_sector: devisFull?.responsible_sector ?? null,
        })
        .select("id")
        .maybeSingle();

      if (svcErr) {
        console.error("services insert error", svcErr);
      } else {
        serviceId = svcRow?.id ?? null;
        serviceCreated = true;
      }
    }

    await supabase.from("audit_logs").insert({
      action: "devis_accepted_charge_created",
      entity_type: "devis",
      entity_id: devis.id,
      details: {
        accepted_at: updated.accepted_at,
        accepted_ip: ip,
        charge_amount: chargeAmount,
        financial_entry_id: feRow?.id ?? null,
        service_id: serviceId,
        service_created: serviceCreated,
        client_name: clientName,
      },
    });

    return json({
      ...preview,
      accepted_at: updated.accepted_at,
      charge_created: !feErr,
      charge_amount: chargeAmount,
      service_id: serviceId,
      service_created: serviceCreated,
    });
  } catch (e) {
    console.error("unexpected", e);
    return json({ error: "Erro interno" }, 500);
  }
});
