import fs from "fs/promises";

const FEEDS = [
  "https://feeds.bbci.co.uk/sport/football/rss.xml",
  "https://www.espn.com/espn/rss/soccer/news",
  "https://www.theguardian.com/football/rss",
];

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

function parseRss(xml) {
  const items = [];
  const chunks = xml.split(/<item>/i).slice(1);
  for (const chunk of chunks) {
    const body = chunk.split(/<\/item>/i)[0] || "";
    const title = stripHtml(stripCdata(pickTag(body, "title")));
    const link = stripCdata(pickTag(body, "link")) || stripCdata(pickTag(body, "guid"));
    const pubDate = stripCdata(pickTag(body, "pubDate"));
    const descRaw = stripCdata(pickTag(body, "description"));
    const summary = stripHtml(descRaw).slice(0, 220);

    if (title && link) {
      items.push({
        title,
        url: link,
        source: "",
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        summary: summary || "Football update.",
      });
    }
  }
  return items;
}

async function fetchText(url) {
  const r = await fetch(url, { headers: { "user-agent": "netthud-bot/1.0" } });
  if (!r.ok) throw new Error(`RSS fetch failed ${r.status} ${url}`);
  return r.text();
}

async function main() {
  const all = [];

  for (const url of FEEDS) {
    try {
      const xml = await fetchText(url);
      const parsed = parseRss(xml);
      const host = new URL(url).hostname.replace("www.", "");
      for (const p of parsed) p.source = p.source || host;
      all.push(...parsed);
    } catch (e) {
      console.error("Feed failed:", url, e?.message || e);
    }
  }

  const dedup = new Map();
  for (const it of all.sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""))) {
    if (!dedup.has(it.url)) dedup.set(it.url, it);
  }

  const items = Array.from(dedup.values()).slice(0, 30);

  const out = {
    generatedAt: new Date().toISOString(),
    source: "NetThud RSS aggregation",
    items,
  };

  await fs.mkdir("assets/data", { recursive: true });
  await fs.writeFile("assets/data/ai-news.json", JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Wrote assets/data/ai-news.json with ${items.length} items`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
