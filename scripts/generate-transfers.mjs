// scripts/generate-transfers.mjs
// Generates: assets/data/transfers.json
//
// Modes:
// 1) If NETTHUD_TRANSFERS_FEED_URL is set -> fetch JSON feed from that URL and normalize
// 2) Else -> use local seed file assets/data/transfers-seed.json if it exists
// 3) Else -> fallback to built-in demo items (never empty)
//
// Output schema (recommended for your index.html):
// {
//   generatedAt: ISO,
//   mode: "feed" | "seed" | "demo",
//   items: [{ type:"news"|"rumor", title, source, publishedAt, url }]
// }
//
// Env:
//   NETTHUD_TRANSFERS_FEED_URL=https://.../yourfeed.json (optional)
//   NETTHUD_TRANSFERS_MAX=20 (optional)

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

function fileExists(p) {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function normalizeType(x) {
  const s = safeStr(x).toLowerCase();
  if (s === "rumor" || s === "rumours" || s === "rumors") return "rumor";
  if (s === "news" || s === "confirmed" || s === "official" || s === "advanced" || s === "done") return "news";
  // default:
  return "news";
}

// Accepts either:
// A) {type,title,source,publishedAt,url}
// B) your old schema {player,from,to,fee,status,publishedAt,url}
function normalizeOne(item) {
  if (!item || typeof item !== "object") return null;

  // Preferred schema
  if (item.title) {
    return {
      type: normalizeType(item.type || item.kind || item.status),
      title: safeStr(item.title),
      source: safeStr(item.source || "NetThud Desk"),
      publishedAt: safeStr(item.publishedAt || item.date || isoNow()),
      url: safeStr(item.url || "https://netthud.com/")
    };
  }

  // Old demo schema
  const player = safeStr(item.player || "Player");
  const from = safeStr(item.from || "?");
  const to = safeStr(item.to || "?");
  const fee = safeStr(item.fee || "");
  const status = normalizeType(item.status);
  const title = `${player}: ${from} → ${to}${fee ? ` (${fee})` : ""}`;

  return {
    type: status === "rumor" ? "rumor" : "news", // treat "advanced"/etc as news
    title,
    source: "NetThud Desk",
    publishedAt: safeStr(item.publishedAt || isoNow()),
    url: safeStr(item.url || "https://netthud.com/")
  };
}

function normalizeList(items) {
  const out = [];
  for (const it of items || []) {
    const n = normalizeOne(it);
    if (n && n.title) out.push(n);
  }
  return out;
}

function sortTransfers(items) {
  // newest first
  return items.sort((a, b) => safeStr(b.publishedAt).localeCompare(safeStr(a.publishedAt)));
}

async function fetchFeed(url) {
  const res = await fetch(url, { headers: { "accept": "application/json" } });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`TRANSFERS_FEED_URL HTTP ${res.status} ${res.statusText} :: ${t.slice(0, 200)}`);
  }
  return res.json();
}

// Never-empty demo fallback (ensures both tabs have content)
function demoItems() {
  const now = new Date();
  const ts = (minsAgo) => new Date(now.getTime() - minsAgo * 60_000).toISOString();

  return [
    {
      type: "news",
      title: "Midfielder Y: Club C → Club D (€18m) — agreement advanced",
      source: "NetThud Desk",
      publishedAt: ts(35),
      url: "https://netthud.com/"
    },
    {
      type: "news",
      title: "Winger Z: medical scheduled after fee agreed in principle",
      source: "NetThud Desk",
      publishedAt: ts(85),
      url: "https://netthud.com/"
    },
    {
      type: "rumor",
      title: "Forward X: Club A → Club B (loan) — agent contact reported",
      source: "NetThud Desk",
      publishedAt: ts(55),
      url: "https://netthud.com/"
    },
    {
      type: "rumor",
      title: "Striker linked with two clubs as January shortlist narrows",
      source: "NetThud Desk",
      publishedAt: ts(140),
      url: "https://netthud.com/"
    }
  ];
}

async function main() {
  const maxItems = Math.max(4, Math.min(50, Number(env("NETTHUD_TRANSFERS_MAX", "20")) || 20));

  const outFile = path.join(process.cwd(), "assets", "data", "transfers.json");
  const seedFile = path.join(process.cwd(), "assets", "data", "transfers-seed.json");
  const feedUrl = env("NETTHUD_TRANSFERS_FEED_URL", "");

  let mode = "demo";
  let rawItems = [];

  if (feedUrl) {
    const json = await fetchFeed(feedUrl);
    rawItems = Array.isArray(json?.items) ? json.items : Array.isArray(json) ? json : [];
    mode = "feed";
  } else if (fileExists(seedFile)) {
    const text = fs.readFileSync(seedFile, "utf8");
    const json = JSON.parse(text);
    rawItems = Array.isArray(json?.items) ? json.items : Array.isArray(json) ? json : [];
    mode = "seed";
  } else {
    rawItems = demoItems();
    mode = "demo";
  }

  let items = normalizeList(rawItems);

  // Ensure both tabs always have at least 1 item
  const hasNews = items.some((x) => x.type === "news");
  const hasRumor = items.some((x) => x.type === "rumor");
  if (!hasNews || !hasRumor) {
    const fallback = demoItems();
    if (!hasNews) items.push(...fallback.filter((x) => x.type === "news"));
    if (!hasRumor) items.push(...fallback.filter((x) => x.type === "rumor"));
  }

  items = sortTransfers(items).slice(0, maxItems);

  const payload = {
    generatedAt: isoNow(),
    mode,
    items
  };

  writeJson(outFile, payload);
  console.log(`Wrote ${outFile} (${payload.items.length} items) mode=${mode}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});