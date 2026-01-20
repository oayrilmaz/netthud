import fs from "fs";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const OUT_FILE = "assets/data/signals.json";

function extractJSON(text) {
  try {
    return JSON.parse(text);
  } catch {}

  const cleaned = text
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {}

  const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (!match) throw new Error("No JSON found in OpenAI response");

  return JSON.parse(match[0]);
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY secret");
  }

  const prompt = `
Return ONLY valid JSON. No markdown. No extra text.

Schema:
{
  "signals": [
    { "label": "Momentum shift", "confidence": "low|medium|high" }
  ]
}

Generate 10 football intelligence signals.
Keep labels short (2-6 words).
`;

  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3
  });

  const raw = resp.choices?.[0]?.message?.content ?? "";
  const data = extractJSON(raw);

  const out = {
    updated: new Date().toISOString(),
    signals: Array.isArray(data.signals) ? data.signals : []
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log("✅ Wrote", OUT_FILE, "signals:", out.signals.length);
}

main().catch((err) => {
  console.error("❌ generate-signals-openai failed:", err);
  process.exit(1);
});