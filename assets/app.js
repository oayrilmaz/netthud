/* NetThud app.js (static GitHub Pages) */

function qs(id) {
  return document.getElementById(id);
}

function esc(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function fmtUpdated(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace(".000Z", "Z");
}

/**
 * Fetch JSON with cache-busting.
 * Tries multiple paths (so your site survives file moves).
 */
async function fetchJson(paths) {
  const bust = `v=${Date.now()}`;
  let lastErr;

  for (const p of paths) {
    try {
      const url = p.includes("?") ? `${p}&${bust}` : `${p}?${bust}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Fetch failed");
}

/* ---------- SOUND (keeps your Sound ON toggle working) ---------- */

const SOUND_KEY = "netthud_sound";
let soundOn = true;
let crowdAudio = null;

function initSound() {
  const saved = localStorage.getItem(SOUND_KEY);
  soundOn = saved ? saved === "1" : true;

  const chip = qs("soundChip");
  if (chip) {
    chip.classList.toggle("on", soundOn);
    chip.textContent = `Sound: ${soundOn ? "ON" : "OFF"}`;
    chip.addEventListener("click", () => {
      soundOn = !soundOn;
      localStorage.setItem(SOUND_KEY, soundOn ? "1" : "0");
      chip.classList.toggle("on", soundOn);
      chip.textContent = `Sound: ${soundOn ? "ON" : "OFF"}`;
      if (soundOn) playCrowd();
      else stopCrowd();
    });
  }

  crowdAudio = new Audio("assets/audio/crowd.mp3");
  crowdAudio.loop = true;
  crowdAudio.volume = 0.25;

  if (soundOn) {
    // Safari/iOS requires user gesture to actually start audio — but we keep state.
  }
}

function playCrowd() {
  if (!crowdAudio) return;
  crowdAudio.play().catch(() => {
    // iOS may block autoplay until user interacts — no error UI needed
  });
}

function stopCrowd() {
  if (!crowdAudio) return;
  crowdAudio.pause();
  crowdAudio.currentTime = 0;
}

/* ---------- SECTION RENDER HELPERS ---------- */

function setSectionMeta(metaEl, text) {
  if (!metaEl) return;
  metaEl.textContent = text;
}

function setSectionError(container, message) {
  if (!container) return;
  container.innerHTML = `
    <div class="empty-card">
      <div class="empty-title">Not loading</div>
      <div class="empty-sub">${esc(message || "Data file missing.")}</div>
      <div class="pill warn">ERR</div>
    </div>
  `;
}

/* ---------- LEAGUES ---------- */

async function loadLeagues() {
  const container = qs("leagueChips");
  const meta = qs("leaguesMeta");
  if (!container) return;

  try {
    // Prefer assets path. Fallback to /leagues.json (old version).
    const data = await fetchJson([
      "assets/data/leagues.json",
      "/assets/data/leagues.json",
      "/leagues.json"
    ]);

    const leagues = Array.isArray(data) ? data : (data.items || []);
    const updatedAt = data.generatedAt || data.updatedAt || "";

    container.innerHTML = "";
    leagues.forEach((l) => {
      const el = document.createElement("div");
      el.className = "league-pill";
      el.innerHTML = `<span class="dot"></span>${esc(l.name || l)}`;
      container.appendChild(el);
    });

    setSectionMeta(meta, `${leagues.length} • updated ${fmtUpdated(updatedAt)}`);
  } catch (err) {
    setSectionMeta(meta, `error`);
    setSectionError(container, `Missing leagues.json (expected assets/data/leagues.json)`);
    console.error("Leagues load error:", err);
  }
}

/* ---------- FINAL SCORES (assets/data/scores.json) ---------- */

function renderScoresItem(it) {
  const title = `${it.home} ${it.score} ${it.away}`;
  const sub = `${it.league} • ${it.date || fmtDate(it.endedAt || it.utcDate || it.kickoff || it.generatedAt)}`;
  const badge = it.status || "FT";
  const url = it.url || it.matchUrl || "";

  return `
    <div class="card-row">
      <div class="card-main">
        <div class="card-title">${esc(title)}</div>
        <div class="card-sub">${esc(sub)}</div>
      </div>
      ${url ? `<a class="pill link" href="${esc(url)}" target="_blank" rel="noopener">OPEN</a>` : `<div class="pill ok">${esc(badge)}</div>`}
    </div>
  `;
}

async function loadScores() {
  const container = qs("scoresList");
  const meta = qs("scoresMeta");
  if (!container) return;

  try {
    const data = await fetchJson([
      "assets/data/scores.json",
      "/assets/data/scores.json",
      "/scores.json"
    ]);

    const items = data.items || [];
    const updatedAt = data.generatedAt || data.updatedAt || "";

    setSectionMeta(meta, `${items.length} • updated ${fmtUpdated(updatedAt)}`);

    if (!items.length) {
      container.innerHTML = `
        <div class="empty-card">
          <div class="empty-title">No final scores yet</div>
          <div class="empty-sub">Once scores.json is generated, it will show here.</div>
          <div class="pill ok">OK</div>
        </div>`;
      return;
    }

    container.innerHTML = items.map(renderScoresItem).join("");
  } catch (err) {
    setSectionMeta(meta, `error`);
    setSectionError(container, `Missing assets/data/scores.json`);
    console.error("Scores load error:", err);
  }
}

/* ---------- AI NEWS (assets/data/ai-news.json) ---------- */

function renderNewsItem(it) {
  const title = it.title || "News";
  const sub = `${it.source || ""}${it.publishedAt ? ` • ${fmtDate(it.publishedAt)}` : ""}`;
  const summary = it.summary || "";
  const url = it.url || "";

  return `
    <div class="card-row">
      <div class="card-main">
        <div class="card-title">${esc(title)}</div>
        <div class="card-sub">${esc(sub)}</div>
        ${summary ? `<div class="card-desc">${esc(summary)}</div>` : ""}
      </div>
      ${url ? `<a class="pill link" href="${esc(url)}" target="_blank" rel="noopener">OPEN</a>` : ""}
    </div>
  `;
}

async function loadAiNews() {
  const container = qs("aiNewsList");
  const meta = qs("aiNewsMeta");
  if (!container) return;

  try {
    const data = await fetchJson([
      "assets/data/ai-news.json",
      "/assets/data/ai-news.json",
      "/ai-news.json"
    ]);

    const items = data.items || [];
    const updatedAt = data.generatedAt || data.updatedAt || "";

    setSectionMeta(meta, `${items.length} • updated ${fmtUpdated(updatedAt)}`);

    if (!items.length) {
      container.innerHTML = `
        <div class="empty-card">
          <div class="empty-title">No news items yet</div>
          <div class="empty-sub">Once ai-news.json is generated, it will show here.</div>
          <div class="pill warn">EMPTY</div>
        </div>`;
      return;
    }

    container.innerHTML = items.slice(0, 12).map(renderNewsItem).join("");
  } catch (err) {
    setSectionMeta(meta, `error`);
    setSectionError(container, `Missing assets/data/ai-news.json`);
    console.error("AI news load error:", err);
  }
}

/* ---------- UPCOMING + TV (assets/data/upcoming.json) ---------- */

function renderUpcomingItem(it) {
  const title = `${it.home || it.match || "Match"}${it.away ? ` vs ${it.away}` : ""}`;
  const subParts = [];
  if (it.league) subParts.push(it.league);
  if (it.kickoff) subParts.push(it.kickoff);
  if (it.tv) subParts.push(it.tv);
  const sub = subParts.join(" • ");

  return `
    <div class="card-row">
      <div class="card-main">
        <div class="card-title">${esc(title)}</div>
        <div class="card-sub">${esc(sub)}</div>
      </div>
      <div class="pill ok">UP</div>
    </div>
  `;
}

async function loadUpcoming() {
  const container = qs("upcomingList");
  const meta = qs("upcomingMeta");
  if (!container) return;

  try {
    const data = await fetchJson([
      "assets/data/upcoming.json",
      "/assets/data/upcoming.json",
      "/upcoming.json"
    ]);

    const items = data.items || [];
    const updatedAt = data.generatedAt || data.updatedAt || "";

    setSectionMeta(meta, `${items.length} • updated ${fmtUpdated(updatedAt)}`);

    if (!items.length) {
      container.innerHTML = `
        <div class="empty-card">
          <div class="empty-title">No upcoming games yet</div>
          <div class="empty-sub">Populate assets/data/upcoming.json</div>
          <div class="pill warn">EMPTY</div>
        </div>`;
      return;
    }

    container.innerHTML = items.slice(0, 12).map(renderUpcomingItem).join("");
  } catch (err) {
    setSectionMeta(meta, `error`);
    setSectionError(container, `Missing assets/data/upcoming.json`);
    console.error("Upcoming load error:", err);
  }
}

/* ---------- TRANSFER DESK (assets/data/transfers.json) ---------- */

function renderTransferItem(it) {
  const title = it.title || `${it.player || "Player"} → ${it.to || "Club"}`;
  const sub = it.source ? `${it.source}${it.publishedAt ? ` • ${fmtDate(it.publishedAt)}` : ""}` : (it.publishedAt ? fmtDate(it.publishedAt) : "");
  const url = it.url || "";

  return `
    <div class="card-row">
      <div class="card-main">
        <div class="card-title">${esc(title)}</div>
        <div class="card-sub">${esc(sub)}</div>
        ${it.summary ? `<div class="card-desc">${esc(it.summary)}</div>` : ""}
      </div>
      ${url ? `<a class="pill link" href="${esc(url)}" target="_blank" rel="noopener">OPEN</a>` : `<div class="pill warn">NEW</div>`}
    </div>
  `;
}

async function loadTransfers() {
  const container = qs("transferList");
  const meta = qs("transferMeta");
  if (!container) return;

  try {
    const data = await fetchJson([
      "assets/data/transfers.json",
      "/assets/data/transfers.json",
      "/transfers.json"
    ]);

    const items = data.items || [];
    const updatedAt = data.generatedAt || data.updatedAt || "";

    setSectionMeta(meta, `${items.length} • updated ${fmtUpdated(updatedAt)}`);

    if (!items.length) {
      container.innerHTML = `
        <div class="empty-card">
          <div class="empty-title">No transfer items yet</div>
          <div class="empty-sub">Populate assets/data/transfers.json</div>
          <div class="pill warn">EMPTY</div>
        </div>`;
      return;
    }

    container.innerHTML = items.slice(0, 12).map(renderTransferItem).join("");
  } catch (err) {
    setSectionMeta(meta, `error`);
    setSectionError(container, `Missing assets/data/transfers.json`);
    console.error("Transfers load error:", err);
  }
}

/* ---------- INIT ---------- */

async function loadAll() {
  initSound();

  // Load everything independently (one failing won't break others)
  loadScores();
  loadUpcoming();
  loadTransfers();
  loadAiNews();
  loadLeagues();

  // Optional: periodic refresh for a static site
  // (Only refreshes if JSON files change in repo)
  setInterval(() => {
    loadScores();
    loadUpcoming();
    loadTransfers();
    loadAiNews();
    loadLeagues();
  }, 60_000);
}

document.addEventListener("DOMContentLoaded", loadAll);
