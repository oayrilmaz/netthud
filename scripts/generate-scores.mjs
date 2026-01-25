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
// - If NO cache exists: write demo-compatible scores.json and exit 0
// - Only hard-fail on non-retryable errors AND no cache/demo fallback possible.

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

function parseRetryAfterMs(res) {
  // Retry-After can be seconds or HTTP date
  const ra = res.headers.get("retry-after");
  if (!ra) return 0;

  const asNum = Number(ra);
  if (Number.isFinite(asNum) && asNum >= 0) return asNum * 1000;

  const asDate = Date.parse(ra);
  if (Number.isFinite(asDate)) {
    const delta = asDate - Date.now();
    return delta > 0 ? delta : 0;
  }
  return 0;
}

async function fetchFD(url, token, { retries = 3 } = {}) {
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

    // Respect Retry-After when present (esp. 429)
    const raMs = parseRetryAfterMs(res);
    const backoff = Math.max(raMs, 900 * Math.pow(2, attempt)); // 900ms, 1800ms, 3600ms...
    console.warn(`⚠️ ${msg}`);
    console.warn(`↻ retrying in ${backoff}ms (attempt ${attempt + 1}/${retries})`);
    await sleep(backoff);
  }
}

function scoreFromMatch(m) {
  // football-data can expose different score fields depending on status
  const score = m?.score || {};
  const pick = (...objs) => {
    for (const o of objs) {
      const h = o?.home;
      const a = o?.away;
      if (Number.isFinite(h) && Number.isFinite(a)) return `${h}–${a}`;
    }
    return "";
  };

  return pick(
    score?.fullTime,
    score?.regularTime,
    score?.halfTime,
    score?.extraTime,
    score?.penalties
  );
}

function normalizeMatch(m) {
  const league = safeStr(m?.competition?.name || "");
  const code = safeStr(m?.competition?.code || "").toUpperCase();
  const utcDate = safeStr(m?.utcDate || "");
  const status = safeStr(m?.status || "").toUpperCase();

  const home = safeStr(m?.homeTeam?.shortName || m?.homeTeam?.name || "");
  const away = safeStr(m?.awayTeam?.shortName || m?.awayTeam?.name || "");
  const score = scoreFromMatch(m);

  // Simple "when" used by your UI (index.html prints m.when)
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

function demoPayload({ dateFrom, dateTo, competitions }) {
  const now = new Date();
  const t0 = new Date(now.getTime() - 20 * 60 * 1000).toISOString();
  const t1 = new Date(now.getTime() - 55 * 60 * 1000).toISOString();
  const t2 = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();

  return {
    updated: isoNow(),
    dateFrom,
    dateTo,
    competitions,
    mode: "demo",
    items: [
      {
        matchId: null,
        league: "Süper Lig",
        competitionCode: "TSL",
        when: t0.slice(0, 10),
        kickoffUTC: t0,
        status: "LIVE",
        home: "Fenerbahçe",
        away: "Galatasaray",
        score: "1–1",
        highlightsUrl: ""
      },
      {
        matchId: null,
        league: "Premier League",
        competitionCode: "PL",
        when: t1.slice(0, 10),
        kickoffUTC: t1,
        status: "HT",
        home: "Arsenal",
        away: "Liverpool",
        score: "1–0",
        highlightsUrl: ""
      },
      {
        matchId: null,
        league: "La Liga",
        competitionCode: "PD",
        when: t2.slice(0, 10),
        kickoffUTC: t2,
        status: "FINISHED",
        home: "Real Madrid",
        away: "Barcelona",
        score: "2–2",
        highlightsUrl: ""
      }
    ]
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
  const json = await fetchFD(url, token, { retries: 3 });
  const matches = Array.isArray(json?.matches) ? json.matches : [];

  const liveOrFinal = new Set(["LIVE", "IN_PLAY", "PAUSED", "HT", "FINISHED", "FT"]);

  const items = matches
    .map(normalizeMatch)
    .filter((m) => {
      const st = safeStr(m.status).toUpperCase();
      if (!liveOrFinal.has(st)) return false;

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

  const { ordered } = parseCompAllowlistWithOrder();

  try {
    const payload = await fetchFootballDataScores({ daysBack, daysForward });
    writeJson(outFile, payload);
    console.log(`Wrote ${outFile} (${payload.items.length} items)`);
  } catch (err) {
    const status = err?.status;
    const cached = readJsonIfExists(outFile);

    const isTemporary = status === 429 || (status >= 500 && status <= 599);

    if (cached && isTemporary) {
      console.warn("⚠️ Scores generation failed, reusing cached scores.json and exiting 0");
      console.warn(String(err?.message || err));
      process.exit(0);
    }

    if (!cached && isTemporary) {
      console.warn("⚠️ Scores generation failed and no cache exists. Writing demo scores.json and exiting 0");
      console.warn(String(err?.message || err));

      const now = new Date();
      const start = utcMidnight(new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000));
      const end = utcMidnight(new Date(now.getTime() + daysForward * 24 * 60 * 60 * 1000));
      const endPlus = new Date(end);
      endPlus.setUTCDate(end.getUTCDate() + 1);

      const dateFrom = yyyyMmDdUTC(start);
      const dateTo = yyyyMmDdUTC(endPlus);

      const demo = demoPayload({ dateFrom, dateTo, competitions: ordered });
      writeJson(outFile, demo);
      process.exit(0);
    }

    console.error("❌ Scores generation failed (non-retryable) and no safe fallback was used.");
    console.error(String(err?.message || err));
    process.exit(1);
  }
}

main();