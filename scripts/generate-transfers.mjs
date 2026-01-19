import fs from "fs/promises";

async function main() {
  const now = new Date();
  const n = now.getUTCMinutes() % 5;

  const items = [
    { player: "Forward X", from: "Club A", to: "Club B", fee: n % 2 ? "€45m" : "loan", status: "rumor", publishedAt: now.toISOString(), url: "https://netthud.com/" },
    { player: "Midfielder Y", from: "Club C", to: "Club D", fee: "€18m", status: "advanced", publishedAt: now.toISOString(), url: "https://netthud.com/" },
  ];

  const out = {
    generatedAt: now.toISOString(),
    mode: "demo",
    items,
  };

  await fs.mkdir("assets/data", { recursive: true });
  await fs.writeFile("assets/data/transfers.json", JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Wrote assets/data/transfers.json with ${items.length} items`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});