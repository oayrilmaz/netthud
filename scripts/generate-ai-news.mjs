import fs from "fs/promises";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function main() {
  const prompt = `
Create 5 short football intelligence headlines.
No sources. No websites. No ESPN. No BBC.
Pure analysis style.
`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }]
  });

  const items = response.choices[0].message.content
    .split("\n")
    .filter(Boolean)
    .map((t, i) => ({
      id: i + 1,
      title: t.trim(),
      source: "NetThud AI",
      date: new Date().toISOString()
    }));

  const out = {
    generatedAt: new Date().toISOString(),
    items
  };

  await fs.mkdir("assets/data", { recursive: true });
  await fs.writeFile(
    "assets/data/ai-news.json",
    JSON.stringify(out, null, 2)
  );

  console.log("AI news generated");
}

main();