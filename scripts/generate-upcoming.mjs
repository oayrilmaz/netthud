// scripts/generate-upcoming.mjs
// Generates: assets/data/upcoming.json
//
// Uses football-data.org (requires API token)
// Env:
//   NETTHUD_SCORES_API_TOKEN=xxxxxxxx
//   NETTHUD_UPCOMING_DAYS=7
//   NETTHUD_UPCOMING_LIMIT=80 (0 = no limit)
//   NETTHUD_UPCOMING_COMP_CODES=PL,PD,SA,BL1,FL1,CL,EL,TSL (optional override)
//
// Fail-safe behavior:
// - On 429/temporary errors: reuse existing assets/data/upcoming.json and exit 0
// - Only hard-fail if no cache exists at all.

import fs from "node:fs";
import path from "node:path";

function env(name, fallback = "") {
  const v = process.env[name];
  return v == null || v === "" ? fallback : v;
}
function isoNow() { return new Date().toISOString(); }
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}
function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch { return null; }
}
function safeStr(x) { return x == null ? "" : String(x); }
function safeNum(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function yyyyMmDdUTC(d) { return d.toISOString().slice(0, 10); }
function utcMidnight(dateObj) {
  return new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate()));
}

function formatET(utcDateISO) {
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
    return `${get("month")} ${get("day")} • ${get("hour")}:${get("minute")} ${get("dayPeriod")} ET`;
  } catch {
    return "";
  }
}

function parseCompAllowlistWithOrder() {
  const raw = env("NETTHUD_UPCOMING_COMP_CODES", "").trim();
  if (raw) {
    const ordered = raw.split(",").map(x => x.trim().toUpperCase()).filter(Boolean);
    return { set: new Set(ordered), ordered };
  }
  const ordered = ["PL", "PD", "SA", "BL1", "FL1", "DED", "PPL", "TSL", "CL", "EL", "EC"];
  return { set: new Set(ordered), ordered };
}

function parseLimit() {
  const raw = env("NETTHUD_UPCOMING_LIMIT", "80");
  const n = Number(raw);
  if (Number.isFinite(n) && n === 0) return Infinity;
  const v = Number.isFinite(n) ? n : 80;
  return Math.max(10, Math.min(500, v));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchFD(url, token, { retries = 2 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers: { "X-Auth-Token": token } });
    if (res.ok) return res.json();

    const status = res.status;
    const body = await res.text().catch(() => "");
    const msg = `football-data HTTP ${status} ${res.statusText} :: ${body.slice(0, 200)}`;

    const retryable = status === 429 || (status >= 500 && status <= 599);
    if (!retryable || attempt === retries) {
      const err = new Error(msg);
      err.status = status;
      throw err;
    }

    const backoff = 800 * Math.pow(2, attempt);
    console.warn(`⚠️ ${msg}`);
    console.warn(`↻ retrying in ${backoff}ms (attempt ${attempt + 1}/${retries})`);
    await sleep(backoff);
  }
}

async function fetchStandingsRatingsByCompetitionId(competitionId, token) {
  const json = await fetchFD(`https://api.football-data.org/v4/competitions/${competitionId}/standings`, token, { retries: 1 });
  const tables = Array.isArray(json?.standings) ? json.standings : [];
  const total = tables.find(s => safeStr(s?.type).toUpperCase() === "TOTAL") || tables[0];
  const rows = Array.isArray(total?.table) ? total.table : [];

  const map = new Map();
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
    const gfpg = gf / played;

    const rating = ppg + gdpg * 0.35 + gfpg * 0.10;
    map.set(teamId, { rating });
  }
  return map;
}

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
  home /= s; draw /= s; away /= s;

  const r4 = (n) => Math.round(n * 10000) / 10000;
  return { home: r4(home), draw: r4(draw), away: r4(away) };
}

