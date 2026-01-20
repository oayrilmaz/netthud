// scripts/generate-ai-news-openai.mjs
// Generates: assets/data/ai-news.json
// OpenAI-only. No external feeds. No npm deps.

import fs from "fs";
import path from "path";

const OUT_FILE = path.join("assets", "data", "ai-news.json");
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
      temperature: 0.6,
      max_output_tokens: 1200,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI error ${res.status}: ${text}`);
  }

  const data = JSON.parse(text);

  // Extract the first text chunk from the Responses API output
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
  // IMPORTANT: We avoid claiming real-world facts; these are “AI Brief” style insights.
  return `
You are NetThud AI. Create an "AI Brief" list about football context and signals.
Rules:
- DO NOT reference ESPN, BBC, Sky, or any external publisher.
- DO NOT claim real transfers, real injuries, or real match facts.
- Write as analytical, general, timeless insights that are useful even without live data.
- Output MUST be valid JSON ONLY, no markdown.

Return JSON schema exactly:
{
  "items": [
    {
      "id": "ai-001",
      "title": "Short headline",
      "summary": "1-2 sentences, actionable/insightful, not claiming real-time facts.",
      "source": "NetThud AI",
      "date": "YYYY-MM-DD"
    }
  ]
}

Make exactly 30 items.
Dates: use today's date.
Titles must be unique and specific.
`.trim();
}

function todayISODate() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeAiNews(parsed) {
  const date = todayISODate();
  const raw = Array.isArray(parsed?.items) ? parsed.items : [];

  const items = raw.slice(0, 30).map((it, idx) => ({
    id: it?.id || `ai-${String(idx + 1).padStart(3, "0")}`,
    title: String(it?.title || "NetThud AI Brief").slice(0, 120),
    summary: String(it?.summary || "").slice(0, 320),
    source: "NetThud AI",
    date: it?.date || date,
    // Keep URL internal (or omit). Using site root avoids any external links.
    url: SITE_URL,
  }));

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
  } catch (e) {
    // If model returned extra text, try to recover JSON block
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      parsed = JSON.parse(text.slice(start, end + 1));
    } else {
      throw new Error(`Could not parse JSON from OpenAI output:\n${text}`);
    }
  }

  const out = normalizeAiNews(parsed);
  writeJson(OUT_FILE, out);

  console.log(`✅ Wrote ${OUT_FILE} (${out.items.length} items)`);
}

main().catch((err) => {
  console.error("❌ generate-ai-news-openai failed:", err);
  process.exit(1);
});