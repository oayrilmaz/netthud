// scripts/generate-live.mjs
// DEMO generator for assets/data/scores.json (UI-compatible)
// Safe for when football-data.org is rate-limited.
//
// Output shape matches what index.html expects:
// {
//   updated: ISO,
//   items: [{ home, away, league, status, when, kickoffUTC, score, highlightsUrl }]
// }

import fs from "node:fs/promises";

function isoNow() {
  return new Date().toISOString();
}

function fmtWhen(utcISO) {
  // keep it simple for UI: YYYY-MM-DD or ISO slice
  return utcISO ? utcISO.slice(0, 10) : "";
}

function demoScores() {
  const now = new Date();
  const minute = (now.getUTCMinutes() % 90) + 1;

  // Fake kickoff times so sorting works nicely
  const t0 = new Date(now.getTime() - 20 * 60 * 1000).toISOString();
  const t1 = new Date(now.getTime() - 35 * 60 * 1000).toISOString();
  const t2 = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const t3 = new Date(now.getTime() - 90 * 60 * 1000).toISOString();
  const t4 = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString();

  return [
    {
      league: "Premier League",
      home: "Arsenal",
      away: "Liverpool",
      status: "LIVE",
      score: "1–0",
      kickoffUTC: t0,
      when: `LIVE • ${minute}'`,
      highlightsUrl: ""
    },
    {
      league: "La Liga",
      home: "Real Madrid",
      away: "Barcelona",
      status: "LIVE",
      score: "0–0",
      kickoffUTC: t1,
      when: `LIVE • ${Math.max(1, minute - 7)}'`,
      highlightsUrl: ""
    },
    {
      league: "Süper Lig",
      home: "Fenerbahçe",
      away: "Galatasaray",
      status: "HT",
      score: "1–1",
      kickoffUTC: t2,
      when: "HT",
      highlightsUrl: ""
    },
    {
      league: "Bundesliga",
      home: "Bayern Munich",
      away: "Borussia Dortmund",
      status: "LIVE",
      score: "1–1",
      kickoffUTC: t3,
      when: `LIVE • ${Math.max(1, minute - 33)}'`,
      highlightsUrl: ""
    },
    {
      league: "Ligue 1",
      home: "PSG",
      away: "Marseille",
      status: "FT",
      score: "3–2",
      kickoffUTC: t4,
      when: fmtWhen(t4),
      highlightsUrl: ""
    }
  ];
}

async function main() {
  const items = demoScores();

  const out = {
    updated: isoNow(),
    mode: "demo",
    items
  };

  await fs.mkdir("assets/data", { recursive: true });
  await fs.writeFile("assets/data/scores.json", JSON.stringify(out, null, 2) + "\n", "utf8");

  console.log(`✔ wrote assets/data/scores.json (${items.length} matches)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});