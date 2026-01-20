// scripts/generate-upcoming.mjs
// Generates: assets/data/upcoming.json
//
// Uses football-data.org (requires API token)
// Env:
//   NETTHUD_SCORES_API_TOKEN=xxxxxxxx
//   NETTHUD_UPCOMING_DAYS=7   (optional)

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

async function fetchFootballDataUpcoming(days) {
  const token = env("NETTHUD_SCORES_API_TOKEN");
  if (!token) throw new Error("Missing env: NETTHUD_SCORES_API_TOKEN");

  const now = new Date();
  const start = utcMidnight(now); // today UTC
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + days);

  const dateFrom = yyyyMmDdUTC(start);
  const dateTo = yyyyMmDdUTC(end);

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

  // Keep only "scheduled-ish" matches
  const keepStatuses = new Set(["SCHEDULED", "TIMED"]);

  // Limit to the big competitions you want (clean + relevant)
  // football-data competition codes: PL, PD, SA, BL1, FL1, CL
  const allowedCompCodes = new Set(["PL", "PD", "SA", "BL1", "FL1", "CL"]);

  const keep = matches.filter((m) => {
    const st = safeStr(m?.status);
    const code = safeStr(m?.competition?.code);
    return keepStatuses.has(st) && allowedCompCodes.has(code);
  });

  const items = keep.map((m) => {
    const league = safeStr(m?.competition?.name || "");
    const home = safeStr(m?.homeTeam?.shortName || m?.homeTeam?.name || "");
    const away = safeStr(m?.awayTeam?.shortName || m?.awayTeam?.name || "");
    const kickoffUTC = safeStr(m?.utcDate || "");
    const kickoffLocal = kickoffUTC ? formatET(kickoffUTC) : "";

    // football-data.org doesn't reliably provide TV channels
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

  return {
    generatedAt: isoNow(),
    items,
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