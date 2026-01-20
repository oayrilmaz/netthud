// scripts/generate-signals-openai.mjs
// Generates: assets/data/signals.json
// OpenAI-only. No external feeds. No npm deps.

import fs from "fs";
import path from "path";

const OUT_FILE = path.join("assets", "data", "signals.json");
const SITE_URL = "https://netthud.com/";

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeJson(filePath, obj) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
}

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function openaiResponseJSON({ apiKey, model, input }) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input,
      temperature: 0.5,
      max_output_tokens: 1200,
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${text}`);

  const data = JSON.parse(text);
  const blocks = data.output || [];
  for (const b of blocks) {
    const content = b.content || [];
    for (const c of content) {
      if (c.type === "output_text" && c.text) return c.text;
    }
  }
  throw new Error("OpenAI response had no output_text.");
}

function buildPrompt() {
  return `
You are NetThud AI. Generate "Signals" — short football context indicators.
Rules:
- DO NOT reference external sources (ESPN/BBC/Sky/etc.).
- DO NOT claim real-time match events or factual breaking news.
- Signals must be general, analytical, useful, and clearly not dependent on live data.
- Output MUST be valid JSON ONLY, no markdown.

Return JSON schema exactly:
{
  "items": [
    {
      "id": "sig-001",
      "title": "Signal title",
      "summary": "1-2 sentences. Practical. Non-factual/general.",
      "confidence": 0.0,
      "source": "NetThud AI",
      "date": "YYYY-MM-DD"
    }
  ]
}

Make exactly 20 items.
Confidence must be a number between 0.45 and 0.75.
Dates: use today's date.
`.trim();
}

function todayISODate() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeSignals(parsed) {
  const date = todayISODate();
  const raw = Array.isArray(parsed?.items) ? parsed.items : [];

  const items = raw.slice(0, 20).map((it, idx) => {
    let c = Number(it?.confidence);
    if (!Number.isFinite(c)) c = 0.6;
    c = Math.max(0.45, Math.min(0.75, c));

    return {
      id: it?.id || `sig-${String(idx + 1).padStart(3, "0")}`,
      title: String(it?.title || "NetThud Signal").slice(0, 110),
      summary: String(it?.summary || "").slice(0, 260),
      confidence: c,
      source: "NetThud AI",
      date: it?.date || date,
      url: SITE_URL,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    mode: "openai",
    items,
  };
}

async function main() {
  const apiKey = requiredEnv("OPENAI_API_KEY");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const prompt = buildPrompt();
  const text = await openaiResponseJSON({ apiKey, model, input: prompt });

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) parsed = JSON.parse(text.slice(start, end + 1));
    else throw new Error(`Could not parse JSON from OpenAI output:\n${text}`);
  }

  const out = normalizeSignals(parsed);
  writeJson(OUT_FILE, out);

  console.log(`✅ Wrote ${OUT_FILE} (${out.items.length} items)`);
}

main().catch((err) => {
  console.error("❌ generate-signals-openai failed:", err);
  process.exit(1);
});