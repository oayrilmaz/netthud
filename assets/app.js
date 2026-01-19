/* Net Thud - app.js (clean, JSON-driven, GitHub Pages friendly) */

const $ = (s, el = document) => el.querySelector(s);

const ENDPOINTS = {
  leagues:   "assets/data/leagues.json",
  aiNews:    "assets/data/ai-news.json",
  scores:    "assets/data/scores.json",
  upcoming:  "assets/data/upcoming.json",
  transfers: "assets/data/transfers.json",
};

// cache-bust so GitHub Pages updates show without hard refresh
function withBust(url) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${Date.now()}`;
}

async function fetchJson(url) {
  const res = await fetch(withBust(url), { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function itemHTML(title, subtitle, rightTag = "") {
  return `
    <div class="row">
      <div class="row-main">
        <div class="row-title">${title}</div>
        ${subtitle ? `<div class="row-sub">${subtitle}</div>` : ``}
      </div>
      ${rightTag ? `<div class="tag">${rightTag}</div>` : ``}
    </div>
  `;
}

/* ---------------------------
   Leagues
--------------------------- */
async function loadLeagues() {
  const container = $("#leagueChips");
  if (!container) return;

  try {
    const leagues = await fetchJson(ENDPOINTS.leagues);

    container.innerHTML = "";
    (leagues || []).forEach(l => {
      const name = typeof l === "string" ? l : (l?.name || "");
      if (!name) return;

      const el = document.createElement("div");
      el.className = "chip";
      el.innerHTML = `<span class="dot"></span>${escapeHtml(name)}`;
      container.appendChild(el);
    });

    setText("leaguesMeta", `${(leagues || []).length} tracked`);
    setText("statusLeagues", `Leagues: ${(leagues || []).length} loaded`);
  } catch (err) {
    container.innerHTML = `<div class="empty">Leagues not loading. Check <code>${ENDPOINTS.leagues}</code>.</div>`;
    setText("leaguesMeta", "error");
    setText("statusLeagues", "Leagues: error");
    console.error("Leagues error:", err);
  }
}

/* ---------------------------
   AI News
   Accepts:
   - [ {title, summary, url, source, time} ... ]
   - OR { meta:{updated}, items:[...] }
--------------------------- */
async function loadAiNews() {
  const list = $("#newsList");
  if (!list) return;

  try {
    const data = await fetchJson(ENDPOINTS.aiNews);
    const items = Array.isArray(data) ? data : (data.items || data.news || data.articles || []);
    const meta = Array.isArray(data) ? null : (data.meta || null);

    if (!items.length) {
      list.innerHTML = `<div class="empty">No AI news yet. Add items to <code>${ENDPOINTS.aiNews}</code>.</div>`;
      setText("newsMeta", "0 items");
      setText("statusNews", "AI News: 0");
      return;
    }

    list.innerHTML = items.slice(0, 12).map(n => {
      const title = escapeHtml(n.title || n.headline || "Update");
      const summary = escapeHtml(n.summary || n.description || n.desc || "");
      const source = escapeHtml(n.source || "Net Thud AI feed");
      const time = escapeHtml(n.time || n.published || n.date || "");
      const url = n.url || n.link || "";

      const subtitle = summary || [source, time].filter(Boolean).join(" • ");
      const open = url ? `<a class="mini-link" href="${url}" target="_blank" rel="noopener noreferrer">Open →</a>` : "";

      return `
        <div class="row">
          <div class="row-main">
            <div class="row-title">${title}</div>
            <div class="row-sub">${subtitle}</div>
            ${open ? `<div class="row-sub" style="margin-top:10px">${open}</div>` : ``}
          </div>
          <div class="tag">NEW</div>
        </div>
      `;
    }).join("");

    const updated = meta?.updated || meta?.generatedAt || meta?.lastUpdated || "";
    setText("newsMeta", updated ? `${items.length} items • updated ${updated}` : `${items.length} items`);
    setText("statusNews", `AI News: ${items.length}`);
  } catch (err) {
    list.innerHTML = `<div class="empty">AI news not loading. Check <code>${ENDPOINTS.aiNews}</code>.</div>`;
    setText("newsMeta", "error");
    setText("statusNews", "AI News: error");
    console.error("AI News error:", err);
  }
}

/* ---------------------------
   Scores / Upcoming / Transfers
   These will show once you add JSON files.
--------------------------- */
async function loadSimpleList(kind, metaId, listId, statusId) {
  const url = ENDPOINTS[kind];
  const list = document.getElementById(listId);
  if (!list) return;

  try {
    const data = await fetchJson(url);
    const items = Array.isArray(data) ? data : (data.items || []);
    const meta = Array.isArray(data) ? null : (data.meta || null);

    if (!items.length) {
      list.innerHTML = `<div class="empty">No data yet. Add <code>${url}</code>.</div>`;
      setText(metaId, "0 items");
      setText(statusId, `${cap(kind)}: 0`);
      return;
    }

    list.innerHTML = items.slice(0, 20).map(x => {
      const title = escapeHtml(x.title || x.match || x.headline || "Update");
      const sub = escapeHtml(x.subtitle || x.info || x.summary || "");
      const tag = escapeHtml(x.tag || x.status || "");
      return itemHTML(title, sub, tag);
    }).join("");

    const updated = meta?.updated || meta?.generatedAt || meta?.lastUpdated || "";
    setText(metaId, updated ? `${items.length} items • updated ${updated}` : `${items.length} items`);
    setText(statusId, `${cap(kind)}: ${items.length}`);
  } catch (err) {
    list.innerHTML = `<div class="empty">Not loading. Missing <code>${url}</code>?</div>`;
    setText(metaId, "error");
    setText(statusId, `${cap(kind)}: error`);
    console.error(`${kind} error:`, err);
  }
}

function cap(s) { return (s || "").charAt(0).toUpperCase() + (s || "").slice(1); }

/* ---------------------------
   Sound (iOS requires user gesture)
--------------------------- */
function setupSound() {
  const thud = $("#sfxThud");
  const crowd = $("#sfxCrowd");
  const toggle = $("#soundToggle");
  if (!toggle) return;

  let enabled = true;
  let armed = false;

  function label() {
    toggle.textContent = enabled ? "Sound: ON" : "Sound: OFF";
    toggle.setAttribute("aria-pressed", enabled ? "true" : "false");
  }

  async function playOnce() {
    if (!enabled || armed) return;
    if (!thud || !crowd) return;

    try {
      thud.volume = 0.85;
      crowd.volume = 0.55;

      thud.currentTime = 0;
      crowd.currentTime = 0;

      await thud.play();

      setTimeout(() => {
        crowd.play().catch(() => {});
        setTimeout(() => {
          crowd.pause(); crowd.currentTime = 0;
        }, 2200);
      }, 180);

      armed = true;
    } catch (e) {
      // if blocked, it will try again next user gesture
      armed = false;
    }
  }

  // first user gesture triggers audio
  ["pointerdown", "touchstart", "keydown"].forEach(evt => {
    window.addEventListener(evt, playOnce, { once: true, passive: true });
  });

  toggle.addEventListener("click", async () => {
    enabled = !enabled;
    label();

    if (!enabled) {
      if (thud) { thud.pause(); thud.currentTime = 0; }
      if (crowd) { crowd.pause(); crowd.currentTime = 0; }
    } else {
      armed = false;
      await playOnce();
    }
  });

  label();
}

/* ---------------------------
   Mobile menu
--------------------------- */
function setupMenu() {
  const btn = $("#menuBtn");
  const nav = $("#mobileNav");
  if (!btn || !nav) return;

  btn.addEventListener("click", () => {
    const open = nav.classList.toggle("show");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });

  nav.querySelectorAll("a").forEach(a => {
    a.addEventListener("click", () => nav.classList.remove("show"));
  });
}

/* ---------------------------
   Utils
--------------------------- */
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------------------------
   Boot
--------------------------- */
document.addEventListener("DOMContentLoaded", async () => {
  // footer year
  const y = $("#year");
  if (y) y.textContent = new Date().getFullYear();

  setupMenu();
  setupSound();

  await loadLeagues();
  await loadAiNews();

  // these will show once JSON files exist
  await loadSimpleList("scores", "scoresMeta", "scoresList", "statusScores");
  await loadSimpleList("upcoming", "upcomingMeta", "upcomingList", "statusScores");
  await loadSimpleList("transfers", "transfersMeta", "transfersList", "statusScores");

  // refresh periodically (still “static live” via JSON updates)
  setInterval(loadAiNews, 60000);
  setInterval(() => loadSimpleList("scores", "scoresMeta", "scoresList", "statusScores"), 30000);
});