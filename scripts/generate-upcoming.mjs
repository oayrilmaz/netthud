import fs from "fs/promises";

const BASE = "https://api.football-data.org/v4";

function mustGetToken() {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) throw new Error("Missing FOOTBALL_DATA_TOKEN");
  return token;
}

async function fetchJson(url, token) {
  const r = await fetch(url, { headers: { "X-Auth-Token": token } });
  if (!r.ok) throw new Error(`fetch failed ${r.status} ${url}`);
  return r.json();
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const token = mustGetToken();

  const leagues = JSON.parse(await fs.readFile("leagues.json", "utf8"));
  const codes = leagues.map((l) => l.code).filter(Boolean).join(",");

  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 7));

  const url =
    `${BASE}/matches?competitions=${encodeURIComponent(codes)}` +
    `&dateFrom=${fmtDate(from)}&dateTo=${fmtDate(to)}&status=SCHEDULED`;

  const data = await fetchJson(url, token);
  const matches = Array.isArray(data?.matches) ? data.matches : [];

  const items = matches
    .map((m) => ({
      league: m?.competition?.name || "Competition",
      home: m?.homeTeam?.name || "Home",
      away: m?.awayTeam?.name || "Away",
      utcDate: m?.utcDate || "",
      date: (m?.utcDate || "").slice(0, 10),
      timeUTC: (m?.utcDate || "").slice(11, 16),
      // TV is not reliably available in free feeds:
      tv: [],
    }))
    .sort((a, b) => (a.utcDate || "").localeCompare(b.utcDate || ""));

  const out = {
    generatedAt: new Date().toISOString(),
    mode: "football-data.org",
    items,
  };

  await fs.mkdir("assets/data", { recursive: true });
  await fs.writeFile("assets/data/upcoming.json", JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Wrote assets/data/upcoming.json with ${items.length} items`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
