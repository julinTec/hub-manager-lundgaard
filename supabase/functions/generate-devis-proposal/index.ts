import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

interface RequestBody {
  meeting_report: string;
  client_name?: string;
  total_amount?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const body = (await req.json()) as RequestBody;
    if (!body?.meeting_report || body.meeting_report.trim().length < 10) {
      return new Response(
        JSON.stringify({ error: "Relatório da reunião muito curto." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const systemPrompt = `Você é um consultor comercial sênior do Lundgaard Hub. Seu trabalho é ler relatórios de reuniões com clientes e propor a estrutura inicial de uma proposta comercial (devis) em português do Brasil. Seja corporativo, claro e conciso. Use linguagem profissional e objetiva. Sempre responda chamando a ferramenta 'sugerir_proposta'.`;

    const userParts: string[] = [];
    if (body.client_name) userParts.push(`Cliente: ${body.client_name}`);
    if (body.total_amount) userParts.push(`Valor estimado: R$ ${body.total_amount}`);
    userParts.push("Relatório da reunião:\n" + body.meeting_report);

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userParts.join("\n\n") },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "sugerir_proposta",
              description: "Retorna sugestões estruturadas para uma proposta comercial baseada no relatório da reunião.",
              parameters: {
                type: "object",
                properties: {
                  service_type: {
                    type: "string",
                    description: "Tipo de serviço a ser prestado (ex: Consultoria estratégica, Desenvolvimento de software, Auditoria fiscal).",
                  },
                  responsible_sector: {
                    type: "string",
                    description: "Setor interno responsável pela execução (ex: Engenharia, Consultoria, TI, Jurídico, Financeiro).",
                  },
                  scope_description: {
                    type: "string",
                    description: "Descrição detalhada do escopo do trabalho em markdown, com bullets e parágrafos curtos.",
                  },
                  proposal_structure: {
                    type: "string",
                    description: "Estrutura completa da proposta em markdown, contendo seções: ## Objetivo, ## Escopo, ## Entregáveis, ## Cronograma, ## Investimento.",
                  },
                },
                required: ["service_type", "responsible_sector", "scope_description", "proposal_structure"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "sugerir_proposta" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos no workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return new Response(
        JSON.stringify({ error: "Falha ao chamar a IA." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await aiResp.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(
        JSON.stringify({ error: "Resposta da IA inválida." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const suggestions = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-devis-proposal error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
