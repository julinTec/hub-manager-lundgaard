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

// ---------- Utilities ----------
function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.split(",")[1] : b64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function brToNumber(s: string): number {
  // "1.234,56" -> 1234.56
  return parseFloat(s.replace(/\./g, "").replace(",", "."));
}

function ddmmyyyyToISO(d: string): string | null {
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// ---------- Manual parsers (fallback) ----------
const IGNORE_KEYWORDS = [
  "saldo anterior",
  "s a l d o",
  "saldo do dia",
  "saldo final",
  "saldo do periodo",
  "saldo do período",
  "total ",
  "cod. lanc",
  "código de lanc",
  "rentab.invest",
  "rentab invest",
];

function shouldIgnoreLine(line: string): boolean {
  const lc = line.toLowerCase();
  return IGNORE_KEYWORDS.some((k) => lc.includes(k));
}

// Banco do Brasil: "...DD/MM/YYYY ... <descricao> ... 93,00 D ... 649,49 C"
function parseBancoDoBrasil(text: string): Tx[] {
  const out: Tx[] = [];
  const lines = text.split(/\r?\n/);
  // Regex: data + valor com sufixo D ou C antes de outro valor (saldo)
  const re = /(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([\d\.]+,\d{2})\s+([DC])\b/;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || shouldIgnoreLine(line)) continue;
    const m = line.match(re);
    if (!m) continue;
    const iso = ddmmyyyyToISO(m[1]);
    if (!iso) continue;
    const amount = brToNumber(m[3]);
    if (!isFinite(amount) || amount <= 0 || amount > 1e9) continue;
    const description = m[2].replace(/\s{2,}/g, " ").trim().slice(0, 250);
    if (!description) continue;
    out.push({
      date: iso,
      description,
      amount,
      direction: m[4] === "D" ? "saida" : "entrada",
    });
  }
  return out;
}

// Bradesco: "DD/MM/YYYY  HISTÓRICO  DOC  CRED  DEB  SALDO"
// Em muitos casos extraídos do PDF, valores ficam em colunas separadas por
// múltiplos espaços. Heurística: pegar últimos números da linha; o último
// é o saldo, e dos restantes, se houver 2 -> [credito, debito] (um vazio
// vira ausente). No texto plano, os vazios viram apenas espaço.
function parseBradesco(text: string): Tx[] {
  const out: Tx[] = [];
  const lines = text.split(/\r?\n/);
  let lastDate: string | null = null;

  // Captura: opcional data no início, depois o resto
  const dateRe = /^(\d{2}\/\d{2}\/\d{4})\b/;
  // Padrão de valor BR
  const valRe = /([\d\.]+,\d{2})/g;

  for (const raw of lines) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line || shouldIgnoreLine(line)) continue;

    let date: string | null = null;
    let rest = line;
    const dm = line.match(dateRe);
    if (dm) {
      date = ddmmyyyyToISO(dm[1]);
      lastDate = date ?? lastDate;
      rest = line.slice(dm[0].length).trim();
    } else if (lastDate) {
      date = lastDate;
    } else {
      continue;
    }

    const values = [...rest.matchAll(valRe)].map((m) => m[1]);
    if (values.length < 2) continue; // precisa pelo menos valor + saldo

    // Última coluna geralmente é saldo. Penúltima é a movimentação.
    // Na coluna de movimentação, débito vem depois de crédito no Bradesco.
    // Como vazios viram ausentes, com 2 valores: [movimento, saldo].
    // Com 3 valores: [credito, debito, saldo] — pegamos o que existe.
    const saldo = values[values.length - 1];
    const movs = values.slice(0, -1);

    // Texto antes dos valores = histórico
    const firstValIdx = rest.indexOf(movs[0]);
    const description = rest.slice(0, firstValIdx).replace(/\s{2,}/g, " ").trim().slice(0, 250);
    if (!description) continue;

    let amount = 0;
    let direction: "entrada" | "saida" = "entrada";

    if (movs.length === 1) {
      // Sem como saber crédito/débito do texto puro: tenta inferir do saldo
      // posterior. Se saldo aumentou em relação ao anterior, é entrada.
      amount = brToNumber(movs[0]);
      const last = out[out.length - 1];
      if (last) {
        // sem saldo armazenado; default entrada
        direction = "entrada";
      }
    } else {
      // 2+ movimentos: assume primeiro = crédito, segundo = débito
      const cred = brToNumber(movs[0]);
      const deb = brToNumber(movs[1]);
      if (cred > 0 && deb === 0) {
        amount = cred;
        direction = "entrada";
      } else if (deb > 0) {
        amount = deb;
        direction = "saida";
      } else {
        amount = cred;
        direction = "entrada";
      }
    }

    if (!isFinite(amount) || amount <= 0 || amount > 1e9) continue;
    if (!date) continue;

    // Filtra duplicata simples
    out.push({ date, description, amount, direction });
    void saldo;
  }
  return out;
}

// Genérico: data + ... + valor no fim. Decide direção por palavras-chave.
function parseGeneric(text: string): Tx[] {
  const out: Tx[] = [];
  const lines = text.split(/\r?\n/);
  const re = /(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([\d\.]+,\d{2})\s*$/;
  const debitKeywords = /(d[eé]bito|saida|saída|pagamento|tarifa|imposto|iof|tx\.|compra|saque|ted enviado|pix enviado|estorno|debito autom)/i;
  const creditKeywords = /(cr[eé]dito|entrada|recebimento|deposito|depósito|ted recebido|pix recebido|transferencia recebida|salário)/i;

  for (const raw of lines) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line || shouldIgnoreLine(line)) continue;
    const m = line.match(re);
    if (!m) continue;
    const iso = ddmmyyyyToISO(m[1]);
    if (!iso) continue;
    const amount = brToNumber(m[3]);
    if (!isFinite(amount) || amount <= 0 || amount > 1e9) continue;
    const description = m[2].replace(/\s{2,}/g, " ").trim().slice(0, 250);
    if (!description) continue;
    let direction: "entrada" | "saida" = "entrada";
    if (debitKeywords.test(description)) direction = "saida";
    else if (creditKeywords.test(description)) direction = "entrada";
    out.push({ date: iso, description, amount, direction });
  }
  return out;
}

