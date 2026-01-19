/* =========================================================
   Net Thud — app.js
   Lightweight, GitHub Pages–safe data loader
   ========================================================= */

/* -------------------------
   Utilities
-------------------------- */
function $(id) {
  return document.getElementById(id);
}

async function fetchJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${path}`);
  }
  return res.json();
}

/* =========================================================
   LEAGUES
   Source: /leagues.json (repo root)
   Expected format:
   [
     { "name": "Premier League" },
     { "name": "La Liga" }
   ]
   ========================================================= */
async function loadLeagues() {
  const container = $("leagueChips");
  if (!container) return;

  try {
    const leagues = await fetchJSON("/leagues.json");

    container.innerHTML = "";

    leagues.forEach(l => {
      const el = document.createElement("div");
      el.className = "league-pill";
      el.innerHTML = `
        <span class="dot"></span>
        <span>${l.name}</span>
      `;
      container.appendChild(el);
    });

  } catch (err) {
    console.error("Leagues error:", err);
    container.innerHTML = `
      <div class="error">
        Leagues not loading
      </div>
    `;
  }
}

/* =========================================================
   AI NEWS
   Source: /assets/data/ai-news.json
   Expected format:
   [
     {
       "title": "Late-goal volatility rising in 3 leagues",
       "source": "Net Thud AI feed",
       "status": "NEW"
     }
   ]
   ========================================================= */
async function loadAINews() {
  const container = $("aiNewsList");
  if (!container) return;

  try {
    const news = await fetchJSON("/assets/data/ai-news.json");

    container.innerHTML = "";

    news.forEach(item => {
      const el = document.createElement("div");
      el.className = "news-item";
      el.innerHTML = `
        <div class="news-title">${item.title}</div>
        <div class="news-meta">
          <span>${item.source || "Net Thud AI"}</span>
          ${item.status ? `<span class="badge">${item.status}</span>` : ""}
        </div>
      `;
      container.appendChild(el);
    });

  } catch (err) {
    console.error("AI News error:", err);
    container.innerHTML = `
      <div class="error">
        AI news not loading
      </div>
    `;
  }
}

/* =========================================================
   INIT
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  loadLeagues();
  loadAINews();
});