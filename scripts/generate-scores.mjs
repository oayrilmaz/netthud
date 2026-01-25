// scripts/generate-scores.mjs
// Generates: assets/data/scores.json
//
// Uses football-data.org (requires API token)
// Env:
//   NETTHUD_SCORES_API_TOKEN=xxxxxxxx
//   NETTHUD_SCORES_DAYS_BACK=1      (optional; default 1)
//   NETTHUD_SCORES_DAYS_FORWARD=1   (optional; default 1)
//   NETTHUD_SCORES_COMP_CODES=PL,PD,SA,BL1,FL1,CL,EL,TSL (optional override)
//
// Fail-safe behavior:
// - On 429/temporary errors: reuse existing assets/data/scores.json and exit 0
// - Only hard-fail if no cache exists at all.

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

function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const txt = fs.readFileSync(filePath, "utf8");
    return JSON.parse(txt);
  } catch {
    return null;
  }
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

function parseCompAllowlistWithOrder() {
  const raw = env("NETTHUD_SCORES_COMP_CODES", "").trim();
  if (raw) {
    const ordered = raw.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
    return { set: new Set(ordered), ordered };
  }

  // Defaults include Turkey + Europa
  const ordered = ["PL", "PD", "SA", "BL1", "FL1", "DED", "PPL", "TSL", "CL", "EL"];
  return { set: new Set(ordered), ordered };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchFD(url, token, { retries = 2 } = {}) {
  // Retry for 429/5xx with exponential backoff
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

    const backoff = 800 * Math.pow(2, attempt); // 800ms, 1600ms, 3200ms...
    console.warn(`⚠️ ${msg}`);
    console.warn(`↻ retrying in ${backoff}ms (attempt ${attempt + 1}/${retries})`);
    await sleep(backoff);
  }
}

function normalizeMatch(m) {
  const league = safeStr(m?.competition?.name || "");
  const code = safeStr(m?.competition?.code || "").toUpperCase();
  const utcDate = safeStr(m?.utcDate || "");
  const status = safeStr(m?.status || "").toUpperCase();

  const home = safeStr(m?.homeTeam?.shortName || m?.homeTeam?.name || "");
  const away = safeStr(m?.awayTeam?.shortName || m?.awayTeam?.name || "");

  const fullTime = m?.score?.fullTime || {};
  const h = fullTime?.home;
  const a = fullTime?.away;

  const score =
    (Number.isFinite(h) && Number.isFinite(a)) ? `${h}–${a}` : "";

  // Simple "when": date only (you can replace with your ET formatter if you want)
  const when = utcDate ? utcDate.slice(0, 10) : "";

  return {
    matchId: m?.id ?? null,
    league,
    competitionCode: code,
    when,
    kickoffUTC: utcDate,
    status,
    home,
    away,
    score,
    highlightsUrl: ""
  };
}

async function fetchFootballDataScores({ daysBack, daysForward }) {
  const token = env("NETTHUD_SCORES_API_TOKEN");
  if (!token) throw new Error("Missing env: NETTHUD_SCORES_API_TOKEN");

  const { set: allowedCodes, ordered } = parseCompAllowlistWithOrder();

  const now = new Date();
  const start = utcMidnight(new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000));
  const end = utcMidnight(new Date(now.getTime() + daysForward * 24 * 60 * 60 * 1000));

  // +1 day safety
  const endPlus = new Date(end);
  endPlus.setUTCDate(end.getUTCDate() + 1);

  const dateFrom = yyyyMmDdUTC(start);
  const dateTo = yyyyMmDdUTC(endPlus);

  const url = `https://api.football-data.org/v4/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;
  const json = await fetchFD(url, token, { retries: 2 });
  const matches = Array.isArray(json?.matches) ? json.matches : [];

  const items = matches
    .map(normalizeMatch)
    .filter(m => {
      // Keep LIVE + FINISHED (your index.html splits these)
      const st = safeStr(m.status).toUpperCase();
      const okStatus = ["LIVE", "IN_PLAY", "PAUSED", "HT", "FINISHED", "FT"].includes(st);
      if (!okStatus) return false;

      const code = safeStr(m.competitionCode).toUpperCase();
      if (!code) return true;
      return allowedCodes.has(code);
    })
    .sort((a, b) => safeStr(b.kickoffUTC).localeCompare(safeStr(a.kickoffUTC)));

  return {
    updated: isoNow(),
    dateFrom,
    dateTo,
    competitions: ordered,
    items
  };
}

async function main() {
  const outFile = path.join(process.cwd(), "assets", "data", "scores.json");

  const daysBack = Math.max(0, Math.min(3, Number(env("NETTHUD_SCORES_DAYS_BACK", "1")) || 1));
  const daysForward = Math.max(0, Math.min(3, Number(env("NETTHUD_SCORES_DAYS_FORWARD", "1")) || 1));

  try {
    const payload = await fetchFootballDataScores({ daysBack, daysForward });
    writeJson(outFile, payload);
    console.log(`Wrote ${outFile} (${payload.items.length} items)`);
  } catch (err) {
    // Fail-safe: if 429 or temporary, keep cache and exit 0
    const status = err?.status;
    const cached = readJsonIfExists(outFile);

    if (cached && (status === 429 || (status >= 500 && status <= 599))) {
      console.warn("⚠️ Scores generation failed, reusing cached scores.json and exiting 0");
      console.warn(String(err?.message || err));
      process.exit(0);
    }

    // If no cache exists, hard fail (so you notice)
    console.error("❌ Scores generation failed and no cache exists.");
    console.error(String(err?.message || err));
    process.exit(1);
  }
}

main();