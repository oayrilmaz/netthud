import fs from "fs/promises";

function demoLive() {
  const now = new Date();
  const minute = (now.getUTCMinutes() % 90) + 1;

  return [
    {
      league: "Premier League",
      home: "Arsenal",
      away: "Liverpool",
      status: "LIVE",
      minute,
      score: "1-0",
      url: "https://netthud.com/"
    },
    {
      league: "La Liga",
      home: "Real Madrid",
      away: "Barcelona",
      status: "LIVE",
      minute: Math.max(1, minute - 7),
      score: "0-0",
      url: "https://netthud.com/"
    },
    {
      league: "Serie A",
      home: "Inter",
      away: "Juventus",
      status: "HT",
      minute: 45,
      score: "2-1",
      url: "https://netthud.com/"
    },
    {
      league: "Bundesliga",
      home: "Bayern Munich",
      away: "Borussia Dortmund",
      status: "LIVE",
      minute: Math.max(1, minute - 33),
      score: "1-1",
      url: "https://netthud.com/"
    },
    {
      league: "Ligue 1",
      home: "PSG",
      away: "Marseille",
      status: "FT",
      minute: 90,
      score: "3-2",
      url: "https://netthud.com/"
    }
  ];
}

async function main() {
  const items = demoLive();

  const out = {
    generatedAt: new Date().toISOString(),
    mode: "demo",
    items
  };

  await fs.mkdir("assets/data", { recursive: true });
  await fs.writeFile(
    "assets/data/scores.json",
    JSON.stringify(out, null, 2),
    "utf8"
  );

  console.log(`✔ wrote assets/data/scores.json (${items.length} matches)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});