// Edge function: analyze-meeting-report
// Receives a meeting minutes file (PDF/DOCX/TXT) in PT/FR/EN/ES, extracts
// client + structured Devis data via Lovable AI, mirroring the Lundgaard
// Jensen contract template (DE202511065).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.split(",")[1] : b64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function extractText(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
): Promise<string> {
  const lowerName = (fileName || "").toLowerCase();
  const isPdf = mimeType === "application/pdf" || lowerName.endsWith(".pdf");
  const isDocx =
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx");
  const isTxt = mimeType.startsWith("text/") || lowerName.endsWith(".txt");

  if (isTxt) {
    return new TextDecoder().decode(bytes);
  }

  if (isDocx) {
    // mammoth converts DOCX to plain text
    const mammothMod: any = await import("https://esm.sh/mammoth@1.8.0?target=denonext");
    const mammoth = mammothMod.default ?? mammothMod;
    const result = await mammoth.extractRawText({ arrayBuffer: bytes.buffer });
    return result?.value ?? "";
  }

  if (isPdf) {
    // unpdf is a Deno-friendly PDF text extractor
    const { extractText: extractPdfText, getDocumentProxy } = await import(
      "https://esm.sh/unpdf@0.12.1?target=denonext"
    );
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractPdfText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : String(text ?? "");
  }

  // Fallback: try as text
  try {
    return new TextDecoder().decode(bytes);
  } catch {
    throw new Error(`Formato de arquivo não suportado: ${mimeType || fileName}`);
  }
}

const SYSTEM_PROMPT = `You are a senior legal-commercial assistant for "Lundgaard Jensen Advocacia".
You receive raw meeting-minutes / consultation notes (Ata de reunião) in Portuguese, French, English or Spanish.

Your job:
1. Detect the source language (one of: pt, fr, en, es).
2. Extract client identification data when present (name, email, phone, CPF/CNPJ or other ID, type PF or PJ, address, city). When absent, leave empty strings.
3. Build a Devis (legal services proposal) following the Lundgaard Jensen contract template, IN THE SAME LANGUAGE as the source document. Translate section titles to that language but ALWAYS use this structure:

  I. Identification of the Parties
  II. Object of the Contract (general description)
     Scope of Services (items A, B, C... each with a title, description and amount in BRL)
  III. Fees (Total + 50% down payment)
  IV. Deadline

4. Each scope item should reflect a distinct deliverable mentioned in the meeting (e.g. apostille, registration, urbanism analysis, due diligence, etc.). If amounts are mentioned in the text, use them. If not, leave amounts at 0 and let the human fill in.
5. proposal_structure must be a complete markdown rendering of the contract draft, with section titles in the detected language and item letters A), B), C)...
6. scope_description is a short markdown summary of the scope (1-3 paragraphs).
7. service_type is a short label (e.g. "Consultoria jurídica imobiliária", "Conseil juridique immobilier").
8. responsible_sector is the internal sector that should handle it (e.g. "Imobiliário", "Societário", "Litigation").
9. total_amount = sum of all scope_items.amount.
10. deadline_date: ISO date if a deadline is mentioned, else null.

NEVER invent client data that is not in the document. Empty string is better than a guess.
ALWAYS call the tool extract_meeting_data exactly once with the structured result.`;

const TOOL = {
  type: "function",
  function: {
    name: "extract_meeting_data",
    description:
      "Return structured client + devis data extracted from the meeting minutes.",
    parameters: {
      type: "object",
      properties: {
        detected_language: { type: "string", enum: ["pt", "fr", "en", "es"] },
        client: {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
            document: { type: "string" },
            type: { type: "string", enum: ["PF", "PJ", ""] },
            address: { type: "string" },
            city: { type: "string" },
            notes: { type: "string" },
          },
          required: ["name", "email", "phone", "document", "type", "address", "city", "notes"],
          additionalProperties: false,
        },
        meeting: {
          type: "object",
          properties: {
            date: { type: "string", description: "YYYY-MM-DD or empty" },
            summary: { type: "string" },
            report: { type: "string" },
          },
          required: ["date", "summary", "report"],
          additionalProperties: false,
        },
        devis: {
          type: "object",
          properties: {
            title: { type: "string" },
            service_type: { type: "string" },
            responsible_sector: { type: "string" },
            scope_description: { type: "string" },
            proposal_structure: { type: "string" },
            scope_items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  letter: { type: "string" },
                  title: { type: "string" },
                  description: { type: "string" },
                  amount: { type: "number" },
                },
                required: ["letter", "title", "description", "amount"],
                additionalProperties: false,
              },
            },
            total_amount: { type: "number" },
            deadline_date: { type: "string", description: "YYYY-MM-DD or empty" },
          },
          required: [
            "title",
            "service_type",
            "responsible_sector",
            "scope_description",
            "proposal_structure",
            "scope_items",
            "total_amount",
            "deadline_date",
          ],
          additionalProperties: false,
        },
      },
      required: ["detected_language", "client", "meeting", "devis"],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { file_base64, file_name, mime_type, language_hint } = await req.json();
    if (!file_base64 || !file_name) {
      return new Response(
        JSON.stringify({ error: "file_base64 and file_name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const bytes = b64ToBytes(file_base64);
    let extracted = "";
    try {
      extracted = await extractText(bytes, file_name, mime_type || "");
    } catch (e) {
      console.error("extractText failed:", e);
      return new Response(
        JSON.stringify({
          error: `Falha ao extrair texto do arquivo: ${e instanceof Error ? e.message : String(e)}`,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    extracted = (extracted || "").trim();
    if (extracted.length < 20) {
      return new Response(
        JSON.stringify({
          error:
            "Não foi possível extrair texto suficiente do documento. Se for um PDF escaneado, envie versão com texto nativo ou cole o conteúdo manualmente.",
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Truncate very long documents
    const MAX = 60000;
    if (extracted.length > MAX) extracted = extracted.slice(0, MAX);

    const userPrompt = `${
      language_hint && language_hint !== "auto"
        ? `Language hint from user: ${language_hint}\n\n`
        : ""
    }Meeting minutes / consultation notes:\n\n${extracted}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "extract_meeting_data" } },
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error("AI gateway error", aiResp.status, txt);
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit excedido. Tente novamente em instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({
            error:
              "Créditos da IA esgotados. Adicione fundos em Settings → Workspace → Usage.",
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "Erro na IA: " + txt }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("No tool call in AI response", JSON.stringify(aiJson).slice(0, 500));
      return new Response(
        JSON.stringify({ error: "IA não retornou dados estruturados." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "Falha ao parsear resposta da IA." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ data: parsed, raw_text_excerpt: extracted.slice(0, 4000) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("analyze-meeting-report error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
