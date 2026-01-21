// scripts/generate-transfers.mjs
// Generates: assets/data/transfers.json
//
// Option A (LIVE):
//   - Reads RSS feeds (public headlines/snippets)
//   - Converts them into "transfer signals" (stage + confidence)
//   - Optional OpenAI enrichment to extract player/from/to/fee + refine confidence
//
// Output schema supports your index.html normalizeSignals():
//   items[] can include { title, stage, confidence, source, publishedAt, url, ... }
//
// Env:
//   NETTHUD_TRANSFERS_MODE=demo|live                 (default demo)
//   NETTHUD_TRANSFERS_ITEMS=120                      (default 120, max 300)
//   NETTHUD_TRANSFERS_LOOKBACK_HOURS=72              (default 72, 6..240)
//   NETTHUD_TRANSFERS_RSS="url1|url2|url3"           (optional; if not set, uses defaults below)
//   NETTHUD_SITE_URL=https://netthud.com/            (default https://netthud.com/)
//   NETTHUD_TRANSFERS_LANG=en                        (optional metadata)
//   NETTHUD_TRANSFERS_REGION=US                      (optional metadata)
//
// Optional OpenAI enrichment:
//   NETTHUD_USE_OPENAI=1
//   OPENAI_API_KEY=...   (GitHub secret)
//   NETTHUD_OPENAI_MODEL=... (optional; default "gpt-4.1-mini")
//
// Notes (legal / safety):
//   - We store and show the original source domain as "source" and preserve item url.
//   - Your UI can display a global disclaimer: "AI-generated signals; may be incorrect."
//   - Avoid copying full articles; we only use headlines + short snippets (best practice).

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

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.max(0, Math.min(1, x));
}

function hoursAgoMs(h) {
  return Date.now() - h * 3600_000;
}

function minutesAgo(mins) {
  const d = new Date(Date.now() - mins * 60_000);
  return d.toISOString();
}

// ------------------------------
// Fetch helper (timeout + UA)
// ------------------------------
async function fetchText(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent": "netthud-bot/1.0 (+https://netthud.com/)",
        "accept": "application/rss+xml, application/xml, text/xml, text/plain, */*",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// ------------------------------
// DEMO mode
// ------------------------------
function buildDemoItems(count, siteUrl) {
  const pool = [
    { status: "advanced", player: "Midfielder Y", from: "Club C", to: "Club D", fee: "€18m" },
    { status: "advanced", player: "Winger Z", from: "Club F", to: "Club G", fee: "€32m" },
    { status: "contact", player: "Fullback R", from: "Club H", to: "Club I", fee: "€9m" },
    { status: "contact", player: "Defender S", from: "Club T", to: "Club U", fee: "loan" },
    { status: "rumor", player: "Forward X", from: "Club A", to: "Club B", fee: "loan" },
    { status: "rumor", player: "Striker K", from: "Club J", to: "Club L", fee: "€45m" },
    { status: "watch", player: "Goalkeeper Q", from: "Club M", to: "Club N", fee: "€12m" },
    { status: "watch", player: "Playmaker P", from: "Club O", to: "Club P", fee: "€25m" },
  ];

  const rot = new Date().getUTCMinutes() % pool.length;
  const rotated = pool.slice(rot).concat(pool.slice(0, rot));
  const take = rotated.slice(0, Math.max(6, Math.min(count, rotated.length)));

  return take.map((x, i) => ({
    player: x.player,
    from: x.from,
    to: x.to,
    fee: x.fee,
    status: x.status,
    stage: x.status === "advanced" ? "advanced" : x.status === "contact" || x.status === "rumor" ? "contact" : "watch",
    confidence:
      x.status === "advanced" ? 0.78 :
      x.status === "contact" ? 0.55 :
      x.status === "rumor" ? 0.48 : 0.40,
    publishedAt: minutesAgo(20 + i * 12),
    url: siteUrl || "https://netthud.com/",
    source: "NetThud Signals",
    title: `${x.player}: ${x.from} → ${x.to} (${x.fee})`,
    aiGenerated: true,
    disclaimer: "AI-generated signal; may be incorrect.",
  }));
}

// ------------------------------
// RSS parsing (no deps, best-effort)
// ------------------------------
function stripCdata(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .trim();
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function getTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return "";
  return decodeEntities(stripCdata(m[1]));
}

function parseRssItems(xml) {
  const items = [];

  // RSS <item>
  const rssMatches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const chunk of rssMatches) {
    const title = getTag(chunk, "title");
    const link = getTag(chunk, "link");
    const pubDate = getTag(chunk, "pubDate") || getTag(chunk, "published") || getTag(chunk, "updated");
    const desc = getTag(chunk, "description") || getTag(chunk, "content:encoded");
    if (title) items.push({ title, link, pubDate, desc });
  }

  // Atom <entry>
  const atomMatches = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const chunk of atomMatches) {
    const title = getTag(chunk, "title");
    let link = "";
    const linkMatch = chunk.match(/<link[^>]*href="([^"]+)"/i);
    if (linkMatch) link = decodeEntities(linkMatch[1]);
    const pubDate = getTag(chunk, "published") || getTag(chunk, "updated");
    const desc = getTag(chunk, "summary") || getTag(chunk, "content");
    if (title) items.push({ title, link, pubDate, desc });
  }

  return items
    .map((x) => ({
      title: (x.title || "").trim(),
      link: (x.link || "").trim(),
      pubDate: (x.pubDate || "").trim(),
      desc: (x.desc || "").trim(),
    }))
    .filter((x) => x.title);
}