async function fetchFootballDataUpcoming(days) {
  const token = env("NETTHUD_SCORES_API_TOKEN");
  if (!token) throw new Error("Missing env: NETTHUD_SCORES_API_TOKEN");

  const limit = parseLimit();
  const { set: allowedCodes, ordered: orderedCodes } = parseCompAllowlistWithOrder();

  // Safer window
  const now = new Date();
  const startAnchor = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  const start = utcMidnight(startAnchor);

  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + days);

  const endPlusOne = new Date(end);
  endPlusOne.setUTCDate(end.getUTCDate() + 1);

  const dateFrom = yyyyMmDdUTC(start);
  const dateTo = yyyyMmDdUTC(endPlusOne);

  const url = `https://api.football-data.org/v4/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;
  const json = await fetchFD(url, token, { retries: 2 });
  const matches = Array.isArray(json?.matches) ? json.matches : [];

  const keepStatuses = new Set(["SCHEDULED", "TIMED", "POSTPONED"]);
  const excludeStatuses = new Set(["IN_PLAY","PAUSED","FINISHED","SUSPENDED","LIVE","CANCELED","AWARDED"]);

  const keep = matches.filter(m => {
    const st = safeStr(m?.status).toUpperCase();
    if (excludeStatuses.has(st)) return false;
    if (!keepStatuses.has(st)) return false;

    const code = safeStr(m?.competition?.code).toUpperCase();
    if (!code) return true;
    return allowedCodes.has(code);
  });

  // IMPORTANT: standings calls are expensive.
  // Only fetch standings for competitions that appear AND are in allowlist.
  const compIds = new Map(); // compId -> compCode
  for (const m of keep) {
    const compId = m?.competition?.id;
    const code = safeStr(m?.competition?.code).toUpperCase();
    if (compId && (!code || allowedCodes.has(code))) compIds.set(compId, code);
  }

  const standingsCache = new Map();
  for (const compId of compIds.keys()) {
    try {
      standingsCache.set(compId, await fetchStandingsRatingsByCompetitionId(compId, token));
      await sleep(250); // small spacing to reduce 429 risk
    } catch {
      standingsCache.set(compId, new Map());
    }
  }

  const items = keep.map(m => {
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
    const homeRating = standings && homeId ? standings.get(homeId)?.rating : NaN;
    const awayRating = standings && awayId ? standings.get(awayId)?.rating : NaN;

    const hda = computeHDA(homeRating, awayRating);
    const matchId = m?.id ?? null;

    return {
      matchId,
      id: matchId ? `upcoming:${matchId}` : "",
      league,
      competitionCode,
      home,
      away,
      kickoffUTC,
      kickoffLocal,
      tv: [],
      hda,
      highlightsUrl: "",
      model: "NetThud Table Model v1",
    };
  });

  items.sort((a, b) => safeStr(a.kickoffUTC).localeCompare(safeStr(b.kickoffUTC)));
  const trimmed = Number.isFinite(limit) ? items.slice(0, limit) : items;

  return {
    generatedAt: isoNow(),
    days,
    limit: Number.isFinite(limit) ? limit : 0,
    competitions: orderedCodes,
    model: "NetThud Table Model v1",
    items: trimmed,
  };
}

async function main() {
  const days = Math.max(1, Math.min(14, Number(env("NETTHUD_UPCOMING_DAYS", "7")) || 7));
  const outFile = path.join(process.cwd(), "assets", "data", "upcoming.json");

  try {
    const payload = await fetchFootballDataUpcoming(days);
    writeJson(outFile, payload);
    console.log(`Wrote ${outFile} (${payload.items.length} items)`);
  } catch (err) {
    const status = err?.status;
    const cached = readJsonIfExists(outFile);

    if (cached && (status === 429 || (status >= 500 && status <= 599))) {
      console.warn("⚠️ Upcoming generation failed, reusing cached upcoming.json and exiting 0");
      console.warn(String(err?.message || err));
      process.exit(0);
    }

    console.error("❌ Upcoming generation failed and no cache exists.");
    console.error(String(err?.message || err));
    process.exit(1);
  }
}

main();