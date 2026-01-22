// scripts/generate-scores.mjs
// Generates: assets/data/scores.json
// Uses football-data.org (requires API token)
//
// Env:
//   NETTHUD_SCORES_API_PROVIDER=football-data
//   NETTHUD_SCORES_API_TOKEN=xxxxxxxx
// Optional:
//   NETTHUD_SCORES_FINAL_DAYS=3        (default 3, calendar days including today)
//   NETTHUD_SCORES_LIMIT=120          (default 120; set 0 for "no limit")
//   NETTHUD_SCORES_COMP_CODES=PL,PD,SA,BL1,FL1,CL,EL (optional allowlist)

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

function yyyyMmDdUTC(d) {
  return d.toISOString().slice(0, 10);
}

function utcMidnight(dateObj) {
  return new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate()));
}

function mapFootballDataStatus(status) {
  const s = safeStr(status || "").toUpperCase();
  // normalize for your index.html logic
  switch (s) {
    case "FINISHED":
      return "FT";
    case "IN_PLAY":
      return "LIVE";
    case "PAUSED":
      return "HT";
    default:
      return s;
  }
}

function calcScore(fdMatch) {
  // Prefer fullTime; if not there, fall back to halfTime
  const ft = fdMatch?.score?.fullTime;
  const ht = fdMatch?.score?.halfTime;

  const homeFT = ft?.home;
  const awayFT = ft?.away;
  if (Number.isFinite(homeFT) && Number.isFinite(awayFT)) return `${homeFT}–${awayFT}`;

  const homeHT = ht?.home;
  const awayHT = ht?.away;
  if (Number.isFinite(homeHT) && Number.isFinite(awayHT)) return `${homeHT}–${awayHT}`;

  return "";
}

function leagueNameFromCompetition(comp) {
  return safeStr(comp?.name || "");
}

function competitionCode(comp) {
  return safeStr(comp?.code || "").toUpperCase();
}

function parseAllowlist() {
  const raw = env("NETTHUD_SCORES_COMP_CODES", "").trim();
  if (!raw) return null; // no filtering
  const set = new Set(
    raw
      .split(",")
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean)
  );
  return set.size ? set : null;
}

async function fetchFootballData(url, token) {
  const res = await fetch(url, { headers: { "X-Auth-Token": token } });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`football-data HTTP ${res.status} ${res.statusText} :: ${t.slice(0, 200)}`);
  }
  return res.json();
}

function clampInt(n, lo, hi) {
  const x = Math.trunc(Number(n));
  if (!Number.isFinite(x)) return null;
  return Math.max(lo, Math.min(hi, x));
}

function computeMinuteFromKickoffUTC(kickoffUTC, statusNorm) {
  const kick = new Date(kickoffUTC);
  if (!kickoffUTC || Number.isNaN(kick.getTime())) return null;

  const now = new Date();
  const diffMin = Math.floor((now.getTime() - kick.getTime()) / 60000);

  let m = clampInt(diffMin, 0, 130);
  if (m == null) return null;

  const st = String(statusNorm || "").toUpperCase();

  if (st === "HT") {
    // cap around 45' for a clean UI
    if (m > 60) m = 45;
    if (m < 35) m = 45;
  }

  if (st === "LIVE" && m < 0) m = 0;

  return m;
}

function youtubeHighlightsUrl(home, away) {
  const q = `${safeStr(home)} vs ${safeStr(away)} highlights`.trim();
  const u = new URL("https://www.youtube.com/results");
  u.searchParams.set("search_query", q);
  return u.toString();
}

function stableMatchId(m) {
  // Prefer football-data numeric id. Fallback to a deterministic composite.
  const id = m?.id;
  if (id != null && id !== "") return `fd:${id}`;
  const code = competitionCode(m?.competition);
  const utc = safeStr(m?.utcDate || "");
  const home = safeStr(m?.homeTeam?.shortName || m?.homeTeam?.name || "");
  const away = safeStr(m?.awayTeam?.shortName || m?.awayTeam?.name || "");
  return `${code}|${utc}|${home}|${away}`.toLowerCase();
}

