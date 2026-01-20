import fs from "fs/promises";

const signals = [
  {
    title: "Late-goal pressure increased",
    description: "Matches decided by a single goal show elevated late-phase volatility.",
    confidence: 0.71,
    generatedBy: "NetThud AI"
  },
  {
    title: "Home advantage confirmed",
    description: "Home teams won 67% of completed fixtures today.",
    confidence: 0.64,
    generatedBy: "NetThud AI"
  }
];

async function main() {
  const out = {
    generatedAt: new Date().toISOString(),
    items: signals
  };

  await fs.mkdir("assets/data", { recursive: true });
  await fs.writeFile(
    "assets/data/signals.json",
    JSON.stringify(out, null, 2),
    "utf8"
  );

  console.log("signals.json written");
}

main();
