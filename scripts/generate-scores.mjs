import fs from "fs/promises";

const today = new Date().toISOString().slice(0, 10);

const items = [
  {
    league: "Premier League",
    home: "Arsenal",
    away: "Liverpool",
    score: "2-1",
    status: "FT",
    date: today
  },
  {
    league: "La Liga",
    home: "Real Madrid",
    away: "Barcelona",
    score: "0-0",
    status: "FT",
    date: today
  },
  {
    league: "Serie A",
    home: "Inter",
    away: "Juventus",
    score: "3-2",
    status: "FT",
    date: today
  }
];

async function main() {
  const out = {
    generatedAt: new Date().toISOString(),
    items
  };

  await fs.mkdir("assets/data", { recursive: true });
  await fs.writeFile(
    "assets/data/scores.json",
    JSON.stringify(out, null, 2),
    "utf8"
  );

  console.log("scores.json written");
}

main();
