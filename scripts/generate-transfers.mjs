// scripts/generate-transfers.mjs
// Generates: assets/data/transfers.json
//
// Default mode: "demo" (no external API needed).
// Output schema matches your UI loader (type/news/rumor + title/source/publishedAt/url).
//
// Env (optional):
//   NETTHUD_TRANSFERS_MODE=demo
//   NETTHUD_TRANSFERS_URL=https://...   (future use)
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

function buildDemoItems(count, siteUrl) {
  // A small pool so output changes naturally by timestamp/order
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

  // Pick first N, but rotate by current minute so it “moves” each run
  const rot = new Date().getUTCMinutes() % pool.length;
  const rotated = pool.slice(rot).concat(pool.slice(0, rot));

  const take = rotated.slice(0, Math.max(2, Math.min(count, rotated.length)));

  // Stagger timestamps so it looks like a feed
  return take.map((x, i) => ({
    type: x.type,
    title: x.title,
    source: "NetThud Desk",
    publishedAt: minutesAgo(30 + i * 25),
    url: siteUrl || "https://netthud.com/",
  }));
}

async function main() {
  const mode = env("NETTHUD_TRANSFERS_MODE", "demo").toLowerCase();
  const siteUrl = env("NETTHUD_SITE_URL", "https://netthud.com/");
  const itemsCount = clampInt(env("NETTHUD_TRANSFERS_ITEMS", "8"), 2, 20);

  const outFile = path.join(process.cwd(), "assets", "data", "transfers.json");

  let items = [];

  if (mode === "demo") {
    items = buildDemoItems(itemsCount, siteUrl);
  } else {
    // Future extension: fetch + parse a real source
    // Example: const url = env("NETTHUD_TRANSFERS_URL");
    // Throw for now so it’s explicit.
    throw new Error(`Unsupported NETTHUD_TRANSFERS_MODE="${mode}". Use "demo" for now.`);
  }

  // Always write with a consistent top-level shape
  const payload = {
    generatedAt: isoNow(),
    mode,
    items,
  };

  writeJson(outFile, payload);
  console.log(`Wrote ${outFile} (${items.length} items)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});