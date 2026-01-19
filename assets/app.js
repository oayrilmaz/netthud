/* Net Thud - app.js (clean, single-render, GitHub Pages friendly) */

const PATHS = {
  leagues: "assets/data/leagues.json",
  news: "assets/data/ai-news.json",
};

/* -----------------------------
   Helpers
------------------------------ */
function $(id) {
  return document.getElementById(id);
}

function safeText(v) {
  return (v ?? "").toString();
}

async function fetchJson(url) {
  // Force fresh on GitHub Pages / CDN
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

/* -----------------------------
   Leagues
------------------------------ */
async function loadLeagues() {
  const container = $("leagueChips");
  if (!container) return;

  try {
    const leagues = await fetchJson(PATHS.leagues);

    container.innerHTML = "";

    // Accept either: [{name:"..."}, ...] OR ["Premier League", ...]
    const normalized = Array.isArray(leagues)
      ? leagues.map((l) => (typeof l === "string" ? { name: l } : l))
      : [];

    normalized.forEach((l) => {
      const el = document.createElement("div");
      el.className = "chip";
      el.innerHTML = `<span class="miniDot"></span>${safeText(l.name)}`;
      container.appendChild(el);
    });
  } catch (err) {
    container.innerHTML = `
      <div class="item">
        <div>
          <strong>Leagues not loading</strong>
          <p>Expected <code>${PATHS.leagues}</code> (Error: ${safeText(
      err.message
    )})</p>
        </div>
        <span class="tag error">ERROR</span>
      </div>
    `;
    console.error(err);
  }
}

/* -----------------------------
   AI News
------------------------------ */
function renderNews(items, meta) {
  const newsList = $("newsList");
  const newsMeta = $("newsMeta");
  if (!newsList) return;

  newsList.innerHTML = "";

  const arr = Array.isArray(items) ? items : [];

  if (arr.length === 0) {
    newsList.innerHTML = `
      <div class="item">
        <div>
          <strong>No AI news yet</strong>
          <p>Add items into <code>${PATHS.news}</code>.</p>
        </div>
        <span class="tag track">EMPTY</span>
      </div>
    `;
    if (newsMeta) newsMeta.textContent = "0 items";
    return;
  }

  arr.slice(0, 12).forEach((n) => {
    const title = safeText(n.title || n.headline || "Update");
    const desc = safeText(n.summary || n.desc || n.description || "");
    const url = safeText(n.url || n.link || "");
    const src = safeText(n.source || "Net Thud AI feed");
    const time = safeText(n.time || n.published || n.date || "");

    const subtitleParts = [src, time].filter(Boolean).join(" • ");
    const subtitle = subtitleParts || "Net Thud AI feed";

    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div>
        <strong>${title}</strong>
        <p>${desc ? desc : subtitle}</p>
        ${
          url
            ? `<p style="margin-top:10px"><a class="pill" href="${url}" target="_blank" rel="noopener noreferrer">Open source →</a></p>`
            : ``
        }
      </div>
      <span class="tag live">NEW</span>
    `;
    newsList.appendChild(row);
  });

  const count = arr.length;
  const updated =
    safeText(meta?.updated) ||
    safeText(meta?.lastUpdated) ||
    safeText(meta?.generatedAt);

  if (newsMeta) {
    newsMeta.textContent = updated ? `${count} items • updated ${updated}` : `${count} items`;
  }
}

async function loadNews() {
  const newsList = $("newsList");
  const newsMeta = $("newsMeta");

  try {
    const data = await fetchJson(PATHS.news);

    // Accept either:
    // 1) { meta:{...}, items:[...] }
    // 2) [ ... ]
    const items = Array.isArray(data)
      ? data
      : data.items || data.news || data.articles || [];

    const meta = Array.isArray(data) ? null : data.meta || null;

    renderNews(items, meta);
  } catch (err) {
    if (newsList) {
      newsList.innerHTML = `
        <div class="item">
          <div>
            <strong>AI news not loading</strong>
            <p>Expected <code>${PATHS.news}</code> (Error: ${safeText(
        err.message
      )})</p>
          </div>
          <span class="tag error">ERROR</span>
        </div>
      `;
    }
    if (newsMeta) newsMeta.textContent = "error";
    console.error(err);
  }
}

/* -----------------------------
   Signals (render ONCE)
------------------------------ */
function loadSignalsOnce() {
  const signalsList = $("signalsList");
  const signalsList2 = $("signalsList2"); // If your HTML still has it, we clear it
  if (signalsList2) signalsList2.innerHTML = "";

  if (!signalsList) return;

  const signals = [
    {
      title: "Late Goal Heat",
      desc: "Leagues with the highest 75+ minute volatility today.",
      tag: "LIVE",
      kind: "live",
    },
    {
      title: "First Goal Impact",
      desc: "Where the opening goal most often decides the match.",
      tag: "MODEL",
      kind: "model",
    },
    {
      title: "Momentum Shifts",
      desc: "Goal timing and response — who collapses, who resets, who strikes again.",
      tag: "TRACK",
      kind: "track",
    },
  ];

  signalsList.innerHTML = "";
  signals.forEach((s) => {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div>
        <strong>${s.title}</strong>
        <p>${s.desc}</p>
      </div>
      <span class="tag ${s.kind}">${s.tag}</span>
    `;
    signalsList.appendChild(row);
  });
}

/* -----------------------------
   Boot
------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
  // Year
  const year = $("year");
  if (year) year.textContent = new Date().getFullYear();

  // Load dynamic JSON-backed sections
  loadLeagues();
  loadNews();

  // Render signals once (no triple)
  loadSignalsOnce();

  // Refresh AI news every 60s (still GitHub-backed, not true live)
  setInterval(loadNews, 60000);
});