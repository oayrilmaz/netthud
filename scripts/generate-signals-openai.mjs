import fs from "node:fs";
import path from "node:path";

const OUT_PATH = path.join("assets", "data", "signals.json");

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

  if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
    return JSON.parse(s);
  }

  const firstObj = s.indexOf("{");
  const firstArr = s.indexOf("[");
  let start = -1;
  if (firstObj === -1) start = firstArr;
  else if (firstArr === -1) start = firstObj;
  else start = Math.min(firstObj, firstArr);

  if (start === -1) throw new Error("No JSON start found in response");

  const lastObj = s.lastIndexOf("}");
  const lastArr = s.lastIndexOf("]");
  const end = Math.max(lastObj, lastArr);

  if (end === -1 || end <= start) throw new Error("No JSON end found in response");

  return JSON.parse(s.slice(start, end + 1));
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
  return data?.choices?.[0]?.message?.content ?? "";
}

async function main() {
  const previous = safeReadJson(OUT_PATH, { updated: null, items: [] });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log("OPENAI_API_KEY missing. Keeping existing signals.json unchanged.");
    process.exit(0);
  }

  const prompt = `
Create 12 short "match signals" for football fans (injury, form, fatigue, travel, tactics).
Output JSON ONLY with this exact shape:

{
  "updated": "<ISO timestamp>",
  "items": [
    {
      "title": "...",
      "signal": "...",
      "confidence": "low|medium|high"
    }
  ]
}

Rules:
- items length must be 12
- confidence must be exactly low, medium, or high
- no undefined / null fields
`;

  try {
    const raw = await callOpenAI({ apiKey, prompt });
    const parsed = extractJson(raw);

    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    const cleaned = items
      .filter((x) => x && typeof x === "object")
      .map((x) => ({
        title: String(x.title ?? "").trim(),
        signal: String(x.signal ?? "").trim(),
        confidence: String(x.confidence ?? "").trim(),
      }))
      .filter((x) => x.title && x.signal && ["low", "medium", "high"].includes(x.confidence))
      .slice(0, 12);

    const out = { updated: new Date().toISOString(), items: cleaned };

    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n", "utf8");
    console.log(`Wrote ${cleaned.length} signals to ${OUT_PATH}`);
  } catch (err) {
    console.error("Signals generation failed:", err?.message || err);
    console.log("Keeping existing signals.json unchanged.");
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(OUT_PATH, JSON.stringify(previous, null, 2) + "\n", "utf8");
    process.exit(0);
  }
}

main();