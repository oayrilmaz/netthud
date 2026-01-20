import fs from "fs/promises";

const BASE = "https://api.football-data.org/v4";

function mustGetToken() {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    throw new Error(
      "Missing FOOTBALL_DATA_TOKEN. Add it in GitHub: Settings → Secrets and variables → Actions → New repository secret."
    );
  }
  return token;
}

async function fetchJson(url, token) {
  const r = await fetch(url, {
    headers: { "X-Auth-Token": token },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`football-data fetch failed ${r.status} ${url}\n${text}`);
  }
  return r.json();
}

function fmtDate(d) {
  // yyyy-mm-dd (UTC)
  return d.toISOString().slice(0, 10);
}

function safeScore(match) {
  // football-data v4: match.score.fullTime.home/away can be null
  const ft = match?.score?.fullTime || {};
  if (typeof ft.home === "number" && typeof ft.away === "number") return `${ft.home}-${ft.away}`;
  const ht = match?.score?.halfTime || {};
  if (typeof ht.home === "number" && typeof ht.away === "number") return `${ht.home}-${ht.away}`;
  return "—";
}

function normalizeStatus(match) {
  // Common: FINISHED
  if (match?.status === "FINISHED") return "FT";
  if (match?.status === "AWARDED") return "AWD";
  if (match?.status === "POSTPONED") return "PP";
  if (match?.status === "CANCELLED") return "CANC";
  return match?.status || "—";
}

async function main() {
  const token = mustGetToken();

  // Read leagues from root leagues.json (same file your UI uses)
  const leaguesRaw = await fs.readFile("leagues.json", "utf8");
  const leagues = JSON.parse(leaguesRaw);

  // Final scores: last 2 days window (covers timezones + late games)
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 2));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const codes = leagues
    .map((l) => l.code)
    .filter(Boolean)
    .join(",");

  const url =
    `${BASE}/matches?competitions=${encodeURIComponent(codes)}` +
    `&dateFrom=${fmtDate(from)}&dateTo=${fmtDate(to)}&status=FINISHED`;

  const data = await fetchJson(url, token);
  const matches = Array.isArray(data?.matches) ? data.matches : [];

  // Convert to your site format
  const items = matches
    .map((m) => ({
      league: m?.competition?.name || "Competition",
      home: m?.homeTeam?.name || "Home",
      away: m?.awayTeam?.name || "Away",
      status: normalizeStatus(m),
      date: (m?.utcDate || new Date().toISOString()).slice(0, 10),
      score: safeScore(m),
      // Keep URL as match reference if you want later:
      sourceUrl: m?.competition?.website || "",
    }))
    // newest first
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const out = {
    generatedAt: new Date().toISOString(),
    mode: "football-data.org",
    items,
  };

  await fs.mkdir("assets/data", { recursive: true });
  await fs.writeFile("assets/data/scores.json", JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Wrote assets/data/scores.json with ${items.length} items`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
