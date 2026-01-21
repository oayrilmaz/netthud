// scripts/generate-transfers.mjs
// OPTION A: Zero dependencies (NO npm, NO rss-parser)
// Generates: assets/data/transfers.json

import fs from "node:fs";
import path from "node:path";

/* ---------------- utilities ---------------- */

function env(name, fallback = "") {
  const v = process.env[name];
  return v == null || v === "" ? fallback : v;
}

function iso(d = new Date()) {
  return d.toISOString();
}

function minutesAgo(min) {
  return iso(new Date(Date.now() - min * 60_000));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function clamp(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

/* ---------------- demo signal engine ---------------- */

function buildSignals(limit, siteUrl) {
  const pool = [
    {
      title: "Midfielder: fee agreed in principle — medical expected",
      stage: "advanced",
      confidence: 0.78
    },
    {
      title: "Winger: personal terms aligned — paperwork stage",
      stage: "advanced",
      confidence: 0.74
    },
    {
      title: "Fullback: talks opened — timeline accelerated by injuries",
      stage: "contact",
      confidence: 0.53
    },
    {
      title: "Goalkeeper: situation developing — internal decision pending",
      stage: "watch",
      confidence: 0.42
    },
    {
      title: "Playmaker: monitored by multiple sides — valuation gap remains",
      stage: "watch",
      confidence: 0.39
    },
    {
      title: "Striker: agent contact reported — shortlist narrowing",
      stage: "contact",
      confidence: 0.55
    }
  ];

  const rotate = new Date().getUTCMinutes() % pool.length;
  const ordered = pool.slice(rotate).concat(pool.slice(0, rotate));

  return ordered.slice(0, limit).map((s, i) => ({
    title: s.title,
    stage: s.stage,
    confidence: s.confidence,
    source: "NetThud Signals",
    publishedAt: minutesAgo(20 + i * 15),
    url: siteUrl
  }));
}

/* ---------------- main ---------------- */

async function main() {
  const mode = env("NETTHUD_TRANSFERS_MODE", "demo");
  const siteUrl = env("NETTHUD_SITE_URL", "https://netthud.com/");
  const limit = clamp(env("NETTHUD_TRANSFERS_ITEMS", "12"), 4, 20);

  if (mode !== "demo") {
    console.warn(`Mode "${mode}" not supported in Option A. Falling back to demo.`);
  }

  const items = buildSignals(limit, siteUrl);

  const payload = {
    generatedAt: iso(),
    mode: "signals-demo",
    items
  };

  const out = path.join(process.cwd(), "assets", "data", "transfers.json");
  writeJson(out, payload);

  console.log(`✔ Transfer signals written (${items.length})`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});