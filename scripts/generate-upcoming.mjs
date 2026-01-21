// scripts/generate-upcoming.mjs
// Generates: assets/data/upcoming.json
//
// Uses football-data.org (requires API token)
// Env:
//   NETTHUD_SCORES_API_TOKEN=xxxxxxxx
//   NETTHUD_UPCOMING_DAYS=7            (optional, 1..14)
//   NETTHUD_UPCOMING_LIMIT=80          (optional)
//   NETTHUD_UPCOMING_COMP_CODES=PL,PD,SA,BL1,FL1,CL,EL,EC (optional override)
//
// Adds H/D/A probabilities based on PUBLIC signals (standings strength + home advantage + closeness).
// Output includes: hda {home, draw, away} + model label.

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
  return new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate()));
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

function parseCompAllowlist() {
  const raw = env("NETTHUD_UPCOMING_COMP_CODES", "").trim();
  if (raw) {
    return new Set(
      raw
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
    );
  }

  return new Set([
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
  ]);
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
  // football-data v4: /competitions/{id}/standings
  const json = await fetchFD(`https://api.football-data.org/v4/competitions/${competitionId}/standings`, token);

  // We try to find the main "TOTAL" table first
  const tables = Array.isArray(json?.standings) ? json.standings : [];
  const total = tables.find((s) => safeStr(s?.type).toUpperCase() === "TOTAL") || tables[0];
  const rows = Array.isArray(total?.table) ? total.table : [];

  const map = new Map();

  // Build a simple public-signal rating:
  // rating = PPG + (GD per game)*0.35 + (GF per game)*0.10
  // (lightweight, stable, and works on partial seasons too)
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

    const rating = ppg + (gdpg * 0.35) + (gFpg * 0.10);

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
 * We purposely keep it conservative:
 * - Base draw around 0.26
 * - Draw increases when teams are close
 * - Home advantage adds a small bump to home side
 */
function computeHDA(homeRating, awayRating) {
  // If we have no signal, fallback to neutral
  if (!Number.isFinite(homeRating) || !Number.isFinite(awayRating)) {
    return { home: 0.34, draw: 0.32, away: 0.34 };
  }

  const diff = homeRating - awayRating;

  // Home advantage: small constant uplift on diff scale
  const homeAdv = 0.18;
  const x = diff + homeAdv;

  // Logistic for win vs loss (before draw)
  const k = 1.65; // steepness
  const winNoDraw = 1 / (1 + Math.exp(-k * x)); // 0..1

  // Draw component:
  // base draw ~0.26; increase when teams are close; reduce when mismatch large
  const closeness = Math.exp(-Math.abs(diff) * 1.25); // 1 when equal, decays with mismatch
  let draw = 0.22 + 0.12 * closeness; // ~0.34 max when equal, ~0.22 when far
  draw = clamp(draw, 0.18, 0.36);

  const remaining = 1 - draw;

  let home = remaining * winNoDraw;
  let away = remaining * (1 - winNoDraw);

  // Normalize safety
  const s = home + draw + away;
  home /= s;
  draw /= s;
  away /= s;

  // Round to 4 decimals for stable diffs in git
  const r4 = (n) => Math.round(n * 10000) / 10000;

  return { home: r4(home), draw: r4(draw), away: r4(away) };
}

async function fetchFootballDataUpcoming(days) {
  const token = env("NETTHUD_SCORES_API_TOKEN");
  if (!token) throw new Error("Missing env: NETTHUD_SCORES_API_TOKEN");

  const limit = Math.max(10, Math.min(200, Number(env("NETTHUD_UPCOMING_LIMIT", "80")) || 80));
  const allowedCompCodes = parseCompAllowlist();

  // Window: today..(today+days), with +1 day safety
  const now = new Date();
  const start = utcMidnight(now);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + days);

  const dateFrom = yyyyMmDdUTC(start);

  const endPlusOne = new Date(end);
  endPlusOne.setUTCDate(end.getUTCDate() + 1);
  const dateTo = yyyyMmDdUTC(endPlusOne);

  const url = `https://api.football-data.org/v4/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;
  const json = await fetchFD(url, token);
  const matches = Array.isArray(json?.matches) ? json.matches : [];

  const keepStatuses = new Set(["SCHEDULED", "TIMED", "POSTPONED"]);
  const excludeStatuses = new Set(["IN_PLAY", "PAUSED", "FINISHED", "SUSPENDED", "LIVE"]);

  const keep = matches.filter((m) => {
    const st = safeStr(m?.status);
    if (excludeStatuses.has(st)) return false;
    if (!keepStatuses.has(st)) return false;

    const code = safeStr(m?.competition?.code);
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
    } catch (e) {
      // If standings not available for a competition on your plan, we just skip
      standingsCache.set(compId, new Map());
    }
  }

  const items = keep.map((m) => {
    const league = safeStr(m?.competition?.name || "");
    const competitionCode = safeStr(m?.competition?.code || "");
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

    return {
      matchId: m?.id || null,
      league,
      competitionCode,
      home,
      away,
      kickoffUTC,
      kickoffLocal,
      tv: [],
      hda,
      model: "NetThud Table Model v1",
    };
  });

  // Sort by kickoffUTC
  items.sort((a, b) => safeStr(a.kickoffUTC).localeCompare(safeStr(b.kickoffUTC)));

  const trimmed = items.slice(0, limit);

  return {
    generatedAt: isoNow(),
    days,
    limit,
    competitions: Array.from(allowedCompCodes),
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