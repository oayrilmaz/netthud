import fs from "node:fs";
import path from "node:path";

const OUT_PATH = path.join("assets", "data", "ai-news.json");

function safeReadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function extractJson(text) {
  if (!text) throw new Error("Empty response");
  const s = text.trim();

  // If it's already pure JSON:
  if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
    return JSON.parse(s);
  }

  // Try to find the first JSON object/array block inside the text:
  const firstObj = s.indexOf("{");
  const firstArr = s.indexOf("[");
  let start = -1;
  if (firstObj === -1) start = firstArr;
  else if (firstArr === -1) start = firstObj;
  else start = Math.min(firstObj, firstArr);

  if (start === -1) throw new Error("No JSON start found in response");

  // Find last matching end char
  const lastObj = s.lastIndexOf("}");
  const lastArr = s.lastIndexOf("]");
  let end = Math.max(lastObj, lastArr);
  if (end === -1 || end <= start) throw new Error("No JSON end found in response");

  const candidate = s.slice(start, end + 1);
  return JSON.parse(candidate);
}

async function callOpenAI({ apiKey, prompt }) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "Return ONLY valid JSON. No markdown, no extra text. If you cannot comply, return an empty JSON array [].",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI HTTP ${res.status}: ${t}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  return text;
}

async function main() {
  const previous = safeReadJson(OUT_PATH, { updated: null, items: [] });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log("OPENAI_API_KEY missing. Keeping existing ai-news.json unchanged.");
    process.exit(0);
  }

  const prompt = `
Create 30 football news items. Output JSON ONLY with this exact shape:

{
  "updated": "<ISO timestamp>",
  "items": [
    {
      "title": "...",
      "url": "...",
      "source": "...",
      "published": "<YYYY-MM-DD>",
      "summary": "..."
    }
  ]
}

Rules:
- items length must be 30
- published must be YYYY-MM-DD
- url must be a valid https URL
- no undefined / null fields
`;

  try {
    const raw = await callOpenAI({ apiKey, prompt });
    const parsed = extractJson(raw);

    // Basic validation / normalization
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    const cleaned = items
      .filter((x) => x && typeof x === "object")
      .map((x) => ({
        title: String(x.title ?? "").trim(),
        url: String(x.url ?? "").trim(),
        source: String(x.source ?? "").trim(),
        published: String(x.published ?? "").trim(),
        summary: String(x.summary ?? "").trim(),
      }))
      .filter(
        (x) =>
          x.title &&
          x.summary &&
          x.source &&
          x.published &&
          x.url &&
          x.url.startsWith("https://")
      )
      .slice(0, 30);

    const out = {
      updated: new Date().toISOString(),
      items: cleaned,
    };

    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n", "utf8");
    console.log(`Wrote ${cleaned.length} items to ${OUT_PATH}`);
  } catch (err) {
    console.error("AI News generation failed:", err?.message || err);
    console.log("Keeping existing ai-news.json unchanged.");
    // Do NOT fail the workflow
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify(previous, null, 2) + "\n", "utf8");
    process.exit(0);
  }
}

main();