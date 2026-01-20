// scripts/generate-upcoming.mjs
// Generates: assets/data/upcoming.json
// Uses football-data.org (requires API token)
// Env:
//   NETTHUD_SCORES_API_TOKEN=xxxxxxxx   (same token you already use)
// Optional:
//   NETTHUD_UPCOMING_DAYS=7

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

async function fetchUpcoming() {
  const token = env("NETTHUD_SCORES_API_TOKEN"); // reuse your existing secret
  if (!token) throw new Error("Missing env: NETTHUD_SCORES_API_TOKEN");

  const days = Number(env("NETTHUD_UPCOMING_DAYS", "7")) || 7;

  const now = new Date();
  const start = utcMidnight(now);
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

  // Upcoming states
  const keep = matches.filter((m) => {
    const st = safeStr(m?.status);
    return st === "SCHEDULED" || st === "TIMED";
  });

  // Map to your site schema: { updated, items:[ {league, home, away, kickoffUTC, kickoffLocal?, tv? } ] }
  const items = keep
    .map((m) => {
      const league = safeStr(m?.competition?.name || "");
      const home = safeStr(m?.homeTeam?.shortName || m?.homeTeam?.name);
      const away = safeStr(m?.awayTeam?.shortName || m?.awayTeam?.name);
      const kickoffUTC = safeStr(m?.utcDate || "");
      return { league, home, away, kickoffUTC, tv: [] };
    })
    .sort((a, b) => safeStr(a.kickoffUTC).localeCompare(safeStr(b.kickoffUTC)));

  return { updated: isoNow(), range: { dateFrom, dateTo }, items };
}

async function main() {
  const outFile = path.join(process.cwd(), "assets", "data", "upcoming.json");
  const payload = await fetchUpcoming();
  writeJson(outFile, payload);
  console.log(`Wrote ${outFile} (${payload.items.length} items)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});