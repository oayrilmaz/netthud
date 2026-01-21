// scripts/generate-transfers.mjs
// Generates: assets/data/transfers.json
//
// OPTION-1 (LIVE): pulls from big RSS/news sources (Guardian RSS + Google News RSS queries),
// then converts to "transfer signals" with confidence scores.
//
// Env (optional):
//   NETTHUD_TRANSFERS_MODE=live        (default: demo)
//   NETTHUD_SITE_URL=https://netthud.com/
//   NETTHUD_TRANSFERS_ITEMS=12         (2..40)
//   NETTHUD_TRANSFERS_LANG=en          (default: en)
//   NETTHUD_TRANSFERS_REGION=US        (default: US)
//   NETTHUD_TRANSFERS_FEEDS_JSON='[{"name":"...","url":"...","weight":1.0}]'  (optional override)
//
// IMPORTANT:
// This script uses two tiny deps:
//   npm i rss-parser fast-xml-parser
//
// Why: Node doesn't ship a robust RSS/Atom parser.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import RSSParser from "rss-parser";
import { XMLParser } from "fast-xml-parser";

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

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function safeStr(x) {
  return x == null ? "" : String(x);
}

function sha1(s) {
  return crypto.createHash("sha1").update(String(s || "")).digest("hex");
}

function normalizeWhitespace(s) {
  return safeStr(s).replace(/\s+/g, " ").trim();
}

