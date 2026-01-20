// scripts/generate-scores.mjs
// Generates: assets/data/scores.json
// Uses football-data.org (requires API token)
// Env:
//   NETTHUD_SCORES_API_PROVIDER=football-data
//   NETTHUD_SCORES_API_TOKEN=xxxxxxxx
// Optional:
//   NETTHUD_SCORES_DAYS_BACK=7

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
  switch (safeStr(status)) {
    case "FINISHED":
      return "FT";
    case "IN_PLAY":
      return "LIVE";
    case "PAUSED":
      return "HT";
    case "SUSPENDED":
      return "LIVE";
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

async function httpJson(url, token) {
  const res = await fetch(url, { headers: { "X-Auth-Token": token } });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`football-data HTTP ${res.status} ${res.statusText} :: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text || "{}");
}

async function tryFetchMatches(url, token) {
  try {
    const json = await httpJson(url, token);
    const matches = Array.isArray(json?.matches) ? json.matches : [];
    return matches;
  } catch (e) {
    // silently fail, caller will fallback
    return [];
  }
}

function normalizeMatch(m) {
  const league = leagueNameFromCompetition(m?.competition);
  const home = safeStr(m?.homeTeam?.shortName || m?.homeTeam?.name);
  const away = safeStr(m?.awayTeam?.shortName || m?.awayTeam?.name);
  const score = calcScore(m);
  const status = mapFootballDataStatus(m?.status);
  const when = safeStr(m?.utcDate || "").slice(0, 10);
  return {
    id: m?.id,
    league,
    home,
    away,
    score,
    status,
    when,
  };
}

async function fetchFootballDataScores() {
  const token = env("NETTHUD_SCORES_API_TOKEN");
  if (!token) {
    throw new Error("Missing env: NETTHUD_SCORES_API_TOKEN");
  }

  const daysBack = Math.max(1, parseInt(env("NETTHUD_SCORES_DAYS_BACK", "7"), 10) || 7);

  // ✅ Use UTC midnight boundaries; set dateTo to TOMORROW so "today" is always included.
  const now = new Date();
  const today = utcMidnight(now);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(today.getUTCDate() + 1);

  const dateFromD = new Date(today);
  dateFromD.setUTCDate(today.getUTCDate() - daysBack);

  const dateFrom = yyyyMmDdUTC(dateFromD);
  const dateTo = yyyyMmDdUTC(tomorrow);

  // ✅ 1) Try to fetch LIVE right now (some plans/APIs behave better with status queries)
  const base = "https://api.football-data.org/v4/matches";
  const liveUrls = [
    `${base}?status=LIVE`,      // if supported
    `${base}?status=IN_PLAY`,   // common status
    `${base}?status=PAUSED`,    // halftime
  ];

  let liveMatches = [];
  for (const u of liveUrls) {
    const ms = await tryFetchMatches(u, token);
    if (ms.length) {
      liveMatches = ms;
      break;
    }
  }

  // ✅ 2) Fetch recent results window (finished + any live/paused inside window)
  const windowUrl = `${base}?dateFrom=${dateFrom}&dateTo=${dateTo}`;
  const windowJson = await httpJson(windowUrl, token);
  const windowMatches = Array.isArray(windowJson?.matches) ? windowJson.matches : [];

  // ✅ Combine + de-dupe by match id
  const byId = new Map();
  for (const m of [...windowMatches, ...liveMatches]) {
    if (!m) continue;
    const id = m.id ?? `${m?.utcDate || ""}-${m?.homeTeam?.id || ""}-${m?.awayTeam?.id || ""}`;
    byId.set(id, m);
  }

  const matches = Array.from(byId.values());

  // ✅ keep REAL score states only (LIVE-like + FINISHED)
  const keep = matches.filter((m) => {
    const st = safeStr(m?.status);
    return st === "FINISHED" || st === "IN_PLAY" || st === "PAUSED" || st === "SUSPENDED" || st === "LIVE";
  });

  const items = keep.map(normalizeMatch);

  // Sort: LIVE/HT first, then FT (newest first)
  const rank = (s) => (s === "LIVE" ? 0 : s === "HT" ? 1 : 2);
  items.sort((a, b) => {
    const r = rank(a.status) - rank(b.status);
    if (r !== 0) return r;

    // Prefer most recent date, then stable by league/home
    const dw = safeStr(b.when).localeCompare(safeStr(a.when));
    if (dw !== 0) return dw;

    const dl = safeStr(a.league).localeCompare(safeStr(b.league));
    if (dl !== 0) return dl;

    return safeStr(a.home).localeCompare(safeStr(b.home));
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