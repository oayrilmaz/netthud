import fs from "fs/promises";
import path from "path";

const OUT_PATH = path.posix.join("assets", "data", "ai-news.json");

const FEEDS = [
  "https://feeds.bbci.co.uk/sport/football/rss.xml",
  "https://www.espn.com/espn/rss/soccer/news",
  "https://www.theguardian.com/football/rss",
];

// ---------- helpers ----------
function pickTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? m[1].trim() : "";
}
function stripCdata(s = "") {
  return s.replace("<![CDATA[", "").replace("]]>", "").trim();
}
function stripHtml(s = "") {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
function safeIsoDate(maybeDate) {
  try {
    const d = new Date(maybeDate);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}
function safeText(v) {
  return (v ?? "").toString().trim();
}
function hostFromUrl(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
async function ensureDirFor(filePath) {
  const dir = path.posix.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

// Parse RSS items (<item> blocks)
function parseRss(xml, feedHost) {
  const items = [];
  const chunks = xml.split(/<item>/i).slice(1);

  for (const chunk of chunks) {
    const body = chunk.split(/<\/item>/i)[0] || "";

    const title = stripHtml(stripCdata(pickTag(body, "title")));
    const link =
      stripCdata(pickTag(body, "link")) ||
      stripCdata(pickTag(body, "guid"));

    const pubDateRaw =
      stripCdata(pickTag(body, "pubDate")) ||
      stripCdata(pickTag(body, "dc:date")) ||
      "";

    const descRaw =
      stripCdata(pickTag(body, "description")) ||
      stripCdata(pickTag(body, "content:encoded")) ||
      "";

    const publishedAt = safeIsoDate(pubDateRaw) || new Date().toISOString();
    const summary = stripHtml(descRaw).slice(0, 220) || "Football update.";

    if (title && link) {
      items.push({
        title,
        url: link,
        source: feedHost || "",
        publishedAt,
        summary,
      });
    }
  }

  return items;
}

// Fetch with timeout so Actions never hangs
async function fetchText(url, timeoutMs = 15000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const r = await fetch(url, {
      signal: ac.signal,
      headers: {
        "user-agent": "netthud-bot/1.0 (+https://netthud.com)",
        "accept": "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1",
      },
    });
    if (!r.ok) throw new Error(`RSS fetch failed ${r.status} ${url}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const all = [];
  const errors = [];

  for (const url of FEEDS) {
    const host = hostFromUrl(url);
    try {
      const xml = await fetchText(url);
      const parsed = parseRss(xml, host);
      all.push(...parsed);
      console.log(`Fetched ${host}: ${parsed.length} items`);
    } catch (e) {
      errors.push({ feed: url, error: e?.message || String(e) });
      console.warn(`Feed failed: ${url} (${e?.message || e})`);
    }
  }

  // Sort newest first + dedupe by url
  all.sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));
  const dedup = new Map();
  for (const it of all) {
    const key = safeText(it.url);
    if (key && !dedup.has(key)) dedup.set(key, it);
  }

  const items = Array.from(dedup.values()).slice(0, 30);

  const out = {
    meta: {
      updated: new Date().toISOString(),
      mode: "rss",
      feeds: FEEDS,
      okCount: items.length,
      failCount: errors.length,
    },
    items,
    errors: errors.length ? errors : undefined,
  };

  await ensureDirFor(OUT_PATH);
  await fs.writeFile(OUT_PATH, JSON.stringify(out, null, 2) + "\n", "utf8");

  console.log(`Wrote ${OUT_PATH} with ${items.length} items (fails: ${errors.length})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});