function stripHtml(s) {
  return safeStr(s)
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function minutesAgo(mins) {
  const d = new Date(Date.now() - mins * 60_000);
  return isoNow(d);
}

// ----------------------------
// MODE: DEMO (fallback)
// ----------------------------
function buildDemoItems(count, siteUrl) {
  const pool = [
    { title: "Midfielder Y: Club C → Club D (€18m) — agreement advanced", url: siteUrl, source: "NetThud Desk" },
    { title: "Winger Z: medical scheduled after fee agreed in principle", url: siteUrl, source: "NetThud Desk" },
    { title: "Forward X: Club A → Club B (loan) — agent contact reported", url: siteUrl, source: "NetThud Desk" },
    { title: "Striker linked with two clubs as January shortlist narrows", url: siteUrl, source: "NetThud Desk" },
  ];

  const rot = new Date().getUTCMinutes() % pool.length;
  const rotated = pool.slice(rot).concat(pool.slice(0, rot));
  const take = rotated.slice(0, Math.max(2, Math.min(count, rotated.length)));

  return take.map((x, i) => ({
    title: x.title,
    stage: i < 2 ? "advanced" : "contact",
    confidence: i < 2 ? 0.72 : 0.52,
    source: x.source,
    publishedAt: minutesAgo(25 + i * 18),
    url: x.url,
  }));
}

// ----------------------------
// MODE: LIVE (Option-1)
// ----------------------------

// Google News RSS search builder:
// Example format is widely used, lets you “RSS” sources that don’t publish RSS.
function googleNewsRssSearchUrl(query, lang = "en", region = "US") {
  const q = encodeURIComponent(query);
  return `https://news.google.com/rss/search?q=${q}&hl=${lang}&gl=${region}&ceid=${region}:${lang}`;
}

// Default feed set (big sources + broad Google News queries)
function defaultFeeds(lang = "en", region = "US") {
  return [
    // Guardian supports /rss on section pages (transfers page has an RSS endpoint).
    { name: "The Guardian — Transfers", url: "https://www.theguardian.com/football/transfers/rss", weight: 1.15 },

    // Google News RSS queries (broad + source-weighted by domain later)
    { name: "Google News — football transfers", url: googleNewsRssSearchUrl("football transfer news", lang, region), weight: 1.0 },
    { name: "Google News — transfer rumours", url: googleNewsRssSearchUrl("football transfer rumours", lang, region), weight: 0.95 },
    { name: "Google News — medical scheduled transfer", url: googleNewsRssSearchUrl("medical scheduled transfer football", lang, region), weight: 1.05 },
    { name: "Google News — agreement in principle transfer", url: googleNewsRssSearchUrl("agreement in principle transfer football", lang, region), weight: 1.05 },
  ];
}

// Source reliability weighting (simple, transparent, adjustable)
function sourceWeightFromDomain(host) {
  const h = (host || "").toLowerCase();
  if (!h) return 1.0;

  // Higher-trust mainstream sports desks
  if (h.endsWith("theguardian.com")) return 1.15;
  if (h.endsWith("bbc.co.uk")) return 1.10;
  if (h.endsWith("skysports.com")) return 1.08;
  if (h.endsWith("reuters.com")) return 1.12;
  if (h.endsWith("apnews.com")) return 1.10;
  if (h.endsWith("espn.com") || h.endsWith("espn.in")) return 1.05;

  // Club sites / official competition sites can be strong but usually post “confirmed”
  if (h.endsWith("premierleague.com") || h.endsWith("uefa.com")) return 1.06;

  // Aggregators / tabloids (not “bad”, but more noise)
  if (h.includes("teamtalk") || h.includes("90min") || h.includes("caughtoffside")) return 0.92;

  return 1.0;
}

// Extract a transfer-ish "signal" from title/snippet using keywords.
function inferStageAndConfidence(text) {
  const t = (text || "").toLowerCase();

  // Phrases that strongly indicate completion/near-completion
  const ADV = [
    "medical", "here we go", "official", "signs", "signed", "completed", "deal done",
    "agreement reached", "agreed", "confirmed", "unveiled"
  ];

  // Phrases that indicate serious movement but not done
  const CONTACT = [
    "agreement in principle", "talks", "advanced talks", "negotiations", "bid accepted",
    "fee agreed", "personal terms", "close to", "set to join", "closing in"
  ];

  // Phrases that are more speculative
  const WATCH = [
    "linked with", "monitoring", "interested", "target", "considering",
    "could", "might", "reportedly", "rumour", "rumor", "gossip"
  ];

  const hit = (arr) => arr.some((k) => t.includes(k));

  let stage = "watch";
  let base = 0.40;

  if (hit(ADV)) {
    stage = "advanced";
    base = 0.78;
  } else if (hit(CONTACT)) {
    stage = "contact";
    base = 0.58;
  } else if (hit(WATCH)) {
    stage = "watch";
    base = 0.42;
  }

  // Small boosts if it mentions both "fee" and "terms"
  if (t.includes("fee") && (t.includes("terms") || t.includes("personal terms"))) base += 0.06;

  // Small penalty if it explicitly calls itself gossip/rumor
  if (t.includes("gossip") || t.includes("rumour") || t.includes("rumor")) base -= 0.05;

  return { stage, confidence: clamp01(base) };
}

function stageLabel(stage) {
  const s = String(stage || "").toLowerCase();
  if (s === "advanced") return "ADV";
  if (s === "contact") return "CONTACT";
  if (s === "watch") return "WATCH";
  return s.toUpperCase() || "SIG";
}

// Parse RSS/Atom robustly.
// rss-parser is great but some feeds return odd XML; we fallback to fast-xml-parser.
async function fetchFeedItems(url) {
  const parser = new RSSParser({
    timeout: 12_000,
    headers: { "User-Agent": "NetThudBot/1.0 (+https://netthud.com/)" },
  });

  try {
    const feed = await parser.parseURL(url);
    const items = Array.isArray(feed.items) ? feed.items : [];
    return items.map((it) => ({
      title: safeStr(it.title),
      link: safeStr(it.link),
      contentSnippet: safeStr(it.contentSnippet || it.content || it.summary || ""),
      pubDate: safeStr(it.isoDate || it.pubDate || ""),
      source: safeStr(feed.title || ""),
    }));
  } catch {
    // Fallback: fetch XML and parse ourselves (best-effort)
    const res = await fetch(url, { headers: { "User-Agent": "NetThudBot/1.0 (+https://netthud.com/)" } });
    if (!res.ok) throw new Error(`Feed HTTP ${res.status} for ${url}`);
    const xml = await res.text();

    const xp = new XMLParser({ ignoreAttributes: false });
    const obj = xp.parse(xml);

    // RSS 2.0
    const rssItems = obj?.rss?.channel?.item;
    if (rssItems) {
      const arr = Array.isArray(rssItems) ? rssItems : [rssItems];
      return arr.map((it) => ({
        title: safeStr(it.title),
        link: safeStr(it.link),
        contentSnippet: safeStr(it.description || ""),
        pubDate: safeStr(it.pubDate || ""),
        source: safeStr(obj?.rss?.channel?.title || ""),
      }));
    }

    // Atom
    const entries = obj?.feed?.entry;
    if (entries) {
      const arr = Array.isArray(entries) ? entries : [entries];
      return arr.map((e) => ({
        title: safeStr(e.title?.["#text"] || e.title),
        link: safeStr(e.link?.["@_href"] || e.link?.href || ""),
        contentSnippet: safeStr(e.summary?.["#text"] || e.summary || e.content?.["#text"] || e.content || ""),
        pubDate: safeStr(e.updated || e.published || ""),
        source: safeStr(obj?.feed?.title?.["#text"] || obj?.feed?.title || ""),
      }));
    }

    return [];
  }
}

function normalizeDate(d) {
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "";
    return dt.toISOString();
  } catch {
    return "";
  }
}