function dedupe(txs: Tx[]): Tx[] {
  const seen = new Set<string>();
  const out: Tx[] = [];
  for (const t of txs) {
    const key = `${t.date}|${t.amount}|${t.direction}|${t.description.slice(0, 60)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import(
    "https://esm.sh/unpdf@0.12.1?target=denonext"
  );
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : String(text ?? "");
}

function parseManually(text: string): Tx[] {
  const candidates: Tx[][] = [];
  try { candidates.push(parseBancoDoBrasil(text)); } catch { /* ignore */ }
  try { candidates.push(parseBradesco(text)); } catch { /* ignore */ }
  try { candidates.push(parseGeneric(text)); } catch { /* ignore */ }
  // Escolhe o detector que retornou mais transações
  candidates.sort((a, b) => b.length - a.length);
  const best = candidates[0] ?? [];
  return dedupe(best);
}

// ---------- AI path (primary) ----------
async function tryAi(
  fileBase64: string,
  fileName: string,
  apiKey: string,
): Promise<{ ok: true; transactions: Tx[] } | { ok: false; status: number; message: string }> {
  const dataUrl = fileBase64.startsWith("data:")
    ? fileBase64
    : `data:application/pdf;base64,${fileBase64}`;

  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
            { type: "text", text: `Extraia todas as transações do extrato bancário "${fileName}".` },
            { type: "file", file: { filename: fileName, file_data: dataUrl } },
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
                      amount: { type: "number" },
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
    const errText = await aiResp.text().catch(() => "");
    console.error("AI gateway error", aiResp.status, errText);
    return { ok: false, status: aiResp.status, message: errText || `AI status ${aiResp.status}` };
  }

  const aiJson = await aiResp.json();
  const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    return { ok: false, status: 422, message: "IA não retornou transações." };
  }
  let parsed: { transactions: Tx[] };
  try {
    parsed = JSON.parse(toolCall.function.arguments);
  } catch (e) {
    return { ok: false, status: 500, message: "Resposta da IA inválida." };
  }
  const transactions = (parsed.transactions ?? []).filter(
    (t) =>
      t &&
      typeof t.date === "string" &&
      typeof t.description === "string" &&
      typeof t.amount === "number" &&
      (t.direction === "entrada" || t.direction === "saida"),
  );
  return { ok: true, transactions };
}

// ---------- Handler ----------
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileBase64, fileName } = await req.json();
    if (!fileBase64 || typeof fileBase64 !== "string") {
      return new Response(
        JSON.stringify({ error: "fileBase64 é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let aiResult:
      | { ok: true; transactions: Tx[] }
      | { ok: false; status: number; message: string }
      | null = null;

    if (LOVABLE_API_KEY) {
      try {
        aiResult = await tryAi(fileBase64, fileName ?? "extrato.pdf", LOVABLE_API_KEY);
      } catch (e) {
        console.error("AI call threw", e);
        aiResult = { ok: false, status: 500, message: e instanceof Error ? e.message : String(e) };
      }
    } else {
      aiResult = { ok: false, status: 500, message: "LOVABLE_API_KEY não configurada" };
    }

    if (aiResult.ok && aiResult.transactions.length > 0) {
      return new Response(
        JSON.stringify({ transactions: aiResult.transactions, source: "ai" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fallback: parser manual via texto extraído do PDF
    console.log("Falling back to manual parser. AI status:", aiResult.ok ? "empty" : aiResult.status);
    let manualTxs: Tx[] = [];
    let manualError: string | null = null;
    try {
      const bytes = b64ToBytes(fileBase64);
      const text = await extractPdfText(bytes);
      manualTxs = parseManually(text);
    } catch (e) {
      console.error("Manual parser failed", e);
      manualError = e instanceof Error ? e.message : String(e);
    }

    if (manualTxs.length > 0) {
      return new Response(
        JSON.stringify({
          transactions: manualTxs,
          source: "manual",
          ai_error: aiResult.ok ? null : aiResult.message,
          ai_status: aiResult.ok ? null : aiResult.status,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Nada funcionou — retorna erro amigável como 200 para o frontend poder
    // tratar o fallback sem o supabase-js transformar em FunctionHttpError.
    const aiStatus = aiResult.ok ? 422 : aiResult.status;
    let userMsg = "Não foi possível ler o extrato. Tente exportar como OFX/CSV.";
    if (aiStatus === 402) {
      userMsg = "Créditos de IA esgotados e não foi possível ler o PDF automaticamente. Adicione créditos no workspace ou envie um arquivo OFX/CSV.";
    } else if (aiStatus === 429) {
      userMsg = "Limite de requisições da IA atingido. Tente novamente em instantes ou envie um OFX/CSV.";
    }

    return new Response(
      JSON.stringify({
        error: userMsg,
        fallback: true,
        source: "manual",
        transactions: [],
        ai_error: aiResult.ok ? null : aiResult.message,
        manual_error: manualError,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("parse-bank-statement-pdf error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
