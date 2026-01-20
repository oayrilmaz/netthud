// assets/app.js

const PATHS = {
  leagues: "assets/data/leagues.json",
  scores: "assets/data/scores.json",
  upcoming: "assets/data/upcoming.json",
  transfers: "assets/data/transfers.json",
  aiNews: "assets/data/ai-news.json",
};

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} not found (${res.status})`);
  return res.json();
}

function setUpdated(labelId, iso) {
  const el = document.getElementById(labelId);
  if (!el) return;
  el.textContent = iso ? new Date(iso).toISOString() : "—";
}

function renderEmpty(container, title, subtitle = "") {
  container.innerHTML = `
    <div class="card empty">
      <div class="card-title">${title}</div>
      ${subtitle ? `<div class="card-sub">${subtitle}</div>` : ""}
      <span class="badge">EMPTY</span>
    </div>
  `;
}

function renderError(container, msg) {
  container.innerHTML = `
    <div class="card error">
      <div class="card-title">Error</div>
      <div class="card-sub">${msg}</div>
      <span class="badge">ERR</span>
    </div>
  `;
}

async function loadLeagues() {
  const container = document.getElementById("leagueChips");
  if (!container) return;

  try {
    const leagues = await fetchJson(PATHS.leagues);
    container.innerHTML = "";

    (leagues || []).forEach((l) => {
      const el = document.createElement("div");
      el.className = "league-pill";
      el.innerHTML = `<span class="dot"></span>${l.name}`;
      container.appendChild(el);
    });

    // optional updated label if exists
    setUpdated("leaguesUpdatedAt", new Date().toISOString());
  } catch (err) {
    renderError(container, "Leagues not loading (check assets/data/leagues.json)");
    console.error(err);
  }
}

function renderScores(items) {
  const wrap = document.getElementById("scoresList");
  if (!wrap) return;

  if (!items || !items.length) {
    renderEmpty(wrap, "No final scores yet", "Matches will appear here once completed.");
    return;
  }

  wrap.innerHTML = "";
  items.forEach((m) => {
    const card = document.createElement("div");
    card.className = "match-card";
    card.innerHTML = `
      <div class="match-main">
        <div class="match-title">${m.home} ${m.score} ${m.away}</div>
        <div class="match-sub">${m.league} • ${m.date || ""}</div>
      </div>
      <div class="match-badge">FT</div>
    `;
    wrap.appendChild(card);
  });
}

async function loadScores() {
  try {
    const data = await fetchJson(PATHS.scores);
    setUpdated("scoresUpdatedAt", data.generatedAt);
    renderScores(data.items || []);
  } catch (e) {
    const wrap = document.getElementById("scoresList");
    if (wrap) renderError(wrap, `Scores not loading (${PATHS.scores})`);
    console.error(e);
  }
}

function renderUpcoming(items) {
  const wrap = document.getElementById("upcomingList");
  if (!wrap) return;

  if (!items || !items.length) {
    renderEmpty(wrap, "No upcoming games yet", "Populate assets/data/upcoming.json");
    return;
  }

  wrap.innerHTML = "";
  items.forEach((m) => {
    const card = document.createElement("div");
    card.className = "match-card";
    card.innerHTML = `
      <div class="match-main">
        <div class="match-title">${m.home} vs ${m.away}</div>
        <div class="match-sub">${m.league} • ${m.timeLocal || m.timeUTC || ""}${m.tv ? ` • ${m.tv}` : ""}</div>
      </div>
      <div class="match-badge">UP</div>
    `;
    wrap.appendChild(card);
  });
}

async function loadUpcoming() {
  try {
    const data = await fetchJson(PATHS.upcoming);
    setUpdated("upcomingUpdatedAt", data.generatedAt);
    renderUpcoming(data.items || []);
  } catch (e) {
    const wrap = document.getElementById("upcomingList");
    if (wrap) renderError(wrap, `Upcoming not loading (${PATHS.upcoming})`);
    console.error(e);
  }
}

function renderAiNews(items) {
  const wrap = document.getElementById("aiNewsList");
  if (!wrap) return;

  if (!items || !items.length) {
    renderEmpty(wrap, "No AI items yet", "Once OpenAI writes ai-news.json, it will show here.");
    return;
  }

  wrap.innerHTML = "";
  items.forEach((n) => {
    const card = document.createElement("div");
    card.className = "news-card";
    card.innerHTML = `
      <div class="news-main">
        <div class="news-title">${n.title}</div>
        <div class="news-sub">${n.league} • ${n.category === "watch" ? "Watch" : "Signal"}</div>
        <div class="news-summary">${n.summary}</div>
        ${
          Array.isArray(n.evidence) && n.evidence.length
            ? `<div class="news-evidence">${n.evidence.map((x) => `<span>${x}</span>`).join("")}</div>`
            : ""
        }
      </div>
      <a class="news-btn" href="${n.url || "https://netthud.com/"}" target="_blank" rel="noreferrer">OPEN</a>
    `;
    wrap.appendChild(card);
  });
}

async function loadAiNews() {
  try {
    const data = await fetchJson(PATHS.aiNews);
    setUpdated("aiNewsUpdatedAt", data.generatedAt);
    renderAiNews(data.items || []);
  } catch (e) {
    const wrap = document.getElementById("aiNewsList");
    if (wrap) renderError(wrap, `AI news not loading (${PATHS.aiNews})`);
    console.error(e);
  }
}

function renderTransfers(items) {
  const wrap = document.getElementById("transfersList");
  if (!wrap) return;

  if (!items || !items.length) {
    renderEmpty(wrap, "No transfer items yet", "Populate assets/data/transfers.json");
    return;
  }

  wrap.innerHTML = "";
  items.forEach((t) => {
    const card = document.createElement("div");
    card.className = "news-card";
    card.innerHTML = `
      <div class="news-main">
        <div class="news-title">${t.title}</div>
        <div class="news-summary">${t.summary || ""}</div>
      </div>
      <a class="news-btn" href="${t.url || "https://netthud.com/"}" target="_blank" rel="noreferrer">OPEN</a>
    `;
    wrap.appendChild(card);
  });
}

async function loadTransfers() {
  try {
    const data = await fetchJson(PATHS.transfers);
    setUpdated("transfersUpdatedAt", data.generatedAt);
    renderTransfers(data.items || []);
  } catch (e) {
    const wrap = document.getElementById("transfersList");
    if (wrap) renderEmpty(wrap, "No transfer items yet", "Populate assets/data/transfers.json");
    console.error(e);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await Promise.allSettled([loadLeagues(), loadScores(), loadUpcoming(), loadTransfers(), loadAiNews()]);
});
