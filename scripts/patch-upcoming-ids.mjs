import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "assets", "data", "upcoming.json");

const raw = fs.readFileSync(file, "utf8");
const json = JSON.parse(raw);

if (!Array.isArray(json.items)) {
  console.error("upcoming.json has no items[]");
  process.exit(1);
}

json.items = json.items.map((it) => {
  const matchId = it?.matchId;
  if (matchId == null) return it;
  return { ...it, id: `upcoming:${matchId}` };
});

fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
console.log("Patched upcoming.json (added id: upcoming:<matchId>)");