function toSignalItem(raw, feedName, feedWeight) {
  const title = normalizeWhitespace(stripHtml(raw.title));
  const snippet = normalizeWhitespace(stripHtml(raw.contentSnippet));
  const link = raw.link || "";
  const host = domainOf(link);
  const srcW = sourceWeightFromDomain(host);

  const mergedText = `${title} ${snippet}`.trim();
  const { stage, confidence: baseConf } = inferStageAndConfidence(mergedText);

  // Final confidence: base * feedWeight * sourceWeight (clamped)
  const conf = clamp01(baseConf * clamp01(feedWeight) * clamp01(srcW));

  return {
    id: sha1((title || "") + "|" + (link || "")),
    title,
    stage,
    confidence: conf,
    source: feedName || host || "Source",
    publishedAt: normalizeDate(raw.pubDate),
    url: link,
  };
}

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = it.id || sha1((it.title || "") + "|" + (it.url || ""));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function sortSignals(items) {
  const stageRank = (s) => (s === "advanced" ? 0 : s === "contact" ? 1 : 2);
  return items.sort((a, b) => {
    const r = stageRank(a.stage) - stageRank(b.stage);
    if (r !== 0) return r;

    // higher confidence first
    const c = (b.confidence || 0) - (a.confidence || 0);
    if (c !== 0) return c;

    // newest first
    return safeStr(b.publishedAt).localeCompare(safeStr(a.publishedAt));
  });
}

async function buildLiveSignals(maxItems, lang, region) {
  // Allow overriding feeds via env JSON
  const override = env("NETTHUD_TRANSFERS_FEEDS_JSON", "");
  let feeds = [];
  if (override) {
    try {
      const parsed = JSON.parse(override);
      if (Array.isArray(parsed)) feeds = parsed;
    } catch {}
  }
  if (!feeds.length) feeds = defaultFeeds(lang, region);

  const all = [];
  for (const f of feeds) {
    const name = f?.name || "Feed";
    const url = f?.url || "";
    const weight = Number(f?.weight ?? 1.0) || 1.0;
    if (!url) continue;

    try {
      const items = await fetchFeedItems(url);
      for (const it of items) {
        const sig = toSignalItem(it, name, weight);
        if (sig.title) all.push(sig);
      }
    } catch (e) {
      // Don’t fail the whole pipeline because one feed is down
      console.error(`[transfers] feed failed: ${name} ${url} :: ${e?.message || e}`);
    }
  }

  const uniq = dedupe(all);
  const sorted = sortSignals(uniq);

  // Keep only “transfer-ish” items (simple filter)
  const transferish = sorted.filter((x) => {
    const t = (x.title || "").toLowerCase();
    return (
      t.includes("transfer") ||
      t.includes("sign") ||
      t.includes("loan") ||
      t.includes("joins") ||
      t.includes("bid") ||
      t.includes("medical") ||
      t.includes("deal") ||
      t.includes("talks") ||
      t.includes("linked")
    );
  });

  return transferish.slice(0, maxItems);
}

async function main() {
  const mode = env("NETTHUD_TRANSFERS_MODE", "demo").toLowerCase();
  const siteUrl = env("NETTHUD_SITE_URL", "https://netthud.com/");
  const itemsCount = clampInt(env("NETTHUD_TRANSFERS_ITEMS", "12"), 2, 40);

  const lang = env("NETTHUD_TRANSFERS_LANG", "en");
  const region = env("NETTHUD_TRANSFERS_REGION", "US");

  const outFile = path.join(process.cwd(), "assets", "data", "transfers.json");

  let items = [];

  if (mode === "demo") {
    items = buildDemoItems(itemsCount, siteUrl);
  } else if (mode === "live") {
    items = await buildLiveSignals(itemsCount, lang, region);
    // if totally empty (all feeds failed), fall back to demo to avoid blank UI
    if (!items.length) items = buildDemoItems(Math.min(6, itemsCount), siteUrl);
  } else {
    throw new Error(`Unsupported NETTHUD_TRANSFERS_MODE="${mode}". Use "demo" or "live".`);
  }

  const payload = {
    generatedAt: isoNow(),
    mode,
    items: items.map((x) => ({
      // Keep your UI-friendly schema for "Transfer Signals"
      title: x.title,
      stage: x.stage || "watch",
      confidence: clamp01(x.confidence),
      source: x.source || "NetThud Signals",
      publishedAt: x.publishedAt || isoNow(),
      url: x.url || siteUrl,
      tag: stageLabel(x.stage),
    })),
  };

  writeJson(outFile, payload);
  console.log(`Wrote ${outFile} (${payload.items.length} items) mode=${mode}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});