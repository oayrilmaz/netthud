// scripts/generate-signals-openai.mjs
import fs from "fs";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const OUT_FILE = "assets/data/signals.json";

function extractJSON(text) {
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) throw new Error("No JSON found in OpenAI response");
  return JSON.parse(match[0]);
}

async function main() {
  const prompt = `
Return ONLY valid JSON.

Schema:
{
  "updated": "<ISO date>",
  "signals": [
    {
      "label": "Momentum shift",
      "confidence": "medium"
    }
  ]
}

Generate 5 football intelligence signals.
`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3
  });

  const raw = response.choices[0].message.content;
  const data = extractJSON(raw);

  fs.writeFileSync(
    OUT_FILE,
    JSON.stringify(
      {
        updated: new Date().toISOString(),
        signals: data.signals
      },
      null,
      2
    )
  );

  console.log("✅ AI signals written:", OUT_FILE);
}

main().catch(err => {
  console.error("❌ generate-signals-openai failed:", err.message);
  process.exit(1);
});