function mapMatch(m) {
  const league = leagueNameFromCompetition(m?.competition);
  const code = competitionCode(m?.competition);

  const home = safeStr(m?.homeTeam?.shortName || m?.homeTeam?.name);
  const away = safeStr(m?.awayTeam?.shortName || m?.awayTeam?.name);

  const score = calcScore(m);
  const status = mapFootballDataStatus(m?.status);

  const kickoffUTC = safeStr(m?.utcDate || "");
  const when = kickoffUTC ? kickoffUTC.slice(0, 10) : "";

  const minute =
    status === "LIVE" || status === "HT"
      ? computeMinuteFromKickoffUTC(kickoffUTC, status)
      : null;

  // highlight link only for FT; for LIVE/HT your index.html already falls back to YT search
  const highlightsUrl = status === "FT" ? youtubeHighlightsUrl(home, away) : "";

  const url = "";

  return {
    id: stableMatchId(m),
    league,
    code,
    home,
    away,
    score,
    status,     // LIVE / HT / FT (plus any other passthroughs)
    when,       // YYYY-MM-DD
    kickoffUTC, // ISO timestamp
    minute,     // integer (or null)
    highlightsUrl,
    url,
  };
}

function parseLimit() {
  const raw = env("NETTHUD_SCORES_LIMIT", "120");
  const n = Number(raw);
  if (Number.isFinite(n) && n === 0) return Infinity;
  const v = Number.isFinite(n) ? n : 120;
  return Math.max(20, Math.min(500, v));
}

async function fetchFootballDataScores() {
  const token = env("NETTHUD_SCORES_API_TOKEN");
  if (!token) throw new Error("Missing env: NETTHUD_SCORES_API_TOKEN");

  const allow = parseAllowlist();
  const limit = parseLimit();
  const finalDays = Math.max(1, Math.min(14, Number(env("NETTHUD_SCORES_FINAL_DAYS", "3")) || 3));

  // 1) LIVE/HT via status
  const [liveJson1, liveJson2] = await Promise.all([
    fetchFootballData("https://api.football-data.org/v4/matches?status=IN_PLAY", token),
    fetchFootballData("https://api.football-data.org/v4/matches?status=PAUSED", token),
  ]);

  const liveMatches = [
    ...(Array.isArray(liveJson1?.matches) ? liveJson1.matches : []),
    ...(Array.isArray(liveJson2?.matches) ? liveJson2.matches : []),
  ];

  // 2) FINISHED for last N calendar days including today
  const now = new Date();
  const today = utcMidnight(now);

  // If finalDays=3, we want: today, yesterday, day-2
  const fromD = new Date(today);
  fromD.setUTCDate(today.getUTCDate() - (finalDays - 1));

  // +1 day safety so today’s late finished games aren’t missed
  const toPlusOne = new Date(today);
  toPlusOne.setUTCDate(today.getUTCDate() + 1);

  const dateFrom = yyyyMmDdUTC(fromD);
  const dateTo = yyyyMmDdUTC(toPlusOne);

  const finishedJson = await fetchFootballData(
    `https://api.football-data.org/v4/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`,
    token
  );

  const finishedMatches = (Array.isArray(finishedJson?.matches) ? finishedJson.matches : []).filter(
    (m) => safeStr(m?.status).toUpperCase() === "FINISHED"
  );

  // Map
  const mapped = [...liveMatches, ...finishedMatches].map(mapMatch);

  // Allowlist filter
  const filtered = allow ? mapped.filter((x) => !x.code || allow.has(x.code)) : mapped;

  // Deduplicate by stable id; keep the “best” version if duplicates exist
  // Priority: LIVE/HT over FT; more recent kickoff over older; non-empty score over empty
  const rank = (s) => (s === "LIVE" ? 0 : s === "HT" ? 1 : s === "FT" ? 2 : 3);

  const byId = new Map();
  for (const it of filtered) {
    const prev = byId.get(it.id);
    if (!prev) {
      byId.set(it.id, it);
      continue;
    }

    const a = prev;
    const b = it;

    const ra = rank(a.status);
    const rb = rank(b.status);

    if (rb < ra) {
      byId.set(it.id, it);
      continue;
    }
    if (rb > ra) continue;

    // same rank: prefer newer kickoffUTC
    const ak = safeStr(a.kickoffUTC || "");
    const bk = safeStr(b.kickoffUTC || "");
    if (bk > ak) {
      byId.set(it.id, it);
      continue;
    }

    // prefer non-empty score
    if (!a.score && b.score) byId.set(it.id, it);
  }

  const unique = Array.from(byId.values());

  // Sort: LIVE, HT, FT; then most recent kickoff first
  unique.sort((a, b) => {
    const r = rank(a.status) - rank(b.status);
    if (r !== 0) return r;
    return safeStr(b.kickoffUTC || b.when).localeCompare(safeStr(a.kickoffUTC || a.when));
  });

  const trimmed = Number.isFinite(limit) ? unique.slice(0, limit) : unique;

  // Remove internal "code" before writing (keep output compatible with your index.html)
  const items = trimmed.map(({ code, ...rest }) => rest);

  return {
    updated: isoNow(),
    generatedAt: isoNow(),
    items,
  };
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