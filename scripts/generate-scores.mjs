import fs from "fs/promises";

async function main() {
  const out = {
    generatedAt: new Date().toISOString(),
    mode: "demo-final",
    items: [
      {
        league: "Premier League",
        home: "Arsenal",
        away: "Liverpool",
        status: "FT",
        score: "2-1",
        date: "2026-01-18"
      },
      {
        league: "La Liga",
        home: "Real Madrid",
        away: "Barcelona",
        status: "FT",
        score: "0-0",
        date: "2026-01-18"
      },
      {
        league: "Serie A",
        home: "Inter",
        away: "Juventus",
        status: "FT",
        score: "3-2",
        date: "2026-01-18"
      }
    ]
  };

  await fs.mkdir("assets/data", { recursive: true });
  await fs.writeFile(
    "assets/data/scores.json",
    JSON.stringify(out, null, 2),
    "utf8"
  );

  console.log("Final scores written");
}

main();