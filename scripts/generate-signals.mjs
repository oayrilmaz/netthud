import fs from "fs/promises";

async function readJsonSafe(path) {
  try {
    const s = await fs.readFile(path, "utf8");
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function callOpenAI({ apiKey, input }) {
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-5",
      input
    })
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`OpenAI failed ${r.status}: ${t.slice(0, 400)}`);
  }
  return r.json();
}

function extractText(resp) {
  // Responses API returns an array of output items; safest is to join text parts.
  const out = resp?.output || [];
  let text = "";
  for (const item of out) {
    const content = item?.content || [];
    for (const c of content) {
      if (c?.type === "output_text" && c?.text) text += c.text;
    }
  }
  return text.trim();
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY || "";

  const scores = await readJsonSafe("assets/data/scores.json");
  const news = await readJsonSafe("assets/data/ai-news.json");

  const scoreItems = Array.isArray(scores?.items) ? scores.items.slice(0, 25) : [];
  const newsItems = Array.isArray(news?.items) ? news.items.slice(0, 10) : [];

  // If no key, still write a file (no broken UI)
  if (!apiKey) {
    const out = {
      generatedAt: new Date().toISOString(),
      mode: "no-openai-key",
      items: [
        {
          title: "Signals offline",
          body: "Add OPENAI_API_KEY in GitHub Secrets to generate signals from real scores/news.",
          tag: "setup"
        }
      ]
    };
    await fs.mkdir("assets/data", { recursive: true });
    await fs.writeFile("assets/data/signals.json", JSON.stringify(out, null, 2) + "\n", "utf8");
    console.log("Wrote assets/data/signals.json (no-openai-key)");
    return;
  }

  const prompt = `
You are Net Thud "Goal Intelligence".
Generate 5 short, data-grounded signals from the provided FINAL SCORES and TOP NEWS.
Rules:
- No guessing. Only infer from the inputs.
- Each signal: title (max 8 words), 1-2 sentence body, tag (one of: "form", "upset", "title-race", "derby", "trend", "context").
- If inputs are empty, output 1 item explaining "No data yet".

FINAL SCORES (JSON):
${JSON.stringify(scoreItems, null, 2)}

TOP NEWS (JSON):
${JSON.stringify(newsItems, null, 2)}

Return STRICT JSON:
{ "items": [ { "title": "...", "body": "...", "tag": "..." } ] }
`;

  const resp = await callOpenAI({
    apiKey,
    input: [{ role: "user", content: prompt }]
  });

  const text = extractText(resp);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { items: [{ title: "Signals parse error", body: "Model output was not valid JSON.", tag: "setup" }] };
  }

  const out = {
    generatedAt: new Date().toISOString(),
    mode: "openai",
    items: Array.isArray(parsed?.items) ? parsed.items.slice(0, 8) : []
  };

  await fs.mkdir("assets/data", { recursive: true });
  await fs.writeFile("assets/data/signals.json", JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Wrote assets/data/signals.json with ${out.items.length} items`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
