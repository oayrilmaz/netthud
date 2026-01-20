// scripts/generate-scores.mjs
import fs from "fs";
import path from "path";

const OUT_PATH = path.join("assets", "data", "scores.json");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
}

const url = requireEnv("NETTHUD_SCORES_API_URL");
const apiKey = process.env.NETTHUD_API_KEY || "";

(async () => {
  const res = await fetch(url, {
    headers: apiKey ? { "Authorization": `Bearer ${apiKey}` } : {}
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Scores API HTTP ${res.status}: ${txt}`);
  }

  const data = await res.json();
  const now = new Date().toISOString();

  // Store whatever your API returns, plus updatedAt wrapper
  writeJson(OUT_PATH, {
    updatedAt: now,
    items: data
  });

  console.log(`Wrote scores -> ${OUT_PATH}`);
})();