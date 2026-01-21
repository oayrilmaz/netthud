// scripts/generate-transfers.mjs
// Generates: assets/data/transfers.json
//
// Modes:
//   - signals-demo   (default) : no external calls, but schema is "signals" (not news/rumors)
//   - (future) signals-rss     : parse RSS feeds (needs URLs + parsing rules)
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

function pickTagFromConfidence(conf) {
  const c = String(conf || "").toUpperCase();
  if (c === "HIGH" || c === "MED" || c === "LOW") return c;
  return "MED";
}

function buildSignalsDemoItems(count, siteUrl) {
  // Demo signals (schema is already what the UI will use)
  // You can later replace these with real extracted signals + evidence links.
  const pool = [
    {
      confidence: "HIGH",
      signal: "Bid/terms agreed; waiting on medical + contract signing.",
      entities: { player: "Midfielder Y", from: "Club C", to: "Club D", fee: "€18m" },
      evidence: [
        { source: "NetThud Desk", title: "Agreement advanced; medical expected next", url: siteUrl, publishedAt: minutesAgo(35) },
      ],
    },
    {
      confidence: "MED",
      signal: "Agent contact reported; loan structure being discussed.",
      entities: { player: "Forward X", from: "Club A", to: "Club B", fee: "loan" },
      evidence: [
        { source: "NetThud Desk", title: "Agent talks opened; shortlist forming", url: siteUrl, publishedAt: minutesAgo(65) },
      ],
    },
    {
      confidence: "MED",
      signal: "Club-to-club talks opened; valuation range narrowing.",
      entities: { player: "Winger Z", from: "Club F", to: "Club G", fee: "" },
      evidence: [
        { source: "NetThud Desk", title: "Initial talks; fee framework discussed", url: siteUrl, publishedAt: minutesAgo(95) },
      ],
    },
    {
      confidence: "LOW",
      signal: "Multiple clubs monitoring; no formal offer confirmed yet.",
      entities: { player: "Striker Q", from: "Club H", to: "Club I", fee: "" },
      evidence: [
        { source: "NetThud Desk", title: "Links only; monitoring phase", url: siteUrl, publishedAt: minutesAgo(130) },
      ],
    },
    {
      confidence: "LOW",
      signal: "Loan option explored; decision window ~72 hours mentioned.",
      entities: { player: "Young Defender P", from: "Club J", to: "Club K", fee: "loan" },
      evidence: [
        { source: "NetThud Desk", title: "Loan discussed; timeline referenced", url: siteUrl, publishedAt: minutesAgo(160) },
      ],
    },
  ];

  // Rotate so it “moves” each run
  const rot = new Date().getUTCMinutes() % pool.length;
  const rotated = pool.slice(rot).concat(pool.slice(0, rot));

  const take = rotated.slice(0, Math.max(2, Math.min(count, rotated.length)));

  return take.map((x, i) => ({
    type: "signal",
    confidence: pickTagFromConfidence(x.confidence),
    signal: x.signal,
    entities: x.entities,
    evidence: Array.isArray(x.evidence) ? x.evidence : [],
    publishedAt: minutesAgo(25 + i * 18),
    url: siteUrl || "https://netthud.com/",
  }));
}

async function main() {
  const mode = env("NETTHUD_TRANSFERS_MODE", "signals-demo").toLowerCase();
  const siteUrl = env("NETTHUD_SITE_URL", "https://netthud.com/");
  const itemsCount = clampInt(env("NETTHUD_TRANSFERS_ITEMS", "8"), 2, 20);

  const outFile = path.join(process.cwd(), "assets", "data", "transfers.json");

  let items = [];

  if (mode === "signals-demo") {
    items = buildSignalsDemoItems(itemsCount, siteUrl);
  } else {
    throw new Error(`Unsupported NETTHUD_TRANSFERS_MODE="${mode}". Use "signals-demo" for now.`);
  }

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