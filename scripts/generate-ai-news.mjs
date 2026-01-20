// scripts/generate-ai-news.mjs
import fs from "fs/promises";

const FOOTBALL_DATA_TOKEN = process.env.FOOTBALL_DATA_TOKEN || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

const OUT_PATH = "assets/data/ai-news.json";

// Choose a reasonable free-tier-friendly set of competitions (football-data.org)
const COMPETITIONS = [
  { code: "PL", name: "Premier League" },
  { code: "PD", name: "La Liga" },
  { code: "SA", name: "Serie A" },
  { code: "BL1", name: "Bundesliga" },
  { code: "FL1", name: "Ligue 1" },
];

function isoNow() {
  return new Date().toISOString();
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      "X-Auth-Token": FOOTBALL_DATA_TOKEN,
      "User-Agent": "netthud-bot/1.0",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`football-data fetch failed ${res.status}: ${url}\n${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`football-data returned non-JSON for ${url}: ${text.slice(0, 200)}`);
  }
}

function compactMatch(m) {
  const home = m?.homeTeam?.name || "Home";
  const away = m?.awayTeam?.name || "Away";
  const utcDate = m?.utcDate || null;
  const status = m?.status || "";
  const score =
    m?.score?.fullTime
      ? `${m.score.fullTime.home ?? ""}-${m.score.fullTime.away ?? ""}`
      : "";
  const ht =
    m?.score?.halfTime
      ? `${m.score.halfTime.home ?? ""}-${m.score.halfTime.away ?? ""}`
      : "";
  return { home, away, utcDate, status, score, ht, matchday: m?.matchday ?? null };
}

async function getRecentAndUpcoming() {
  if (!FOOTBALL_DATA_TOKEN) {
    throw new Error("Missing FOOTBALL_DATA_TOKEN env var (add as GitHub secret).");
  }

  const all = [];
  for (const c of COMPETITIONS) {
    // last 7 days results
    const finished = await fetchJson(
      `https://api.football-data.org/v4/competitions/${c.code}/matches?status=FINISHED&dateFrom=${daysAgo(
        7
      )}&dateTo=${daysAgo(0)}`
    );

    // next 7 days scheduled
    const upcoming = await fetchJson(
      `https://api.football-data.org/v4/competitions/${c.code}/matches?status=SCHEDULED&dateFrom=${daysAgo(
        0
      )}&dateTo=${daysAgo(-7)}`
    );

    all.push({
      competition: c.name,
      competitionCode: c.code,
      finished: (finished.matches || []).map(compactMatch).slice(-20),
      upcoming: (upcoming.matches || []).map(compactMatch).slice(0, 20),
    });
  }

  return all;
}

// daysAgo(7) => ISO date (YYYY-MM-DD) of 7 days ago
// daysAgo(-7) => ISO date 7 days in future
function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function openaiJson(prompt, schemaHint) {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY env var (add as GitHub secret).");
  }

  const body = {
    model: "gpt-4o-mini",
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are NetThud AI. Create short, actionable football 'signals' and summary items. No external news, no rumors, no fabricated facts. Use only the provided match data.",
      },
      {
        role: "user",
        content: `${prompt}\n\nReturn JSON only matching this shape:\n${schemaHint}`,
      },
    ],
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI API failed ${res.status}: ${text.slice(0, 500)}`);
  }

  const json = JSON.parse(text);
  const content = json?.choices?.[0]?.message?.content || "{}";
  return JSON.parse(content);
}

function buildPrompt(data) {
  return `
DATA (authoritative): football-data.org match results + fixtures for selected leagues.

TASK:
Create 12 items total:
- 6 "Signals" derived from recent FINISHED matches (last 7 days)
- 6 "Watch" items derived from UPCOMING matches (next 7 days)

Rules:
- Must cite which league + match or trend it is based on (use team names + dates).
- No transfer rumors (unless present in the data, which it isn't).
- No mentioning ESPN/BBC/Guardian or any publisher.
- Keep each title <= 70 chars, each summary <= 180 chars.
- Provide a "category": "signal" or "watch".
- Provide "league" (string).
- Provide "evidence" array with 1-3 short strings (e.g., "Inter 3-2 Juventus (2026-01-18)").
- Provide "url" as "https://netthud.com/" (placeholder link).

DATA:
${JSON.stringify(data, null, 2)}
`;
}

async function main() {
  const data = await getRecentAndUpcoming();

  const schemaHint = `{
  "generatedAt": "ISO-8601 string",
  "mode": "openai",
  "items": [
    {
      "title": "string",
      "summary": "string",
      "category": "signal|watch",
      "league": "string",
      "evidence": ["string"],
      "url": "string"
    }
  ]
}`;

  const prompt = buildPrompt(data);

  const out = await openaiJson(prompt, schemaHint);

  // Normalize + safety
  const items = Array.isArray(out.items) ? out.items : [];
  const cleaned = items
    .map((x) => ({
      title: String(x.title || "").slice(0, 120),
      summary: String(x.summary || "").slice(0, 260),
      category: x.category === "watch" ? "watch" : "signal",
      league: String(x.league || ""),
      evidence: Array.isArray(x.evidence) ? x.evidence.slice(0, 3).map(String) : [],
      url: "https://netthud.com/",
    }))
    .filter((x) => x.title && x.summary);

  const finalOut = {
    generatedAt: isoNow(),
    mode: "openai",
    items: cleaned.slice(0, 30),
  };

  await fs.mkdir("assets/data", { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(finalOut, null, 2) + "\n", "utf8");
  console.log(`Wrote ${OUT_PATH} with ${finalOut.items.length} items`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
