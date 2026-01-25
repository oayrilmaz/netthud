// scripts/generate-upcoming.mjs
// Generates: assets/data/upcoming.json
//
// Uses football-data.org (requires API token)
// Env:
//   NETTHUD_SCORES_API_TOKEN=xxxxxxxx
//   NETTHUD_UPCOMING_DAYS=7            (optional, 1..14)
//   NETTHUD_UPCOMING_LIMIT=80          (optional; set 0 for "no limit")
//   NETTHUD_UPCOMING_COMP_CODES=PL,PD,SA,BL1,FL1,CL,EL,EC (optional override)
//
// TV mapping (optional):
//   NETTHUD_TV_MAP_PATH=assets/data/tv.json  (optional; default shown)
//   If tv.json is missing, tv will remain [] (UI will show "TV: TBA").
//
// Adds H/D/A probabilities based on PUBLIC signals (standings strength + home advantage + closeness).
// Output includes: hda {home, draw, away} + model label.
// Also includes stable fields used by index.html: id, highlightsUrl

import fs from "node:fs";
import path from "node:path";

function env(name, fallback = "") {
  const v = process.env[name];
  return v == null || v === "" ? fallback : v;
}

function isoNow() {
  return new Date().toISOString();
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function safeStr(x) {
  return x == null ? "" : String(x);
}

function safeNum(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function yyyyMmDdUTC(d) {
  return d.toISOString().slice(0, 10);
}

function utcMidnight(dateObj) {
  return new Date(
    Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate())
  );
}

function formatET(utcDateISO) {
  // "Jan 20 • 3:00 PM ET"
  try {
    const d = new Date(utcDateISO);
    if (Number.isNaN(d.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).formatToParts(d);

    const get = (type) => parts.find((p) => p.type === type)?.value || "";
    const month = get("month");
    const day = get("day");
    const hour = get("hour");
    const minute = get("minute");
    const dayPeriod = get("dayPeriod"); // AM/PM
    return `${month} ${day} • ${hour}:${minute} ${dayPeriod} ET`;
  } catch {
    return "";
  }
}

/**
 * IMPORTANT:
 * - We must preserve competition order for the output (for UI/debug predictability)
 * - If NETTHUD_UPCOMING_COMP_CODES is provided, we preserve that exact order.
 */
function parseCompAllowlistWithOrder() {
  const raw = env("NETTHUD_UPCOMING_COMP_CODES", "").trim();
  if (raw) {
    const ordered = raw
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    return { set: new Set(ordered), ordered };
  }

  const ordered = [
    "PL",
    "PD",
    "SA",
    "BL1",
    "FL1",
    "DED",
    "PPL",
    "CL",
    "EL",
    "EC",
    "CLI",
    "FAC",
    "CDR",
    "DFB",
    "CIT",
  ];
  return { set: new Set(ordered), ordered };
}

async function fetchFD(url, token) {
  const res = await fetch(url, { headers: { "X-Auth-Token": token } });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`football-data HTTP ${res.status} ${res.statusText} :: ${t.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Standings cache: key by competitionId => Map(teamId => { rating, meta })
 * We fetch once per competition present in the upcoming window.
 */
async function fetchStandingsRatingsByCompetitionId(competitionId, token) {
  const json = await fetchFD(
    `https://api.football-data.org/v4/competitions/${competitionId}/standings`,
    token
  );

  const tables = Array.isArray(json?.standings) ? json.standings : [];
  const total = tables.find((s) => safeStr(s?.type).toUpperCase() === "TOTAL") || tables[0];
  const rows = Array.isArray(total?.table) ? total.table : [];

  const map = new Map();

  // rating = PPG + (GD per game)*0.35 + (GF per game)*0.10
  for (const r of rows) {
    const teamId = r?.team?.id;
    if (!teamId) continue;

    const played = Math.max(1, safeNum(r?.playedGames, 1));
    const points = safeNum(r?.points, 0);
    const gf = safeNum(r?.goalsFor, 0);
    const ga = safeNum(r?.goalsAgainst, 0);
    const gd = gf - ga;

    const ppg = points / played;
    const gdpg = gd / played;
    const gFpg = gf / played;

    const rating = ppg + gdpg * 0.35 + gFpg * 0.10;

    map.set(teamId, {
      rating,
      played,
      points,
      gf,
      ga,
      gd,
      position: safeNum(r?.position, 0),
      name: safeStr(r?.team?.shortName || r?.team?.name || ""),
    });
  }

  return map;
}

/**
 * Convert (homeRating - awayRating) into H/D/A.
 */
function computeHDA(homeRating, awayRating) {
  if (!Number.isFinite(homeRating) || !Number.isFinite(awayRating)) {
    return { home: 0.34, draw: 0.32, away: 0.34 };
  }

  const diff = homeRating - awayRating;

  const homeAdv = 0.18;
  const x = diff + homeAdv;

  const k = 1.65;
  const winNoDraw = 1 / (1 + Math.exp(-k * x));

  const closeness = Math.exp(-Math.abs(diff) * 1.25);
  let draw = 0.22 + 0.12 * closeness;
  draw = clamp(draw, 0.18, 0.36);

  const remaining = 1 - draw;

  let home = remaining * winNoDraw;
  let away = remaining * (1 - winNoDraw);

  const s = home + draw + away;
  home /= s;
  draw /= s;
  away /= s;

  const r4 = (n) => Math.round(n * 10000) / 10000;

  return { home: r4(home), draw: r4(draw), away: r4(away) };
}

function parseLimit() {
  // NETTHUD_UPCOMING_LIMIT:
  // - "0" or 0 means "no limit"
  // - otherwise clamp to a sane range
  const raw = env("NETTHUD_UPCOMING_LIMIT", "80");
  const n = Number(raw);
  if (Number.isFinite(n) && n === 0) return Infinity;

  const v = Number.isFinite(n) ? n : 80;
  return Math.max(10, Math.min(500, v));
}

/**
 * TV map loader (optional).
 * Default file: assets/data/tv.json
 *
 * Supported shapes:
 * 1) Simple by competition code:
 *    { "PL": ["NBC","Peacock"], "CL": ["Paramount+"] }
 *
 * 2) Optional overrides:
 *    {
 *      "byCompetition": { "PL": ["NBC","Peacock"] },
 *      "byMatchId": { "537619": ["ESPN+"] }
 *    }
 */
function loadTvMap() {
  const rel = env("NETTHUD_TV_MAP_PATH", "assets/data/tv.json");
  const filePath = path.isAbsolute(rel) ? rel : path.join(process.cwd(), rel);

  try {
    if (!fs.existsSync(filePath)) return { byCompetition: {}, byMatchId: {} };
    const raw = fs.readFileSync(filePath, "utf8");
    const json = JSON.parse(raw);

    // If it looks like a simple map (keys are league codes), accept it.
    const hasByCompetition = json && typeof json === "object" && json.byCompetition;
    const hasByMatchId = json && typeof json === "object" && json.byMatchId;

    if (hasByCompetition || hasByMatchId) {
      return {
        byCompetition: (json.byCompetition && typeof json.byCompetition === "object") ? json.byCompetition : {},
        byMatchId: (json.byMatchId && typeof json.byMatchId === "object") ? json.byMatchId : {},
      };
    }

    // Otherwise treat root as byCompetition
    if (json && typeof json === "object" && !Array.isArray(json)) {
      return { byCompetition: json, byMatchId: {} };
    }

    return { byCompetition: {}, byMatchId: {} };
  } catch {
    return { byCompetition: {}, byMatchId: {} };
  }
}

function normalizeTvList(x) {
  if (!x) return [];
  if (Array.isArray(x)) {
    return x.map((s) => safeStr(s).trim()).filter(Boolean);
  }
  // allow single string
  const s = safeStr(x).trim();
  return s ? [s] : [];
}

async function fetchFootballDataUpcoming(days) {
  const token = env("NETTHUD_SCORES_API_TOKEN");
  if (!token) throw new Error("Missing env: NETTHUD_SCORES_API_TOKEN");

  const limit = parseLimit();
  const { set: allowedCompCodes, ordered: orderedCodes } = parseCompAllowlistWithOrder();

  // Load tv map once
  const tvMap = loadTvMap();

  const resolveTv = (competitionCode, matchId) => {
    // Match-level override wins
    if (matchId != null) {
      const direct = tvMap.byMatchId?.[String(matchId)];
      const list = normalizeTvList(direct);
      if (list.length) return list;
    }

    // Competition-level fallback
    const byComp = tvMap.byCompetition?.[String(competitionCode || "").toUpperCase()];
    return normalizeTvList(byComp);
  };

  // Safer window:
  // If this runs near UTC midnight (or user timezone shifts), we can miss same-day matches.
  // So we start from "UTC midnight of (now - 12h)".
  const now = new Date();
  const startAnchor = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  const start = utcMidnight(startAnchor);

  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + days);

  const dateFrom = yyyyMmDdUTC(start);

  // +1 day safety on the end (matches can be late/shifted)
  const endPlusOne = new Date(end);
  endPlusOne.setUTCDate(end.getUTCDate() + 1);
  const dateTo = yyyyMmDdUTC(endPlusOne);

  const url = `https://api.football-data.org/v4/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;
  const json = await fetchFD(url, token);
  const matches = Array.isArray(json?.matches) ? json.matches : [];

  const keepStatuses = new Set(["SCHEDULED", "TIMED", "POSTPONED"]);
  const excludeStatuses = new Set([
    "IN_PLAY",
    "PAUSED",
    "FINISHED",
    "SUSPENDED",
    "LIVE",
    "CANCELED",
    "AWARDED",
  ]);

  const keep = matches.filter((m) => {
    const st = safeStr(m?.status).toUpperCase();
    if (excludeStatuses.has(st)) return false;
    if (!keepStatuses.has(st)) return false;

    const code = safeStr(m?.competition?.code).toUpperCase();
    if (!code) return true;
    return allowedCompCodes.has(code);
  });

  // Gather competitions we need standings for
  const compIds = new Set();
  for (const m of keep) {
    const compId = m?.competition?.id;
    if (compId) compIds.add(compId);
  }

  // Fetch standings for each competition (cached)
  const standingsCache = new Map(); // compId -> Map(teamId -> ratingObj)
  for (const compId of compIds) {
    try {
      const m = await fetchStandingsRatingsByCompetitionId(compId, token);
      standingsCache.set(compId, m);
    } catch {
      standingsCache.set(compId, new Map());
    }
  }

  const items = keep.map((m) => {
    const league = safeStr(m?.competition?.name || "");
    const competitionCode = safeStr(m?.competition?.code || "").toUpperCase();
    const competitionId = m?.competition?.id;

    const home = safeStr(m?.homeTeam?.shortName || m?.homeTeam?.name || "");
    const away = safeStr(m?.awayTeam?.shortName || m?.awayTeam?.name || "");
    const homeId = m?.homeTeam?.id;
    const awayId = m?.awayTeam?.id;

    const kickoffUTC = safeStr(m?.utcDate || "");
    const kickoffLocal = kickoffUTC ? formatET(kickoffUTC) : "";

    const standings = competitionId ? standingsCache.get(competitionId) : null;
    const homeRating = standings && homeId ? standings.get(homeId)?.rating : null;
    const awayRating = standings && awayId ? standings.get(awayId)?.rating : null;

    const hda = computeHDA(
      Number.isFinite(homeRating) ? homeRating : NaN,
      Number.isFinite(awayRating) ? awayRating : NaN
    );

    const matchId = m?.id || null;

    return {
      matchId,
      id: matchId ? `upcoming:${matchId}` : "",
      league,
      competitionCode,
      home,
      away,
      kickoffUTC,
      kickoffLocal,
      tv: resolveTv(competitionCode, matchId),
      hda,
      highlightsUrl: "",
      model: "NetThud Table Model v1",
    };
  });

  // Sort by kickoffUTC
  items.sort((a, b) => safeStr(a.kickoffUTC).localeCompare(safeStr(b.kickoffUTC)));

  const trimmed = Number.isFinite(limit) ? items.slice(0, limit) : items;

  return {
    generatedAt: isoNow(),
    days,
    limit: Number.isFinite(limit) ? limit : 0, // keep your "0 means no limit" convention in output
    competitions: orderedCodes,
    model: "NetThud Table Model v1",
    items: trimmed,
  };
}

async function main() {
  const days = Math.max(1, Math.min(14, Number(env("NETTHUD_UPCOMING_DAYS", "7")) || 7));
  const outFile = path.join(process.cwd(), "assets", "data", "upcoming.json");

  const payload = await fetchFootballDataUpcoming(days);

  writeJson(outFile, payload);
  console.log(`Wrote ${outFile} (${payload.items.length} items)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});