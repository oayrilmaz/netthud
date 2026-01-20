import fs from "fs";

const OUT = "assets/data/signals.json";

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

async function main() {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Return ONLY valid JSON array. No markdown. No commentary."
        },
        {
          role: "user",
          content:
            "Generate football match signals. Fields: match, signal, confidence."
        }
      ]
    })
  });

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "[]";

  const items = safeJsonParse(text);

  fs.writeFileSync(
    OUT,
    JSON.stringify(
      {
        updated: new Date().toISOString(),
        count: items.length,
        items
      },
      null,
      2
    )
  );

  console.log("Signals updated:", items.length);
}

main();