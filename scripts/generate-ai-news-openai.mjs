import fs from "fs";

const OUTPUT = "assets/data/ai-news.json";

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is missing");
  process.exit(1);
}

const prompt = `
Return ONLY valid JSON.
No markdown.
No explanation.

Schema:
{
  "updatedAt": "ISO_DATE",
  "items": [
    {
      "title": "string",
      "summary": "string",
      "league": "string",
      "teams": ["string"],
      "confidence": 0-100
    }
  ]
}

Rules:
- Football only
- Tactical or performance insight
- No links
- No ESPN / BBC
- Max 10 items
`;

async function run() {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: "You are a football match analyst." },
        { role: "user", content: prompt }
      ]
    })
  });

  const data = await response.json();

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    console.error("Invalid OpenAI response:", data);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    console.error("FAILED TO PARSE JSON:");
    console.error(content);
    process.exit(1);
  }

  fs.writeFileSync(
    OUTPUT,
    JSON.stringify(parsed, null, 2),
    "utf-8"
  );

  console.log("AI news written to", OUTPUT);
}

run();