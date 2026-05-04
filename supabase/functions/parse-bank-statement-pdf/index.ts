import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Tx {
  date: string;
  description: string;
  amount: number;
  direction: "entrada" | "saida";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { fileBase64, fileName } = await req.json();
    if (!fileBase64 || typeof fileBase64 !== "string") {
      return new Response(
        JSON.stringify({ error: "fileBase64 é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dataUrl = fileBase64.startsWith("data:")
      ? fileBase64
      : `data:application/pdf;base64,${fileBase64}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Você é um extrator de extratos bancários. Receberá um PDF de extrato e deve retornar APENAS as transações usando a ferramenta fornecida. Datas no formato YYYY-MM-DD. Valores sempre positivos com 'direction' indicando 'entrada' (crédito) ou 'saida' (débito). Inclua TODAS as transações, ignorando saldos, totais e cabeçalhos.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Extraia todas as transações do extrato bancário "${fileName ?? "extrato.pdf"}".` },
              { type: "file", file: { filename: fileName ?? "extrato.pdf", file_data: dataUrl } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_transactions",
              description: "Retorna a lista normalizada de transações do extrato.",
              parameters: {
                type: "object",
                properties: {
                  transactions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        date: { type: "string", description: "YYYY-MM-DD" },
                        description: { type: "string" },
                        amount: { type: "number", description: "Valor absoluto, sempre positivo" },
                        direction: { type: "string", enum: ["entrada", "saida"] },
                      },
                      required: ["date", "description", "amount", "direction"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["transactions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_transactions" } },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error", aiResp.status, errText);
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos no workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: `Falha ao analisar PDF: ${errText}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(
        JSON.stringify({ error: "Não foi possível extrair transações do PDF." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let parsed: { transactions: Tx[] };
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Failed to parse tool arguments", e);
      return new Response(
        JSON.stringify({ error: "Resposta da IA inválida." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const transactions = (parsed.transactions ?? []).filter(
      (t) =>
        t &&
        typeof t.date === "string" &&
        typeof t.description === "string" &&
        typeof t.amount === "number" &&
        (t.direction === "entrada" || t.direction === "saida")
    );

    return new Response(
      JSON.stringify({ transactions }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("parse-bank-statement-pdf error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
