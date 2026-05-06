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
  const re = /(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(-?[\d\.]+,\d{2}-?)\s*$/;
  const debitKeywords = /(d[eé]bito|saida|saída|pagamento|pagto|tarifa|imposto|iof|tx\.|compra|saque|ted enviado|pix enviado|enviado|estorno|debito autom|d[eé]bito autom|boleto pago|cobranca|cobrança|fatura|anuidade)/i;
  const creditKeywords = /(cr[eé]dito|entrada|recebimento|recebido|deposito|depósito|ted recebido|pix recebido|transferencia recebida|transfer[eê]ncia recebida|sal[aá]rio|rendimento|estorno cred)/i;

  for (const raw of lines) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line || shouldIgnoreLine(line)) continue;
    const m = line.match(re);
    if (!m) continue;
    const iso = ddmmyyyyToISO(m[1]);
    if (!iso) continue;
    const rawVal = m[3];
    const isNegative = rawVal.startsWith("-") || rawVal.endsWith("-");
    const amount = brToNumber(rawVal.replace(/-/g, ""));
    if (!isFinite(amount) || amount <= 0 || amount > 1e9) continue;
    const description = m[2].replace(/\s{2,}/g, " ").trim().slice(0, 250);
    if (!description) continue;
    let direction: "entrada" | "saida" = "entrada";
    if (isNegative) direction = "saida";
    else if (debitKeywords.test(description)) direction = "saida";
    else if (creditKeywords.test(description)) direction = "entrada";
    out.push({ date: iso, description, amount, direction });
  }
  return out;
}

// Último recurso: qualquer linha com data + texto + valor.
function parseLastResort(text: string): Tx[] {
  const out: Tx[] = [];
  const lines = text.split(/\r?\n/);
  let lastDate: string | null = null;
  const dateRe = /(\d{2}\/\d{2}\/\d{4})/;
  const valRe = /(-?[\d\.]+,\d{2}-?)/g;
  const debitKeywords = /(d[eé]bito|pagto|pagamento|tarifa|iof|imposto|compra|saque|enviado|boleto|fatura)/i;

  for (const raw of lines) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line || shouldIgnoreLine(line)) continue;
    const dm = line.match(dateRe);
    if (dm) lastDate = ddmmyyyyToISO(dm[1]);
    if (!lastDate) continue;
    const vals = [...line.matchAll(valRe)].map((m) => m[1]);
    if (vals.length === 0) continue;
    const candidate = vals.length >= 2 ? vals[vals.length - 2] : vals[0];
    const isNegative = candidate.startsWith("-") || candidate.endsWith("-");
    const amount = brToNumber(candidate.replace(/-/g, ""));
    if (!isFinite(amount) || amount <= 0 || amount > 1e9) continue;
    const firstValIdx = line.indexOf(candidate);
    const startIdx = dm ? dm.index! + dm[0].length : 0;
    let description = line.slice(startIdx, firstValIdx).replace(/\s{2,}/g, " ").trim().slice(0, 250);
    if (!description) description = line.slice(0, firstValIdx).trim().slice(0, 250);
    if (!description) continue;
    let direction: "entrada" | "saida" = "entrada";
    if (isNegative || debitKeywords.test(description)) direction = "saida";
    out.push({ date: lastDate, description, amount, direction });
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

// ---------- Positional PDF extraction ----------
type PdfItem = { x: number; str: string };
type PdfLine = { y: number; items: PdfItem[]; text: string };
type PdfPage = { lines: PdfLine[] };

async function extractPdfPages(bytes: Uint8Array): Promise<PdfPage[]> {
  const { resolvePDFJS }: any = await import(
    "https://esm.sh/pdfjs-serverless@0.5.0?target=denonext"
  );
  const { getDocument } = await resolvePDFJS();

  const loadingTask = getDocument({
    data: bytes,
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  });
  const pdf = await loadingTask.promise;

  const pages: PdfPage[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const byY = new Map<number, PdfItem[]>();
    for (const it of content.items as any[]) {
      if (typeof it.str !== "string" || !it.transform) continue;
      const s = it.str;
      if (!s.trim()) continue;
      const y = Math.round(it.transform[5]);
      const x = it.transform[4];
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y)!.push({ x, str: s });
    }
    const lines: PdfLine[] = [...byY.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([y, items]) => {
        items.sort((a, b) => a.x - b.x);
        const text = items.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
        return { y, items, text };
      })
      .filter((l) => l.text.length > 0);
    pages.push({ lines });
  }
  return pages;
}

function flattenPages(pages: PdfPage[]): string {
  return pages.map((p) => p.lines.map((l) => l.text).join("\n")).join("\n");
}

