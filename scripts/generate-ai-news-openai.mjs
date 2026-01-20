// scripts/generate-ai-news-openai.mjs
import fs from "fs";
import path from "path";

const OUT_PATH = path.join("assets", "data", "ai-news.json");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function callOpenAIJson({ apiKey, model, system, user }) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.6,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    })
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI HTTP ${res.status}: ${txt}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? "";

  // Should already be JSON, but keep a safety fallback.
  try {
    return JSON.parse(content);
  } catch (e) {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(content.slice(start, end + 1));
    }
    throw e;
  }
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
}

const OPENAI_API_KEY = requireEnv("OPENAI_API_KEY");
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const system = `
You are NetThud AI.
Do NOT cite or reference external websites (ESPN, BBC, etc.).
Generate original football "AI News" items as analysis headlines.
Return STRICT JSON ONLY.
`;

const user = `
Create exactly 30 AI news items.
Each item must have:
- id (string, short)
- title (string)
- summary (string, 1-2 sentences)
- tags (array of 2-5 strings)
- createdAt (ISO string)
- source (always "NetThud AI")
- url (always "")

Return JSON with shape:
{
  "updatedAt": "ISO",
  "items": [ ...30 items... ]
}
`;

(async () => {
  const json = await callOpenAIJson({
    apiKey: OPENAI_API_KEY,
    model: OPENAI_MODEL,
    system,
    user
  });

  const now = new Date().toISOString();
  const items = Array.isArray(json.items) ? json.items : [];

  // Normalize / harden
  const normalized = items.slice(0, 30).map((it, idx) => ({
    id: String(it.id || `ain-${idx + 1}`),
    title: String(it.title || "Untitled"),
    summary: String(it.summary || ""),
    tags: Array.isArray(it.tags) ? it.tags.map(String).slice(0, 6) : [],
    createdAt: it.createdAt ? String(it.createdAt) : now,
    source: "NetThud AI",
    url: "" // no external links
  }));

  const out = {
    updatedAt: now,
    items: normalized
  };

  writeJson(OUT_PATH, out);
  console.log(`Wrote ${normalized.length} items -> ${OUT_PATH}`);
})();