import fs from "fs/promises";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Generates NetThud-only AI news (no ESPN/BBC links)
async function generateItems() {
  if (!OPENAI_API_KEY) {
    // fallback so your site still works if key is missing
    return [
      {
        title: "NetThud AI is not connected yet",
        url: "/",
        source: "NetThud",
        publishedAt: new Date().toISOString(),
        summary: "Add OPENAI_API_KEY to GitHub Secrets to enable AI-generated news items.",
      },
    ];
  }

  const prompt = `
Create 12 short football intelligence 'news' items for NetThud.
Rules:
- Do NOT cite ESPN, BBC, Guardian, or any external website.
- Source must be "NetThud".
- Each item must include: title (max 90 chars), summary (max 180 chars).
- Focus on: tactical trends, form shifts, match context, late-goal patterns, pressing, set pieces.
Return ONLY valid JSON array with objects: { "title", "summary" }.
`;

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: prompt,
    }),
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`OpenAI error ${r.status}: ${t}`);
  }

  const data = await r.json();
  const text = data.output_text || "";
  let arr;
  try {
    arr = JSON.parse(text);
  } catch {
    throw new Error("OpenAI did not return valid JSON array. Output was: " + text.slice(0, 500));
  }

  return arr.map((x) => ({
    title: String(x.title || "").trim() || "NetThud Insight",
    url: "/",
    source: "NetThud",
    publishedAt: new Date().toISOString(),
    summary: String(x.summary || "").trim().slice(0, 220) || "NetThud football intelligence update.",
  }));
}

async function main() {
  const items = await generateItems();

  const out = {
    generatedAt: new Date().toISOString(),
    source: "NetThud AI (OpenAI)",
    items,
  };

  await fs.mkdir("assets/data", { recursive: true });
  await fs.writeFile("assets/data/ai-news.json", JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Wrote assets/data/ai-news.json with ${items.length} items`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});