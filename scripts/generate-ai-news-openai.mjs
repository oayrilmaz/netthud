import fs from "fs";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const OUT_FILE = "assets/data/ai-news.json";

function extractJSON(text) {
  // 1) try direct parse
  try {
    return JSON.parse(text);
  } catch {}

  // 2) strip common code fences
  const cleaned = text
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {}

  // 3) find first JSON object/array anywhere in output
  const match = cleaned.match(/(\{[\s\S]*\}|$begin:math:display$\[\\s\\S\]\*$end:math:display$)/);
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
  "items": [
    { "title": "...", "summary": "...", "source": "openai", "url": "#" }
  ]
}

Generate 20 football news items.
- Use short titles
- 1 sentence summaries
- source must be "openai"
- url must be "#"
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
    items: Array.isArray(data.items) ? data.items : []
  };

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  console.log("✅ Wrote", OUT_FILE, "items:", out.items.length);
}

main().catch((err) => {
  console.error("❌ generate-ai-news-openai failed:", err);
  process.exit(1);
});