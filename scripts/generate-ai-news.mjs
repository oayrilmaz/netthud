import fs from "fs/promises";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function openaiJSON({ apiKey, system, user, schemaHint }) {
  const url = "https://api.openai.com/v1/responses";
  const body = {
    model: "gpt-4.1-mini",
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    // Strongly encourage valid JSON:
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

  // Responses API usually returns text in output[0].content[0].text
  const text =
    data?.output?.[0]?.content?.find((c) => c.type === "output_text")?.text ||
    data?.output_text ||
    "";

  if (!text) throw new Error("OpenAI returned empty output_text");

  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    throw new Error(`OpenAI did not return valid JSON. Raw text:\n${text}`);
  }

  // Optional: schema sanity check
  if (!obj.items || !Array.isArray(obj.items)) {
    throw new Error(`JSON missing 'items' array. Got:\n${JSON.stringify(obj, null, 2)}`);
  }
  return obj;
}

async function main() {
  const apiKey = requireEnv("OPENAI_API_KEY");

  const system =
    "You are NetThud AI. Generate original, concise football intelligence headlines. " +
    "Do NOT reference or link to external news sites. No ESPN, BBC, Guardian, etc. " +
    "Write like an analyst: short, factual, actionable. Output STRICT JSON only.";

  const user =
    "Create 20 NetThud AI news items about football today. " +
    "Topics can include: tactical trends, form shifts, injury impact (generic), schedule congestion, " +
    "pressing intensity, set-piece edge, late-goal volatility, under/over performance signals. " +
    "No club rumors unless phrased as 'market chatter' without sources. " +
    "Return JSON with this structure:\n" +
    "{\n" +
    '  "generatedAt": "ISO-8601",\n' +
    '  "source": "NetThud AI",\n' +
    '  "items": [\n' +
    "    {\n" +
    '      "title": "string",\n' +
    '      "summary": "string (<= 180 chars)",\n' +
    '      "tag": "one of: TACTICS|FORM|INJURY|SCHEDULE|DISCIPLINE|SETPIECES|VOLATILITY|XG|DEFENSE|ATTACK",\n' +
    '      "publishedAt": "ISO-8601",\n' +
    '      "url": "https://netthud.com/#ai"\n' +
    "    }\n" +
    "  ]\n" +
    "}";

  const obj = await openaiJSON({ apiKey, system, user });

  const now = new Date().toISOString();
  const items = obj.items
    .filter((x) => x && typeof x.title === "string" && typeof x.summary === "string")
    .slice(0, 30)
    .map((x) => ({
      title: x.title.trim(),
      summary: x.summary.trim().slice(0, 180),
      tag: (x.tag || "FORM").toString().toUpperCase(),
      publishedAt: x.publishedAt ? new Date(x.publishedAt).toISOString() : now,
      url: "https://netthud.com/#ai",
      source: "NetThud AI",
    }));

  const out = {
    generatedAt: now,
    source: "NetThud AI",
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
