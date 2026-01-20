// scripts/generate-scores.mjs
// Generates: assets/data/scores.json
// Uses football-data.org (requires API token)
// Env:
//   NETTHUD_SCORES_API_PROVIDER=football-data
//   NETTHUD_SCORES_API_TOKEN=xxxxxxxx

import fs from "node:fs";
import path from "node:path";

function env(name, fallback = "") {
  const v = process.env[name];
  return v == null || v === "" ? fallback : v;
}

function isoNow() {
  return new Date().toISOString();
}

function safeStr(x) {
  return x == null ? "" : String(x);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function mapFootballDataStatus(status) {
  switch (status) {
    case "FINISHED":
      return "FT";
    case "IN_PLAY":
      return "LIVE";
    case "PAUSED":
      return "HT";
    case "TIMED":
    case "SCHEDULED":
      return "UP";
    default:
      return safeStr(status || "");
  }
}

function calcScore(fdMatch) {
  const ft = fdMatch?.score?.fullTime;
  const ht = fdMatch?.score?.halfTime;

  const homeFT = ft?.home;
  const awayFT = ft?.away;

  if (Number.isFinite(homeFT) && Number.isFinite(awayFT)) {
    return `${homeFT}–${awayFT}`;
  }

  const homeHT = ht?.home;
  const awayHT = ht?.away;
  if (Number.isFinite(homeHT) && Number.isFinite(awayHT)) {
    return `${homeHT}–${awayHT}`;
  }

  return "";
}

function leagueNameFromCompetition(comp) {
  return safeStr(comp?.name || "");
}

function yyyyMmDdUTC(d) {
  return d.toISOString().slice(0, 10);
}

function utcMidnight(dateObj) {
  return new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate()));
}

async function fetchFootballDataScores() {
  const token = env("NETTHUD_SCORES_API_TOKEN");
  if (!token) {
    throw new Error("Missing env: NETTHUD_SCORES_API_TOKEN");
  }

  // ✅ last 7 days to avoid empty results
  const now = new Date();
  const today = utcMidnight(now);
  const dateFromD = new Date(today);
  dateFromD.setUTCDate(today.getUTCDate() - 7);

  const dateFrom = yyyyMmDdUTC(dateFromD);
  const dateTo = yyyyMmDdUTC(today);

  const url = `https://api.football-data.org/v4/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;

  const res = await fetch(url, {
    headers: { "X-Auth-Token": token },
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`football-data HTTP ${res.status} ${res.statusText} :: ${t.slice(0, 200)}`);
  }

  const json = await res.json();
  const matches = Array.isArray(json?.matches) ? json.matches : [];

  // ✅ keep REAL score states only
  const keep = matches.filter((m) => {
    const st = safeStr(m?.status);
    return st === "FINISHED" || st === "IN_PLAY" || st === "PAUSED";
  });

  // ✅ write your site's schema: { updated, items:[...] }
  const items = keep.map((m) => {
    const league = leagueNameFromCompetition(m?.competition);
    const home = safeStr(m?.homeTeam?.shortName || m?.homeTeam?.name);
    const away = safeStr(m?.awayTeam?.shortName || m?.awayTeam?.name);

    const score = calcScore(m);
    const status = mapFootballDataStatus(m?.status);
    const when = safeStr(m?.utcDate || "").slice(0, 10);

    return { league, home, away, score, status, when };
  });

  // Sort: LIVE/HT first, then FT (newest first)
  const rank = (s) => (s === "LIVE" ? 0 : s === "HT" ? 1 : 2);
  items.sort((a, b) => {
    const r = rank(a.status) - rank(b.status);
    if (r !== 0) return r;
    return safeStr(b.when).localeCompare(safeStr(a.when));
  });

  return { updated: isoNow(), items };
}

async function main() {
  const provider = env("NETTHUD_SCORES_API_PROVIDER", "football-data");
  const outFile = path.join(process.cwd(), "assets", "data", "scores.json");

  let payload;
  if (provider === "football-data") {
    payload = await fetchFootballDataScores();
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  writeJson(outFile, payload);
  console.log(`Wrote ${outFile} (${payload.items.length} items)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});