// ---------- Bradesco positional parser (column-aware) ----------
function parseBradescoPositional(pages: PdfPage[]): Tx[] {
  const out: Tx[] = [];
  const valRe = /^-?[\d\.]+,\d{2}-?$/;
  const dateRe = /^(\d{2}\/\d{2}\/\d{4})$/;

  for (const page of pages) {
    // Procurar cabeçalho: linha que contém Histórico + Crédito + Débito + Saldo
    let headerIdx = -1;
    let cols: { hist: number; doc: number; cred: number; deb: number; saldo: number } | null = null;

    for (let i = 0; i < page.lines.length; i++) {
      const line = page.lines[i];
      const lc = line.text.toLowerCase();
      if (
        lc.includes("hist") &&
        lc.includes("cr") && lc.includes("d") &&
        (lc.includes("saldo") || lc.includes("saldo"))
      ) {
        // Extrair X de cada coluna procurando palavras chave em items
        const findX = (kw: string): number | null => {
          for (const it of line.items) {
            if (it.str.toLowerCase().includes(kw)) return it.x;
          }
          return null;
        };
        const xHist = findX("hist");
        const xDoc = findX("docto") ?? findX("doc");
        const xCred = findX("créd") ?? findX("cred");
        const xDeb = findX("déb") ?? findX("deb") ?? findX("déb");
        const xSaldo = findX("saldo");
        if (xHist != null && xCred != null && xDeb != null && xSaldo != null) {
          cols = {
            hist: xHist,
            doc: xDoc ?? (xHist + xCred) / 2,
            cred: xCred,
            deb: xDeb,
            saldo: xSaldo,
          };
          headerIdx = i;
          break;
        }
      }
    }

    if (!cols || headerIdx < 0) continue;

    let lastDate: string | null = null;
    let pending: Tx | null = null; // transação atual aguardando linhas de continuação
    const flush = () => {
      if (pending) {
        // limpa descrição
        pending.description = pending.description.replace(/\s{2,}/g, " ").trim().slice(0, 250);
        if (pending.description && pending.amount > 0) out.push(pending);
        pending = null;
      }
    };

    for (let i = headerIdx + 1; i < page.lines.length; i++) {
      const line = page.lines[i];
      if (shouldIgnoreLine(line.text)) { flush(); continue; }

      // Separar items em texto vs valores numéricos
      const valueItems: { x: number; raw: string; amount: number }[] = [];
      const textItems: PdfItem[] = [];
      let dateOnLine: string | null = null;

      for (const it of line.items) {
        const s = it.str.trim();
        if (!s) continue;
        const dm = s.match(dateRe);
        if (dm) {
          const iso = ddmmyyyyToISO(dm[1]);
          if (iso) { dateOnLine = iso; continue; }
        }
        if (valRe.test(s)) {
          const amt = brToNumber(s.replace(/-/g, ""));
          if (isFinite(amt)) {
            valueItems.push({ x: it.x, raw: s, amount: amt });
            continue;
          }
        }
        textItems.push(it);
      }

      if (dateOnLine) lastDate = dateOnLine;

      // Histórico = items texto à esquerda da coluna Docto.
      const histText = textItems
        .filter((it) => it.x < cols!.doc - 5)
        .map((it) => it.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      // Classificar valores por proximidade de coluna
      let credit = 0, debit = 0;
      for (const v of valueItems) {
        const dCred = Math.abs(v.x - cols.cred);
        const dDeb = Math.abs(v.x - cols.deb);
        const dSaldo = Math.abs(v.x - cols.saldo);
        const min = Math.min(dCred, dDeb, dSaldo);
        if (min === dSaldo) continue; // saldo descartado
        if (min === dCred) credit = Math.max(credit, v.amount);
        else if (min === dDeb) debit = Math.max(debit, v.amount);
      }

      const hasMovement = credit > 0 || debit > 0;

      if (hasMovement) {
        // Nova transação
        flush();
        if (!lastDate) continue;
        const amount = debit > 0 ? debit : credit;
        const direction: "entrada" | "saida" = debit > 0 ? "saida" : "entrada";
        if (amount <= 0 || amount > 1e9) continue;
        pending = {
          date: lastDate,
          description: histText || "Lançamento",
          amount,
          direction,
        };
      } else if (histText && pending) {
        // Linha de continuação: anexar à descrição
        pending.description += " " + histText;
      }
    }
    flush();
  }

  return out;
}

function isBradescoLayout(pages: PdfPage[]): boolean {
  for (const page of pages) {
    for (const line of page.lines) {
      const lc = line.text.toLowerCase();
      if (
        lc.includes("hist") &&
        (lc.includes("créd") || lc.includes("cred")) &&
        (lc.includes("déb") || lc.includes("deb")) &&
        lc.includes("saldo")
      ) {
        return true;
      }
    }
  }
  return false;
}

function parseManually(pages: PdfPage[]): Tx[] {
  // 1) Tenta Bradesco posicional se cabeçalho de colunas detectado
  if (isBradescoLayout(pages)) {
    try {
      const bx = parseBradescoPositional(pages);
      if (bx.length > 0) return dedupe(bx);
    } catch (e) { console.error("Bradesco positional failed", e); }
  }

  // 2) Fallback baseado em texto puro
  const text = flattenPages(pages);
  const candidates: Tx[][] = [];
  try { candidates.push(parseBancoDoBrasil(text)); } catch { /* ignore */ }
  try { candidates.push(parseBradesco(text)); } catch { /* ignore */ }
  try { candidates.push(parseGeneric(text)); } catch { /* ignore */ }
  candidates.sort((a, b) => b.length - a.length);
  let best = candidates[0] ?? [];
  if (best.length === 0) {
    try { best = parseLastResort(text); } catch { /* ignore */ }
  }
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
