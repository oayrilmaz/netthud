// scripts/generate-scores.mjs
// Generates: assets/data/scores.json
// Uses football-data.org (requires API token)
//
// Env:
//   NETTHUD_SCORES_API_PROVIDER=football-data
//   NETTHUD_SCORES_API_TOKEN=xxxxxxxx
// Optional:
//   NETTHUD_SCORES_FINAL_DAYS=3        (default 3)
//   NETTHUD_SCORES_LIMIT=120          (default 120)
//   NETTHUD_SCORES_COMP_CODES=PL,PD,SA,BL1,FL1,CL,EL (optional allowlist)
//     - If set, we only keep those competition codes (helps keep feed “big leagues only”)

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
  // normalize for your index.html logic
  switch (status) {
    case "FINISHED":
      return "FT";
    case "IN_PLAY":
      return "LIVE";
    case "PAUSED":
      return "HT";
    default:
      return safeStr(status || "");
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
  return safeStr(comp?.code || "");
}

function parseAllowlist() {
  const raw = env("NETTHUD_SCORES_COMP_CODES", "").trim();
  if (!raw) return null; // no filtering
  const set = new Set(
    raw
      .split(",")
      .map((x) => x.trim())
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
  // football-data doesn't reliably provide "minute", so we compute it from kickoff time.
  // This stays legal (public timestamp) and robust.
  const kick = new Date(kickoffUTC);
  if (!kickoffUTC || Number.isNaN(kick.getTime())) return null;

  const now = new Date();
  const diffMin = Math.floor((now.getTime() - kick.getTime()) / 60000);

  // Basic caps for sanity
  let m = clampInt(diffMin, 0, 130);
  if (m == null) return null;

  // If HT, cap around 45 (still useful/clean UI)
  if (String(statusNorm).toUpperCase() === "HT") {
    if (m > 60) m = 45;
    if (m < 35) m = 45; // many feeds mark HT slightly late/early; show 45'
  }

  // If LIVE but extremely small/negative due to schedule shifts, clean it
  if (String(statusNorm).toUpperCase() === "LIVE" && m < 0) m = 0;

  return m;
}

function youtubeHighlightsUrl(home, away) {
  const q = `${safeStr(home)} vs ${safeStr(away)} highlights`.trim();
  const u = new URL("https://www.youtube.com/results");
  u.searchParams.set("search_query", q);
  return u.toString();
}

function mapMatch(m) {
  const league = leagueNameFromCompetition(m?.competition);
  const code = competitionCode(m?.competition);
  const home = safeStr(m?.homeTeam?.shortName || m?.homeTeam?.name);
  const away = safeStr(m?.awayTeam?.shortName || m?.awayTeam?.name);

  const score = calcScore(m);
  const status = mapFootballDataStatus(m?.status);

  // Keep "when" as date for existing UI, but ALSO provide kickoffUTC for minute/highlights logic
  const kickoffUTC = safeStr(m?.utcDate || "");
  const when = kickoffUTC ? kickoffUTC.slice(0, 10) : "";

  const minute =
    status === "LIVE" || status === "HT"
      ? computeMinuteFromKickoffUTC(kickoffUTC, status)
      : null;

  const highlightsUrl = status === "FT" ? youtubeHighlightsUrl(home, away) : "";

  // Optional: you can wire a match detail url later if you have a route; keep empty for now
  const url = "";

  return {
    league,
    code,
    home,
    away,
    score,
    status,       // LIVE / HT / FT
    when,         // YYYY-MM-DD
    kickoffUTC,   // full timestamp ISO
    minute,       // integer (or null)
    highlightsUrl,
    url
  };
}

async function fetchFootballDataScores() {
  const token = env("NETTHUD_SCORES_API_TOKEN");
  if (!token) throw new Error("Missing env: NETTHUD_SCORES_API_TOKEN");

  const allow = parseAllowlist();
  const limit = Math.max(20, Math.min(400, Number(env("NETTHUD_SCORES_LIMIT", "120")) || 120));
  const finalDays = Math.max(1, Math.min(14, Number(env("NETTHUD_SCORES_FINAL_DAYS", "3")) || 3));

  // ✅ 1) LIVE matches (IN_PLAY + PAUSED) fetched directly via status filter
  const liveJson1 = await fetchFootballData(
    "https://api.football-data.org/v4/matches?status=IN_PLAY",
    token
  );
  const liveJson2 = await fetchFootballData(
    "https://api.football-data.org/v4/matches?status=PAUSED",
    token
  );

  const liveMatches = [
    ...(Array.isArray(liveJson1?.matches) ? liveJson1.matches : []),
    ...(Array.isArray(liveJson2?.matches) ? liveJson2.matches : []),
  ];

  // ✅ 2) Recent FINISHED matches (last N days) for "Final scores"
  const now = new Date();
  const today = utcMidnight(now);
  const fromD = new Date(today);
  fromD.setUTCDate(today.getUTCDate() - finalDays);

  // +1 day safety so today’s finished games are not missed
  const toPlusOne = new Date(today);
  toPlusOne.setUTCDate(today.getUTCDate() + 1);

  const dateFrom = yyyyMmDdUTC(fromD);
  const dateTo = yyyyMmDdUTC(toPlusOne);

  const finishedJson = await fetchFootballData(
    `https://api.football-data.org/v4/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`,
    token
  );

  const finishedMatches = (Array.isArray(finishedJson?.matches) ? finishedJson.matches : []).filter(
    (m) => safeStr(m?.status) === "FINISHED"
  );

  // Map + merge
  const mapped = [...liveMatches, ...finishedMatches].map(mapMatch);

  // Optional allowlist filter
  const filtered = allow
    ? mapped.filter((x) => !x.code || allow.has(x.code))
    : mapped;

  // Deduplicate (same match can appear twice across queries)
  const seen = new Set();
  const unique = [];
  for (const it of filtered) {
    const k = [
      it.code,
      it.home,
      it.away,
      it.kickoffUTC || it.when,
      it.status,
      it.score
    ].join("|");
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(it);
  }

  // Sort: LIVE first, then HT, then FT (most recent kickoff first)
  const rank = (s) => (s === "LIVE" ? 0 : s === "HT" ? 1 : 2);
  unique.sort((a, b) => {
    const r = rank(a.status) - rank(b.status);
    if (r !== 0) return r;
    return safeStr(b.kickoffUTC || b.when).localeCompare(safeStr(a.kickoffUTC || a.when));
  });

  // Trim & remove internal "code" before writing
  const items = unique.slice(0, limit).map(({ code, ...rest }) => rest);

  return {
    updated: isoNow(),
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