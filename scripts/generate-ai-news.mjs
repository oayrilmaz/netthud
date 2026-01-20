// scripts/generate-ai-news.mjs
import fs from "fs";

function readJson(path, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(path, obj) {
  fs.mkdirSync(path.split("/").slice(0, -1).join("/"), { recursive: true });
  fs.writeFileSync(path, JSON.stringify(obj, null, 2));
}

function safeItems(data) {
  return Array.isArray(data?.items) ? data.items : [];
}

function buildInsights({ scores, upcoming }) {
  const scoreItems = safeItems(scores);
  const upItems = safeItems(upcoming);

  const insights = [];

  // Insight 1: "Top scoring matches" (from recent finals)
  const topScore = [...scoreItems]
    .filter(x => typeof x?.score === "string" && x.score.includes("-"))
    .slice(0, 20);

  if (topScore.length) {
    insights.push({
      id: "insight-top-scores",
      source: "NetThud",
      publishedAt: new Date().toISOString(),
      title: "Tonight’s highest-scoring finals",
      summary: topScore.slice(0, 5).map(m => `${m.home} ${m.score} ${m.away} (${m.league})`).join(" • "),
      url: "https://netthud.com/"
    });
  }

  // Insight 2: "Next marquee fixtures" (from upcoming)
  const nextGames = upItems.slice(0, 5);
  if (nextGames.length) {
    insights.push({
      id: "insight-upcoming",
      source: "NetThud",
      publishedAt: new Date().toISOString(),
      title: "Upcoming games to watch",
      summary: nextGames.map(m => `${m.home} vs ${m.away} (${m.league})`).join(" • "),
      url: "https://netthud.com/"
    });
  }

  // Fallback insight
  if (!insights.length) {
    insights.push({
      id: "insight-empty",
      source: "NetThud",
      publishedAt: new Date().toISOString(),
      title: "NetThud Insights are warming up",
      summary: "Once scores/upcoming are generated, this will show match-driven insights (no external news sites).",
      url: "https://netthud.com/"
    });
  }

  return insights;
}

// Read your existing generated data (even if demo)
const scores = readJson("assets/data/scores.json", { items: [] });
const upcoming = readJson("assets/data/upcoming.json", { items: [] });

const out = {
  generatedAt: new Date().toISOString(),
  source: "NetThud",
  items: buildInsights({ scores, upcoming })
};

writeJson("assets/data/ai-news.json", out);
console.log("Wrote assets/data/ai-news.json with NetThud-only insights:", out.items.length);