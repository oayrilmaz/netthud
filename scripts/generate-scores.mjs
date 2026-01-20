import fs from "node:fs";
import path from "node:path";

const OUT_PATH = path.resolve("assets/data/scores.json");

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const txt = fs.readFileSync(filePath, "utf8").trim();
    if (!txt) return fallback;
    return JSON.parse(txt);
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, filePath);
}

async function main() {
  const existing = readJsonSafe(OUT_PATH, { updated: null, matches: [] });

  const url = process.env.NETTHUD_SCORES_API_URL;
  if (!url) {
    console.log("Missing env: NETTHUD_SCORES_API_URL. Keeping existing scores.json (no-op).");
    writeJsonAtomic(OUT_PATH, existing);
    return;
  }

  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Scores API HTTP ${res.status}: ${raw}`);

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Scores API did not return valid JSON.");
  }

  // You can adapt this mapping to your API’s exact shape.
  // Expected final file shape:
  const out = {
    updated: new Date().toISOString(),
    matches: Array.isArray(data.matches) ? data.matches : (Array.isArray(data) ? data : []),
  };

  writeJsonAtomic(OUT_PATH, out);
  console.log(`Wrote ${out.matches.length} matches -> ${OUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});