function parseDateMs(s) {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function stripHtml(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickSourceName(feedUrl) {
  try {
    const u = new URL(feedUrl);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

// ------------------------------
// Signal heuristics (baseline)
// ------------------------------
function stageAndConfidenceFromText(text) {
  const t = String(text || "").toLowerCase();

  // Advanced/high confidence
  if (/(here we go|signed|signs|completed|official|announced|joins|medical complete|unveiled)/i.test(t)) {
    return { stage: "advanced", confidence: 0.90 };
  }
  if (/(medical|fee agreed|agreement|personal terms agreed|deal agreed|set to join|close to signing)/i.test(t)) {
    return { stage: "advanced", confidence: 0.78 };
  }

  // Contact/talks
  if (/(talks|contact|approach|bid|offer|negotiations|in discussions|opened talks|interested|shortlist)/i.test(t)) {
    return { stage: "contact", confidence: 0.58 };
  }

  // Watch/rumors
  if (/(linked|could|rumou?r|monitor|watched|eyeing|considering|may|might)/i.test(t)) {
    return { stage: "watch", confidence: 0.45 };
  }

  return { stage: "watch", confidence: 0.40 };
}

function looksLikeTransfer(text) {
  const s = String(text || "").toLowerCase();
  return /(transfer|sign|signing|loan|deal|bid|talks|medical|joins|agreement|contract|release clause|fee)/i.test(s);
}

// ------------------------------
// Optional OpenAI enrichment (strict JSON)
// Uses Responses API (recommended), returns a JSON array of same length.
// ------------------------------
async function enrichWithOpenAI(items) {
  const use = env("NETTHUD_USE_OPENAI", "0") === "1";
  const apiKey = env("OPENAI_API_KEY", "");
  if (!use || !apiKey || !items.length) return items;

  const model = env("NETTHUD_OPENAI_MODEL", "gpt-4.1-mini");

  // keep cost bounded: enrich only top N
  const topN = Math.min(40, items.length);
  const top = items.slice(0, topN);

  const instruction = `
Extract structured football transfer signals from headlines/snippets.
Return JSON ONLY (no markdown): an array of objects same length as input, each with:
player (string or ""),
fromClub (string or ""),
toClub (string or ""),
fee (string or ""),
stage (one of "advanced","contact","watch"),
confidence (number 0..1),
cleanTitle (short string).
If unknown, use empty strings. Keep stage/confidence consistent with the text.
`;

  const input = top.map((x) => ({
    headline: x.title,
    snippet: x.snippet || "",
    source: x.source || "",
    url: x.url || "",
  }));

  // Responses API
  const body = {
    model,
    input: [
      { role: "system", content: "Return strict JSON only. No commentary." },
      { role: "user", content: instruction + "\n\nINPUT:\n" + JSON.stringify(input) },
    ],
    temperature: 0.2,
  };

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.warn("OpenAI enrichment failed:", res.status, await res.text().catch(() => ""));
    return items;
  }

  const json = await res.json().catch(() => null);
  // Responses API returns output text in different shapes; handle common ones:
  const text =
    json?.output_text ||
    json?.output?.[0]?.content?.[0]?.text ||
    json?.output?.[0]?.content?.map?.((c) => c.text).join("") ||
    "[]";

  let parsed = [];
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = [];
  }

  if (!Array.isArray(parsed) || parsed.length !== top.length) return items;

  const merged = items.slice();
  for (let i = 0; i < top.length; i++) {
    const ai = parsed[i] || {};
    const base = merged[i];

    const stage = String(ai.stage || base.stage || "watch");
    const conf = clamp01(ai.confidence);

    merged[i] = {
      ...base,
      player: String(ai.player || base.player || ""),
      from: String(ai.fromClub || base.from || ""),
      to: String(ai.toClub || base.to || ""),
      fee: String(ai.fee || base.fee || ""),
      stage: ["advanced", "contact", "watch"].includes(stage) ? stage : base.stage,
      confidence: conf == null ? base.confidence : conf,
      title: String(ai.cleanTitle || base.title || ""),
      aiGenerated: true,
      disclaimer: "AI-generated signal; may be incorrect.",
    };
  }

  return merged;
}

// ------------------------------
// LIVE mode: build signals from RSS
// ------------------------------
function defaultRssFeeds() {
  // You can replace/extend these any time via NETTHUD_TRANSFERS_RSS.
  // Keep these broad football feeds; we filter transfer-y headlines via looksLikeTransfer().
  return [
    "https://www.theguardian.com/football/rss",
    "https://feeds.bbci.co.uk/sport/football/rss.xml",
    "https://www.skysports.com/rss/12040", // Sky Sports Football (often works; if not, remove)
  ];
}

async function buildLiveItems(count, siteUrl) {
  const rssListRaw = env("NETTHUD_TRANSFERS_RSS", "").trim();
  const lookbackHrs = clampInt(env("NETTHUD_TRANSFERS_LOOKBACK_HOURS", "72"), 6, 240);

  const feeds = rssListRaw
    ? rssListRaw.split("|").map((s) => s.trim()).filter(Boolean)
    : defaultRssFeeds();

  const cutoff = hoursAgoMs(lookbackHrs);

  const all = [];

  for (const feedUrl of feeds) {
    try {
      const xml = await fetchText(feedUrl, 14000);
      const rssItems = parseRssItems(xml);

      for (const it of rssItems) {
        const ts = parseDateMs(it.pubDate) ?? Date.now();
        if (ts < cutoff) continue;

        const snippet = stripHtml(it.desc).slice(0, 260);
        const text = (it.title || "") + " " + snippet;

        if (!looksLikeTransfer(text)) continue;

        const sc = stageAndConfidenceFromText(text);
        const src = pickSourceName(feedUrl);

        all.push({
          player: "",
          from: "",
          to: "",
          fee: "",
          status: sc.stage,      // kept for backward compatibility
          stage: sc.stage,       // advanced|contact|watch
          confidence: sc.confidence,
          title: (it.title || "").trim(),
          source: src,
          publishedAt: new Date(ts).toISOString(),
          url: it.link || siteUrl,
          snippet,
          aiGenerated: true,
          disclaimer: "AI-generated signal; may be incorrect.",
        });
      }
    } catch (e) {
      // ignore feed failures; don’t break pipeline
      console.warn("RSS fetch/parse failed:", feedUrl, String(e?.message || e));
    }
  }

  // de-dup by (normalized title)
  const seen = new Set();
  const dedup = [];
  for (const x of all.sort((a, b) => String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")))) {
    const k = String(x.title || "").toLowerCase().trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    dedup.push(x);
  }

  // clamp output
  return dedup.slice(0, Math.max(10, Math.min(count, 300)));
}

async function main() {
  const mode = env("NETTHUD_TRANSFERS_MODE", "demo").toLowerCase();
  const siteUrl = env("NETTHUD_SITE_URL", "https://netthud.com/");
  const itemsCount = clampInt(env("NETTHUD_TRANSFERS_ITEMS", "120"), 10, 300);

  const outFile = path.join(process.cwd(), "assets", "data", "transfers.json");

  let items = [];

  if (mode === "demo") {
    items = buildDemoItems(itemsCount, siteUrl);
  } else if (mode === "live") {
    items = await buildLiveItems(itemsCount, siteUrl);
    items = await enrichWithOpenAI(items);

    // If still empty, don’t break UI
    if (!items.length) items = buildDemoItems(Math.min(itemsCount, 16), siteUrl);
  } else {
    throw new Error(`Unsupported NETTHUD_TRANSFERS_MODE="${mode}". Use "demo" or "live".`);
  }

  const payload = {
    generatedAt: isoNow(),
    mode,
    lang: env("NETTHUD_TRANSFERS_LANG", "en"),
    region: env("NETTHUD_TRANSFERS_REGION", "US"),
    disclaimer: "AI-generated signals; may be incorrect. Always verify with primary sources.",
    items,
  };

  writeJson(outFile, payload);
  console.log(`Wrote ${outFile} (${items.length} items)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});