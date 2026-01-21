// scripts/generate-transfers.mjs
// Generates: assets/data/transfers.json
//
// Modes:
//   - demo         => legacy transfer news/rumor titles (type/title)
//   - signals-demo => transfer signals (stage/confidence)
//
// Env (optional):
//   NETTHUD_TRANSFERS_MODE=signals-demo
//   NETTHUD_TRANSFERS_ITEMS=8
//   NETTHUD_SITE_URL=https://netthud.com/

import fs from "node:fs";
import path from "node:path";

function env(name, fallback = "") {
  const v = process.env[name];
  return v == null || v === "" ? fallback : v;
}

function isoNow(d = new Date()) {
  return d.toISOString();
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

function minutesAgo(mins) {
  const d = new Date(Date.now() - mins * 60_000);
  return isoNow(d);
}

// -------- DEMO (legacy) --------
function buildDemoItems(count, siteUrl) {
  const pool = [
    { type: "news",  title: "Midfielder Y: Club C → Club D (€18m) — agreement advanced" },
    { type: "news",  title: "Winger Z: medical scheduled after fee agreed in principle" },
    { type: "news",  title: "Club E open talks for defender — discussions moving quickly" },
    { type: "news",  title: "Goalkeeper Q: contract extension close — final details pending" },

    { type: "rumor", title: "Forward X: Club A → Club B (loan) — agent contact reported" },
    { type: "rumor", title: "Striker linked with two clubs as January shortlist narrows" },
    { type: "rumor", title: "Young defender loan discussed — decision expected within 72 hours" },
    { type: "rumor", title: "Playmaker monitored by multiple sides — price tag debated" },
  ];

  const rot = new Date().getUTCMinutes() % pool.length;
  const rotated = pool.slice(rot).concat(pool.slice(0, rot));
  const take = rotated.slice(0, Math.max(2, Math.min(count, rotated.length)));

  return take.map((x, i) => ({
    type: x.type,
    title: x.title,
    source: "NetThud Desk",
    publishedAt: minutesAgo(30 + i * 25),
    url: siteUrl || "https://netthud.com/",
  }));
}

// -------- SIGNALS DEMO (new) --------
// Schema: { title, stage, confidence, source, publishedAt, url }
function buildSignalItems(count, siteUrl) {
  const pool = [
    { stage: "advanced",  confidence: 0.78, title: "Midfielder: fee agreed in principle — medical expected soon" },
    { stage: "advanced",  confidence: 0.71, title: "Winger: personal terms aligned — paperwork stage" },
    { stage: "contact",   confidence: 0.56, title: "Forward: agent contact reported — shortlist narrowing" },
    { stage: "contact",   confidence: 0.51, title: "Striker: two clubs requesting availability — intermediaries active" },
    { stage: "watch",     confidence: 0.44, title: "Young defender: loan pathway discussed — minutes-driven move" },
    { stage: "watch",     confidence: 0.39, title: "Playmaker: monitored by multiple sides — valuation gap remains" },
    { stage: "watch",     confidence: 0.42, title: "Goalkeeper: situation developing — internal decision pending" },
    { stage: "contact",   confidence: 0.53, title: "Fullback: talks opened — timeline accelerated by injuries" },
  ];

  const rot = new Date().getUTCMinutes() % pool.length;
  const rotated = pool.slice(rot).concat(pool.slice(0, rot));
  const take = rotated.slice(0, Math.max(2, Math.min(count, rotated.length)));

  return take.map((x, i) => ({
    title: x.title,
    stage: x.stage,
    confidence: x.confidence,
    source: "NetThud Signals",
    publishedAt: minutesAgo(30 + i * 25),
    url: siteUrl || "https://netthud.com/",
  }));
}

async function main() {
  const mode = env("NETTHUD_TRANSFERS_MODE", "signals-demo").toLowerCase();
  const siteUrl = env("NETTHUD_SITE_URL", "https://netthud.com/");
  const itemsCount = clampInt(env("NETTHUD_TRANSFERS_ITEMS", "8"), 2, 20);

  const outFile = path.join(process.cwd(), "assets", "data", "transfers.json");

  let items = [];

  if (mode === "demo") {
    items = buildDemoItems(itemsCount, siteUrl);
  } else if (mode === "signals-demo") {
    items = buildSignalItems(itemsCount, siteUrl);
  } else {
    throw new Error(`Unsupported NETTHUD_TRANSFERS_MODE="${mode}". Use "signals-demo" or "demo".`);
  }

  const payload = {
    generatedAt: isoNow(),
    mode,
    items,
  };

  writeJson(outFile, payload);
  console.log(`Wrote ${outFile} (${items.length} items) mode=${mode}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});