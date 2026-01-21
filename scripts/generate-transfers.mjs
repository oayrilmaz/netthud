// scripts/generate-transfers.mjs
// Generates: assets/data/transfers.json
//
// Modes:
//   - demo: no external calls
//   - live: fetches RSS sources and converts headlines into "transfer signals"
//
// Optional AI enrichment (recommended):
//   - If OPENAI_API_KEY is set and NETTHUD_USE_OPENAI=1, the script asks the model to
//     extract player/from/to/fee and refine stage/confidence.
//
// Env:
//   NETTHUD_TRANSFERS_MODE=demo|live
//   NETTHUD_TRANSFERS_ITEMS=60
//   NETTHUD_TRANSFERS_LOOKBACK_HOURS=72
//   NETTHUD_TRANSFERS_RSS="url1|url2|url3"
//   NETTHUD_SITE_URL=https://netthud.com/
//   NETTHUD_USE_OPENAI=1
//   OPENAI_API_KEY=... (GitHub secret)

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

function hoursAgo(h) {
  return Date.now() - h * 3600_000;
}

// ------------------------------
// DEMO POOL
// ------------------------------
function minutesAgo(mins) {
  const d = new Date(Date.now() - mins * 60_000);
  return d.toISOString();
}

function buildDemoItems(count, siteUrl) {
  const pool = [
    { status: "advanced", player: "Midfielder Y", from: "Club C", to: "Club D", fee: "€18m" },
    { status: "advanced", player: "Winger Z", from: "Club F", to: "Club G", fee: "€32m" },
    { status: "contact",  player: "Fullback R", from: "Club H", to: "Club I", fee: "€9m" },
    { status: "contact",  player: "Defender S", from: "Club T", to: "Club U", fee: "loan" },
    { status: "rumor",    player: "Forward X", from: "Club A", to: "Club B", fee: "loan" },
    { status: "rumor",    player: "Striker K", from: "Club J", to: "Club L", fee: "€45m" },
    { status: "watch",    player: "Goalkeeper Q", from: "Club M", to: "Club N", fee: "€12m" },
    { status: "watch",    player: "Playmaker P", from: "Club O", to: "Club P", fee: "€25m" },
  ];

  const rot = new Date().getUTCMinutes() % pool.length;
  const rotated = pool.slice(rot).concat(pool.slice(0, rot));
  const take = rotated.slice(0, Math.max(2, Math.min(count, rotated.length)));

  return take.map((x, i) => ({
    player: x.player,
    from: x.from,
    to: x.to,
    fee: x.fee,
    status: x.status, // advanced|contact|rumor|watch
    publishedAt: minutesAgo(30 + i * 15),
    url: siteUrl || "https://netthud.com/",
    source: "NetThud Signals",
    title: `${x.player}: ${x.from} → ${x.to} (${x.fee})`,
    stage: x.status === "advanced" ? "advanced" : x.status === "contact" ? "contact" : "watch",
    confidence:
      x.status === "advanced" ? 0.78 :
      x.status === "contact"  ? 0.55 :
      x.status === "rumor"    ? 0.48 : 0.40,
  }));
}

// ------------------------------
// RSS parsing (no dependencies)
// ------------------------------
function stripCdata(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .trim();
}

function decodeEntities(s) {
  // minimal decode for common entities
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function getTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return "";
  return decodeEntities(stripCdata(m[1]));
}

function parseRssItems(xml) {
  // Works for RSS/Atom-ish feeds in a best-effort way.
  const items = [];

  // RSS <item>...</item>
  const rssMatches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const chunk of rssMatches) {
    const title = getTag(chunk, "title");
    const link = getTag(chunk, "link");
    const pubDate = getTag(chunk, "pubDate") || getTag(chunk, "published") || getTag(chunk, "updated");
    const desc = getTag(chunk, "description") || getTag(chunk, "content:encoded");
    items.push({ title, link, pubDate, desc });
  }

  // Atom <entry>...</entry>
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
    .map(x => ({
      title: (x.title || "").trim(),
      link: (x.link || "").trim(),
      pubDate: (x.pubDate || "").trim(),
      desc: (x.desc || "").trim(),
    }))
    .filter(x => x.title);
}

