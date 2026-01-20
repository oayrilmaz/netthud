import fs from "node:fs";
import path from "node:path";

const OUT_PATH = path.join("assets", "data", "scores.json");

async function main() {
  const url = process.env.NETTHUD_SCORES_API_URL;

  let out = {
    updated: new Date().toISOString(),
    items: [],
  };

  try {
    if (!url) {
      console.log("NETTHUD_SCORES_API_URL missing. Writing empty scores.json (valid).");
    } else {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Scores API HTTP ${res.status}`);
      const data = await res.json();

      // Expecting data.items array; fallback safely
      const items = Array.isArray(data?.items) ? data.items : [];
      out.items = items;
      out.updated = new Date().toISOString();
    }
  } catch (e) {
    console.error("Scores generation failed, writing empty valid scores.json:", e?.message || e);
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Wrote ${out.items.length} items to ${OUT_PATH}`);
}

main();