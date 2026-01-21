// scripts/generate-transfers.mjs
// Generates: assets/data/transfers.json
//
// Default mode: "demo" (no external API needed).
// Output schema now matches Format A:
//   { player, from, to, fee, status, publishedAt, url }
//
// Env (optional):
//   NETTHUD_TRANSFERS_MODE=demo
//   NETTHUD_TRANSFERS_URL=https://...   (future use)
//   NETTHUD_TRANSFERS_ITEMS=8
//   NETTHUD_SITE_URL=https://netthud.com/

import fs from "node:fs";
import path from "node:path";

function env(name, fallback = "") {
  const v = process.env[name];
  return v == null || v === "" ? fallback : v;
}

function isoNow(d = new Date()) {
  return d.toISOString();
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

function minutesAgo(mins) {
  const d = new Date(Date.now() - mins * 60_000);
  return isoNow(d);
}

// Demo pool in "A" format: Player: From → To (fee)
function buildDemoItems(count, siteUrl) {
  const pool = [
    { player: "Midfielder Y", from: "Club C", to: "Club D", fee: "€18m", status: "advanced" },
    { player: "Winger Z",     from: "Club F", to: "Club G", fee: "€32m", status: "advanced" },
    { player: "Fullback R",   from: "Club H", to: "Club I", fee: "€9m",  status: "contact"  },
    { player: "Forward X",    from: "Club A", to: "Club B", fee: "loan", status: "rumor"    },
    { player: "Striker K",    from: "Club J", to: "Club L", fee: "€45m", status: "rumor"    },
    { player: "Goalkeeper Q", from: "Club M", to: "Club N", fee: "€12m", status: "watch"    },
    { player: "Playmaker P",  from: "Club O", to: "Club P", fee: "€25m", status: "watch"    },
    { player: "Defender S",   from: "Club T", to: "Club U", fee: "loan", status: "contact"  },
  ];

  // rotate by minute so it changes each run
  const rot = new Date().getUTCMinutes() % pool.length;
  const rotated = pool.slice(rot).concat(pool.slice(0, rot));
  const take = rotated.slice(0, Math.max(2, Math.min(count, rotated.length)));

  // stagger timestamps
  return take.map((x, i) => ({
    player: x.player,
    from: x.from,
    to: x.to,
    fee: x.fee,
    status: x.status, // rumor/contact/advanced/watch etc.
    publishedAt: minutesAgo(30 + i * 25),
    url: siteUrl || "https://netthud.com/",
  }));
}

async function main() {
  const mode = env("NETTHUD_TRANSFERS_MODE", "demo").toLowerCase();
  const siteUrl = env("NETTHUD_SITE_URL", "https://netthud.com/");
  const itemsCount = clampInt(env("NETTHUD_TRANSFERS_ITEMS", "8"), 2, 20);

  const outFile = path.join(process.cwd(), "assets", "data", "transfers.json");

  let items = [];

  if (mode === "demo") {
    items = buildDemoItems(itemsCount, siteUrl);
  } else {
    // Future extension: fetch + parse a real source
    throw new Error(`Unsupported NETTHUD_TRANSFERS_MODE="${mode}". Use "demo" for now.`);
  }

  const payload = {
    generatedAt: isoNow(),
    mode,
    items,
  };

  writeJson(outFile, payload);
  console.log(`Wrote ${outFile} (${items.length} items)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});