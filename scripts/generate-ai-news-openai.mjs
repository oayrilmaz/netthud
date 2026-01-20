import fs from "node:fs";
import path from "node:path";

const OUT_PATH = path.resolve("assets/data/ai-news.json");

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const txt = fs.readFileSync(filePath, "utf8").trim();
    if (!txt) return fallback;
    return JSON.parse(txt);
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, filePath);
}

function extractFirstJsonObject(text) {
  // If OpenAI ever returns extra text, we still recover JSON safely.
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e === -1 || e <= s) throw new Error("No JSON object found in response.");
  const candidate = text.slice(s, e + 1);
  return JSON.parse(candidate);
}

async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log("OPENAI_API_KEY missing. Keeping existing ai-news.json (no-op).");
    return null;
  }

  const body = {
    model: "gpt-4o-mini",
    input: [
      {
        role: "system",
        content:
          "Return ONLY valid JSON. No markdown, no commentary. The JSON must match the requested shape exactly.",
      },
      { role: "user", content: prompt },
    ],
    // If supported, this strongly nudges JSON-only output.  [oai_citation:1‡OpenAI Platform](https://platform.openai.com/docs/api-reference/runs%3Flang%3Dpython?utm_source=chatgpt.com)
    response_format: { type: "json_object" },
  };

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${raw}`);

  // Try to read normal Responses API structure; fallback to raw JSON extraction.
  try {
    const data = JSON.parse(raw);
    const text =
      data?.output?.[0]?.content?.map?.(c => c?.text).filter(Boolean).join("") ??
      data?.output_text ??
      raw;
    return extractFirstJsonObject(text);
  } catch {
    return extractFirstJsonObject(raw);
  }
}

async function main() {
  const existing = readJsonSafe(OUT_PATH, { items: [], updated: null });

  const prompt = `
Create football-related "AI News" items for NetThud.
Return JSON with this exact shape:
{
  "updated": "<ISO timestamp>",
  "items": [
    {
      "title": "string",
      "source": "string",
      "date": "YYYY-MM-DD",
      "url": "https://...",
      "summary": "string"
    }
  ]
}
Rules:
- Exactly 30 items.
- "date" must be YYYY-MM-DD.
- All URLs must be valid https:// links.
- Keep summaries short (max ~180 chars).
`;

  let obj = null;
  try {
    obj = await callOpenAI(prompt);
  } catch (e) {
    console.log("generate-ai-news-openai failed:", e?.message || e);
  }

  if (!obj || !obj.items || !Array.isArray(obj.items)) {
    console.log("OpenAI output invalid. Keeping existing ai-news.json.");
    writeJsonAtomic(OUT_PATH, existing);
    return;
  }

  // Hard sanitize to prevent invalid JSON content downstream
  const cleaned = {
    updated: new Date().toISOString(),
    items: obj.items.slice(0, 30).map((x) => ({
      title: String(x.title || "").trim(),
      source: String(x.source || "").trim(),
      date: String(x.date || "").slice(0, 10),
      url: String(x.url || "").trim(),
      summary: String(x.summary || "").trim(),
    })),
  };

  writeJsonAtomic(OUT_PATH, cleaned);
  console.log(`Wrote ${cleaned.items.length} items -> ${OUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});