import fs from "node:fs";
import path from "node:path";

const OUT_PATH = path.resolve("assets/data/signals.json");

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
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e === -1 || e <= s) throw new Error("No JSON object found in response.");
  return JSON.parse(text.slice(s, e + 1));
}

async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log("OPENAI_API_KEY missing. Keeping existing signals.json (no-op).");
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
    response_format: { type: "json_object" }, //  [oai_citation:2‡OpenAI Platform](https://platform.openai.com/docs/api-reference/runs%3Flang%3Dpython?utm_source=chatgpt.com)
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
  const existing = readJsonSafe(OUT_PATH, { updated: null, items: [] });

  const prompt = `
Create "Signals" for NetThud (football insights).
Return JSON with this exact shape:
{
  "updated": "<ISO timestamp>",
  "items": [
    {
      "title": "string",
      "tag": "string",
      "confidence": "low|medium|high",
      "summary": "string"
    }
  ]
}
Rules:
- Exactly 12 items.
- Keep summaries short (max ~180 chars).
- Use practical, not silly signals (injury impact, schedule congestion, tactical shift, transfer rumor reliability, etc).
`;

  let obj = null;
  try {
    obj = await callOpenAI(prompt);
  } catch (e) {
    console.log("generate-signals-openai failed:", e?.message || e);
  }

  if (!obj || !Array.isArray(obj.items)) {
    console.log("OpenAI output invalid. Keeping existing signals.json.");
    writeJsonAtomic(OUT_PATH, existing);
    return;
  }

  const cleaned = {
    updated: new Date().toISOString(),
    items: obj.items.slice(0, 12).map((x) => ({
      title: String(x.title || "").trim(),
      tag: String(x.tag || "").trim(),
      confidence: ["low", "medium", "high"].includes(String(x.confidence))
        ? String(x.confidence)
        : "medium",
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