import fs from "fs/promises";

function isoInHours(h) {
  return new Date(Date.now() + h * 3600 * 1000).toISOString();
}

async function main() {
  const items = [
    { league: "Premier League", kickoff: isoInHours(6), home: "Chelsea", away: "Newcastle", venue: "Stamford Bridge", tv: ["Peacock", "USA Network"], url: "https://netthud.com/" },
    { league: "La Liga", kickoff: isoInHours(10), home: "Atletico Madrid", away: "Sevilla", venue: "Cívitas Metropolitano", tv: ["ESPN+"], url: "https://netthud.com/" },
    { league: "Serie A", kickoff: isoInHours(14), home: "Milan", away: "Napoli", venue: "San Siro", tv: ["Paramount+"], url: "https://netthud.com/" },
    { league: "Bundesliga", kickoff: isoInHours(20), home: "Leipzig", away: "Leverkusen", venue: "Red Bull Arena", tv: ["ESPN+"], url: "https://netthud.com/" },
  ];

  const out = {
    generatedAt: new Date().toISOString(),
    mode: "demo",
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