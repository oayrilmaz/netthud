// scripts/generate-upcoming.mjs
// Generates: assets/data/upcoming.json
//
// Uses football-data.org (requires API token)
// Env:
//   NETTHUD_SCORES_API_TOKEN=xxxxxxxx
//   NETTHUD_UPCOMING_DAYS=7            (optional, 1..14)
//   NETTHUD_UPCOMING_LIMIT=80          (optional)
//   NETTHUD_UPCOMING_COMP_CODES=PL,PD,SA,BL1,FL1,CL,EL,EC (optional override)

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
  // If user provides explicit list via env -> use it
  const raw = env("NETTHUD_UPCOMING_COMP_CODES", "").trim();
  if (raw) {
    return new Set(
      raw
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
    );
  }

  // Default: broader, still “major + widely followed”
  // football-data codes vary by plan/coverage; include commonly present ones.
  return new Set([
    // Top leagues
    "PL",  // Premier League
    "PD",  // La Liga
    "SA",  // Serie A
    "BL1", // Bundesliga
    "FL1", // Ligue 1
    "DED", // Eredivisie
    "PPL", // Primeira Liga

    // UEFA comps
    "CL",  // Champions League
    "EL",  // Europa League
    "EC",  // Euro Championship (sometimes)
    "CLI", // Copa Libertadores (sometimes)

    // Domestic cups (if present on your plan)
    "FAC", // FA Cup (sometimes)
    "CDR", // Copa del Rey (sometimes)
    "DFB", // DFB Pokal (sometimes)
    "CIT", // Coppa Italia (sometimes)
  ]);
}

async function fetchFootballDataUpcoming(days) {
  const token = env("NETTHUD_SCORES_API_TOKEN");
  if (!token) throw new Error("Missing env: NETTHUD_SCORES_API_TOKEN");

  const limit = Math.max(10, Math.min(200, Number(env("NETTHUD_UPCOMING_LIMIT", "80")) || 80));
  const allowedCompCodes = parseCompAllowlist();

  // ✅ Window: today..(today+days) and add +1 day safety on dateTo (inclusive quirks)
  const now = new Date();
  const start = utcMidnight(now); // today UTC
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + days);

  const dateFrom = yyyyMmDdUTC(start);

  // add +1 day safety so the last day is not dropped by inclusive/exclusive behavior
  const endPlusOne = new Date(end);
  endPlusOne.setUTCDate(end.getUTCDate() + 1);
  const dateTo = yyyyMmDdUTC(endPlusOne);

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

  // ✅ Upcoming statuses (keep)
  // football-data typically uses TIMED/SCHEDULED; POSTPONED can still be "upcoming-ish"
  const keepStatuses = new Set(["SCHEDULED", "TIMED", "POSTPONED"]);

  // ✅ Exclude live/final just in case API returns mixed results
  const excludeStatuses = new Set(["IN_PLAY", "PAUSED", "FINISHED", "SUSPENDED", "LIVE"]);

  const keep = matches.filter((m) => {
    const st = safeStr(m?.status);
    if (excludeStatuses.has(st)) return false;
    if (!keepStatuses.has(st)) return false;

    const code = safeStr(m?.competition?.code);
    // If competition code is missing, keep it (don’t accidentally drop everything),
    // but it will naturally sort and you can tighten later via allowlist env.
    if (!code) return true;

    return allowedCompCodes.has(code);
  });

  const items = keep.map((m) => {
    const league = safeStr(m?.competition?.name || "");
    const home = safeStr(m?.homeTeam?.shortName || m?.homeTeam?.name || "");
    const away = safeStr(m?.awayTeam?.shortName || m?.awayTeam?.name || "");
    const kickoffUTC = safeStr(m?.utcDate || "");
    const kickoffLocal = kickoffUTC ? formatET(kickoffUTC) : "";

    return {
      league,
      home,
      away,
      kickoffUTC,
      kickoffLocal,
      tv: [],
    };
  });

  // Sort by kickoffUTC ascending
  items.sort((a, b) => safeStr(a.kickoffUTC).localeCompare(safeStr(b.kickoffUTC)));

  // ✅ Trim for UI sanity
  const trimmed = items.slice(0, limit);

  return {
    generatedAt: isoNow(),
    days,
    limit,
    competitions: Array.from(allowedCompCodes),
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