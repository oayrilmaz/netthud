import fs from "fs/promises";

const API_BASE = "https://api.football-data.org/v4";

// Keep it small to stay in free limits
const COMPETITIONS = ["PL", "PD", "SA", "BL1", "FL1", "DED", "PPL", "BSA", "CL"];

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

async function fdFetch(path, token) {
  const url = `${API_BASE}${path}`;
  const r = await fetch(url, {
    headers: {
      "X-Auth-Token": token,
      "User-Agent": "netthud-bot/1.0"
    }
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`football-data ${r.status} ${r.statusText} ${url}\n${t}`);
  }
  return r.json();
}

function mapFinishedMatches(data) {
  const out = [];
  for (const m of data?.matches || []) {
    const home = m?.homeTeam?.name || "Home";
    const away = m?.awayTeam?.name || "Away";
    const league = m?.competition?.name || "Competition";
    const date = (m?.utcDate || new Date().toISOString()).slice(0, 10);

    const hs = m?.score?.fullTime?.home ?? m?.score?.halfTime?.home ?? null;
    const as = m?.score?.fullTime?.away ?? m?.score?.halfTime?.away ?? null;
    const score = (hs !== null && as !== null) ? `${hs}-${as}` : "";

    if (!score) continue;

    out.push({
      league,
      date,
      status: "FT",
      home,
      away,
      score,
      url: "https://netthud.com/"
    });
  }
  return out;
}

async function main() {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    throw new Error("Missing env FOOTBALL_DATA_TOKEN (add to GitHub repo Secrets).");
  }

  // Pull last 2 days finished matches (so you actually see results)
  const now = new Date();
  const dateTo = ymd(now);
  const dateFrom = ymd(new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000));

  const all = [];
  for (const code of COMPETITIONS) {
    const data = await fdFetch(
      `/competitions/${code}/matches?status=FINISHED&dateFrom=${dateFrom}&dateTo=${dateTo}`,
      token
    );
    all.push(...mapFinishedMatches(data));
  }

  // Dedup by (home-away-date)
  const key = (x) => `${x.date}|${x.home}|${x.away}|${x.league}|${x.score}`;
  const dedup = Array.from(new Map(all.map((x) => [key(x), x])).values());

  // Most recent first
  dedup.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const items = dedup.slice(0, 40);

  const out = {
    generatedAt: new Date().toISOString(),
    source: "football-data.org",
    mode: "real",
    items
  };

  await fs.mkdir("assets/data", { recursive: true });
  await fs.writeFile("assets/data/scores.json", JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Wrote assets/data/scores.json with ${items.length} items`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
