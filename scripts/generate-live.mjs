import fs from "fs/promises";
import path from "path";

const OUT_DIR = path.posix.join("assets", "data");

function isoNow() {
  return new Date().toISOString();
}

/**
 * DEMO: scores.json
 * Schema used by app.js:
 * { meta:{updated}, matches:[{league, home, away, score, minute, status, url}] }
 */
function demoScores() {
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
      status: "LIVE",
      minute: Math.max(1, minute - 18),
      score: "2-1",
      url: "https://netthud.com/"
    },
    {
      league: "Bundesliga",
      home: "Bayern",
      away: "Dortmund",
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

/**
 * DEMO: upcoming.json
 * Schema used by app.js:
 * { meta:{updated}, games:[{time, league, home, away, venue, tv:[...], stream:[...]}] }
 */
function demoUpcoming() {
  const now = Date.now();
  const inHours = (h) => new Date(now + h * 3600_000).toISOString();

  return [
    {
      time: inHours(3),
      league: "Premier League",
      home: "Chelsea",
      away: "Tottenham",
      venue: "Stamford Bridge",
      tv: ["USA Network"],
      stream: ["Peacock"]
    },
    {
      time: inHours(6),
      league: "La Liga",
      home: "Atletico Madrid",
      away: "Sevilla",
      venue: "Cívitas Metropolitano",
      tv: ["ESPN Deportes"],
      stream: ["ESPN+"]
    },
    {
      time: inHours(9),
      league: "Serie A",
      home: "AC Milan",
      away: "Napoli",
      venue: "San Siro",
      tv: ["CBS Sports Network"],
      stream: ["Paramount+"]
    }
  ];
}

/**
 * DEMO: transfers.json
 * Schema used by app.js:
 * { meta:{updated}, items:[{player, from, to, fee, status, source, url, time}] }
 */
function demoTransfers() {
  const now = isoNow();

  return [
    {
      player: "Demo Player A",
      from: "Club X",
      to: "Club Y",
      fee: "€35m",
      status: "RUMOR",
      source: "Net Thud (demo)",
      url: "https://netthud.com/",
      time: now
    },
    {
      player: "Demo Player B",
      from: "Club M",
      to: "Club N",
      fee: "Loan",
      status: "ADVANCED",
      source: "Net Thud (demo)",
      url: "https://netthud.com/",
      time: now
    },
    {
      player: "Demo Player C",
      from: "Club Q",
      to: "Club R",
      fee: "Undisclosed",
      status: "DONE",
      source: "Net Thud (demo)",
      url: "https://netthud.com/",
      time: now
    }
  ];
}

async function writeJson(relPath, obj) {
  const fullPath = path.posix.join(relPath);
  await fs.writeFile(fullPath, JSON.stringify(obj, null, 2) + "\n", "utf8");
  return fullPath;
}

async function main() {
  // Ensure output directory exists
  await fs.mkdir(OUT_DIR, { recursive: true });

  const updated = isoNow();

  const scores = {
    meta: { updated, mode: "demo" },
    matches: demoScores()
  };

  const upcoming = {
    meta: { updated, mode: "demo" },
    games: demoUpcoming()
  };

  const transfers = {
    meta: { updated, mode: "demo" },
    items: demoTransfers()
  };

  const scoresPath = path.posix.join(OUT_DIR, "scores.json");
  const upcomingPath = path.posix.join(OUT_DIR, "upcoming.json");
  const transfersPath = path.posix.join(OUT_DIR, "transfers.json");

  await writeJson(scoresPath, scores);
  await writeJson(upcomingPath, upcoming);
  await writeJson(transfersPath, transfers);

  console.log(`Wrote: ${scoresPath} (${scores.matches.length} matches)`);
  console.log(`Wrote: ${upcomingPath} (${upcoming.games.length} games)`);
  console.log(`Wrote: ${transfersPath} (${transfers.items.length} items)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});