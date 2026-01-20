import fs from "fs/promises";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function openaiJSON({ apiKey, system, user }) {
  const url = "https://api.openai.com/v1/responses";
  const body = {
    model: "gpt-4.1-mini",
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    text: { format: { type: "json_object" } },
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`OpenAI error ${r.status}: ${t}`);
  }

  const data = await r.json();
  const text =
    data?.output?.[0]?.content?.find((c) => c.type === "output_text")?.text ||
    data?.output_text ||
    "";

  if (!text) throw new Error("OpenAI returned empty output_text");

  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error(`OpenAI did not return valid JSON. Raw text:\n${text}`);
  }

  if (!obj.items || !Array.isArray(obj.items)) {
    throw new Error(`JSON missing 'items' array. Got:\n${JSON.stringify(obj, null, 2)}`);
  }
  return obj;
}

async function main() {
  const apiKey = requireEnv("OPENAI_API_KEY");

  const system =
    "You are NetThud AI. Generate original football 'signals' as short analyst bullets. " +
    "No external sources. No links except netthud.com. Strict JSON only.";

  const user =
    "Create 12 signals for today. Each signal must include: title, what it means, and a confidence (0-100). " +
    "Keep them general (league-wide, style-wide), not claiming real-time injuries or confirmed events. " +
    "Return STRICT JSON:\n" +
    "{\n" +
    '  "generatedAt": "ISO-8601",\n' +
    '  "source": "NetThud AI",\n' +
    '  "items": [\n' +
    "    {\n" +
    '      "title": "string",\n' +
    '      "signal": "string (<= 160 chars)",\n' +
    '      "meaning": "string (<= 220 chars)",\n' +
    '      "confidence": 0,\n' +
    '      "tag": "one of: PRESS|TRANSITION|SETPIECE|DISCIPLINE|FATIGUE|VOLATILITY|DEFENSE|ATTACK",\n' +
    '      "publishedAt": "ISO-8601",\n' +
    '      "url": "https://netthud.com/#signals"\n' +
    "    }\n" +
    "  ]\n" +
    "}";

  const obj = await openaiJSON({ apiKey, system, user });

  const now = new Date().toISOString();
  const items = obj.items.slice(0, 20).map((x) => ({
    title: String(x.title || "").trim() || "Market signal",
    signal: String(x.signal || "").trim().slice(0, 160),
    meaning: String(x.meaning || "").trim().slice(0, 220),
    confidence: Math.max(0, Math.min(100, Number(x.confidence ?? 55))),
    tag: String(x.tag || "VOLATILITY").toUpperCase(),
    publishedAt: x.publishedAt ? new Date(x.publishedAt).toISOString() : now,
    url: "https://netthud.com/#signals",
    source: "NetThud AI",
  }));

  const out = { generatedAt: now, source: "NetThud AI", items };

  await fs.mkdir("assets/data", { recursive: true });
  await fs.writeFile("assets/data/signals.json", JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Wrote assets/data/signals.json with ${items.length} items`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