function parseDate(s) {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

// ------------------------------
// Signal heuristics (non-AI baseline)
// ------------------------------
function stageAndConfidenceFromText(text) {
  const t = String(text || "").toLowerCase();

  // High confidence advanced
  if (/(here we go|signed|signs|completed|official|announced|joins|medical complete|unveiled)/i.test(t)) {
    return { stage: "advanced", confidence: 0.9 };
  }
  if (/(medical|fee agreed|agreement|personal terms agreed|deal agreed|set to join|close to signing)/i.test(t)) {
    return { stage: "advanced", confidence: 0.78 };
  }

  // Contact / talks
  if (/(talks|contact|approach|bid|offer|negotiations|in discussions|opened talks|interested|shortlist)/i.test(t)) {
    return { stage: "contact", confidence: 0.58 };
  }

  // Watch / rumors
  if (/(linked|could|rumou?r|monitor|watched|eyeing|considering|may|might)/i.test(t)) {
    return { stage: "watch", confidence: 0.45 };
  }

  return { stage: "watch", confidence: 0.40 };
}

function looksLikeTransfer(t) {
  const s = String(t || "").toLowerCase();
  return /(transfer|sign|signing|loan|deal|bid|talks|medical|joins|agreement|contract|release clause|fee)/i.test(s);
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
// Optional OpenAI enrichment
// ------------------------------
async function enrichWithOpenAI(items) {
  const use = env("NETTHUD_USE_OPENAI", "0") === "1";
  const apiKey = env("OPENAI_API_KEY", "");
  if (!use || !apiKey || !items.length) return items;

  // Keep it cheap: only enrich top N headlines
  const top = items.slice(0, Math.min(25, items.length));

  const prompt = `
You are extracting structured football transfer signals from headlines/snippets.
Return JSON ONLY: an array of objects same length, each with:
player (string or ""),
fromClub (string or ""),
toClub (string or ""),
fee (string or ""),
stage (one of "advanced","contact","watch"),
confidence (0..1 number),
cleanTitle (string short).
If unknown, leave empty strings. Keep stage+confidence consistent with the language.
`;

  const input = top.map(x => ({
    headline: x.title,
    snippet: x.snippet || "",
    source: x.source || "",
    url: x.url || ""
  }));

  const body = {
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: "Return strict JSON only. No markdown. No commentary." },
      { role: "user", content: prompt + "\n\nINPUT:\n" + JSON.stringify(input) }
    ],
    temperature: 0.2
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    console.warn("OpenAI enrichment failed:", res.status, await res.text());
    return items;
  }

  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content || "[]";

  let parsed = [];
  try { parsed = JSON.parse(text); } catch { parsed = []; }
  if (!Array.isArray(parsed) || parsed.length !== top.length) return items;

  const merged = items.slice();
  for (let i = 0; i < top.length; i++) {
    const ai = parsed[i] || {};
    const base = merged[i];

    const conf = clamp01(ai.confidence);
    merged[i] = {
      ...base,
      player: String(ai.player || base.player || ""),
      from: String(ai.fromClub || base.from || ""),
      to: String(ai.toClub || base.to || ""),
      fee: String(ai.fee || base.fee || ""),
      stage: ["advanced","contact","watch"].includes(String(ai.stage)) ? String(ai.stage) : base.stage,
      confidence: conf == null ? base.confidence : conf,
      title: String(ai.cleanTitle || base.title || "")
    };
  }

  return merged;
}

// ------------------------------
// LIVE MODE: build signals from RSS
// ------------------------------
async function buildLiveItems(count, siteUrl) {
  const rssListRaw = env("NETTHUD_TRANSFERS_RSS", "").trim();
  const lookbackHrs = clampInt(env("NETTHUD_TRANSFERS_LOOKBACK_HOURS", "72"), 6, 240);

  const feeds = rssListRaw
    ? rssListRaw.split("|").map(s => s.trim()).filter(Boolean)
    : [];

  if (!feeds.length) {
    console.warn("No NETTHUD_TRANSFERS_RSS provided; falling back to demo.");
    return buildDemoItems(count, siteUrl);
  }

  const cutoff = hoursAgo(lookbackHrs);

  const all = [];
  for (const feedUrl of feeds) {
    try {
      const r = await fetch(feedUrl, { headers: { "user-agent": "netthud-bot/1.0" } });
      if (!r.ok) continue;
      const xml = await r.text();

      const items = parseRssItems(xml).map(it => {
        const ts = parseDate(it.pubDate) ?? Date.now();
        return {
          title: it.title,
          url: it.link || siteUrl,
          publishedAt: new Date(ts).toISOString(),
          ts,
          source: pickSourceName(feedUrl),
          snippet: it.desc ? it.desc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240) : ""
        };
      });

      for (const it of items) {
        if (it.ts < cutoff) continue;
        if (!looksLikeTransfer(it.title + " " + it.snippet)) continue;

        const sc = stageAndConfidenceFromText(it.title + " " + it.snippet);

        all.push({
          player: "",
          from: "",
          to: "",
          fee: "",
          status: sc.stage, // keep your UI mapping
          stage: sc.stage,
          confidence: sc.confidence,
          title: it.title,
          source: it.source,
          publishedAt: it.publishedAt,
          url: it.url || siteUrl
        });
      }
    } catch {
      // ignore feed failures
    }
  }

  // de-dup by title
  const seen = new Set();
  const dedup = [];
  for (const x of all.sort((a,b)=> (b.publishedAt || "").localeCompare(a.publishedAt || ""))) {
    const k = (x.title || "").toLowerCase().trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    dedup.push(x);
  }

  const sliced = dedup.slice(0, Math.max(10, Math.min(count, 200)));
  return sliced;
}

async function main() {
  const mode = env("NETTHUD_TRANSFERS_MODE", "demo").toLowerCase();
  const siteUrl = env("NETTHUD_SITE_URL", "https://netthud.com/");
  const itemsCount = clampInt(env("NETTHUD_TRANSFERS_ITEMS", "60"), 10, 200);

  const outFile = path.join(process.cwd(), "assets", "data", "transfers.json");

  let items = [];

  if (mode === "demo") {
    items = buildDemoItems(itemsCount, siteUrl);
  } else if (mode === "live") {
    items = await buildLiveItems(itemsCount, siteUrl);
    items = await enrichWithOpenAI(items);
    // If still empty, don’t break the UI
    if (!items.length) items = buildDemoItems(Math.min(itemsCount, 12), siteUrl);
  } else {
    throw new Error(`Unsupported NETTHUD_TRANSFERS_MODE="${mode}". Use "demo" or "live".`);
  }

  const payload = {
    generatedAt: isoNow(),
    mode,
    items
  };

  writeJson(outFile, payload);
  console.log(`Wrote ${outFile} (${items.length} items)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});