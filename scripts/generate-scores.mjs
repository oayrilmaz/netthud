import fs from "fs/promises";

const DEFAULT_LEAGUES = [
  { name: "Premier League", code: "PL" },
  { name: "La Liga", code: "PD" },
  { name: "Serie A", code: "SA" },
  { name: "Bundesliga", code: "BL1" },
  { name: "Ligue 1", code: "FL1" },
  { name: "Eredivisie", code: "DED" },
  { name: "Primeira Liga", code: "PPL" }
];

function isoDateOnly(d) {
  return d.toISOString().slice(0, 10);
}

function safeInt(x) {
  return Number.isFinite(x) ? x : null;
}

async function fetchJson(url, token) {
  const r = await fetch(url, {
    headers: {
      "X-Auth-Token": token
    }
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`football-data fetch failed ${r.status} ${url}\n${text.slice(0, 300)}`);
  }
  return r.json();
}

function mapMatchToItem(leagueName, m) {
  const home = m?.homeTeam?.name || "";
  const away = m?.awayTeam?.name || "";
  const status = m?.status || "";
  const utcDate = m?.utcDate || null;

  const ftHome = safeInt(m?.score?.fullTime?.home);
  const ftAway = safeInt(m?.score?.fullTime?.away);

  // Only keep finished matches with a known FT score
  if (status !== "FINISHED") return null;
  if (ftHome === null || ftAway === null) return null;

  return {
    league: leagueName,
    date: utcDate ? utcDate.slice(0, 10) : "",
    utcDate: utcDate || "",
    home,
    away,
    status: "FT",
    score: `${ftHome}-${ftAway}`,
    // optional deep link to provider if you want
    url: m?.matchday ? "" : ""
  };
}

async function main() {
  const token = process.env.FOOTBALL_DATA_TOKEN || "";
  const dateTo = new Date(); // today
  const dateFrom = new Date(Date.now() - 24 * 60 * 60 * 1000); // yesterday window to catch late games
  const fromStr = isoDateOnly(dateFrom);
  const toStr = isoDateOnly(dateTo);

  let leagues = DEFAULT_LEAGUES;
  try {
    const leaguesRaw = await fs.readFile("assets/data/leagues.json", "utf8");
    const parsed = JSON.parse(leaguesRaw);
    if (Array.isArray(parsed?.items) && parsed.items.length) {
      leagues = parsed.items.map(x => ({ name: x.name, code: x.code })).filter(x => x.name && x.code);
    }
  } catch {
    // ok: fallback to DEFAULT_LEAGUES
  }

  // If no token, write a clear “demo” file (no fake “real” scores).
  if (!token) {
    const outDemo = {
      generatedAt: new Date().toISOString(),
      mode: "demo-no-token",
      note: "Set FOOTBALL_DATA_TOKEN in GitHub Secrets to fetch real final scores.",
      items: []
    };
    await fs.mkdir("assets/data", { recursive: true });
    await fs.writeFile("assets/data/scores.json", JSON.stringify(outDemo, null, 2) + "\n", "utf8");
    console.log("Wrote assets/data/scores.json (demo-no-token) with 0 items");
    return;
  }

  const items = [];

  for (const lg of leagues) {
    try {
      // competition matches endpoint
      const url = `https://api.football-data.org/v4/competitions/${encodeURIComponent(lg.code)}/matches?status=FINISHED&dateFrom=${fromStr}&dateTo=${toStr}`;
      const data = await fetchJson(url, token);
      const matches = Array.isArray(data?.matches) ? data.matches : [];
      for (const m of matches) {
        const it = mapMatchToItem(lg.name, m);
        if (it) items.push(it);
      }
    } catch (e) {
      console.error("League failed:", lg.code, lg.name, e?.message || e);
    }
  }

  // newest first
  items.sort((a, b) => (b.utcDate || "").localeCompare(a.utcDate || ""));

  const out = {
    generatedAt: new Date().toISOString(),
    mode: "football-data.org",
    window: { dateFrom: fromStr, dateTo: toStr },
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
