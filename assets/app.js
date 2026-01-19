// assets/app.js
(() => {
  const $ = (s, el = document) => el.querySelector(s);

  // ---------- Mobile menu ----------
  const burger = $("#burger");
  const mobileNav = $("#mobileNav");
  if (burger && mobileNav) {
    burger.addEventListener("click", () => {
      const open = mobileNav.classList.toggle("show");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    mobileNav.querySelectorAll("a").forEach(a =>
      a.addEventListener("click", () => {
        mobileNav.classList.remove("show");
        burger.setAttribute("aria-expanded", "false");
      })
    );
  }

  // ---------- Footer year ----------
  const year = $("#year");
  if (year) year.textContent = String(new Date().getFullYear());

  // ---------- Starter signals (until you have real data feeds) ----------
  const starterSignals = [
    { title: "Late Goal Heat", desc: "Leagues with the highest 75+ minute volatility today.", tag: "LIVE", kind: "green" },
    { title: "First Goal Impact", desc: "Where the opening goal most often decides the match.", tag: "MODEL", kind: "blue" },
    { title: "Momentum Shifts", desc: "Goal timing and response — who collapses, who resets, who strikes again.", tag: "gold" }
  ];

  function renderSignals(containerId, list) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = "";
    list.forEach(s => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `
        <div class="rowMain">
          <div class="rowTitle">${escapeHtml(s.title)}</div>
          <div class="rowSub">${escapeHtml(s.desc)}</div>
        </div>
        <div class="tag ${s.kind}">${escapeHtml(s.tag)}</div>
      `;
      el.appendChild(row);
    });
  }

  // Render ONLY ONCE where needed (no triple)
  renderSignals("signalBoard", starterSignals);
  renderSignals("signalsList", starterSignals);

  // ---------- JSON fetch helpers ----------
  function bust(url) {
    const u = new URL(url, window.location.origin);
    u.searchParams.set("v", String(Date.now()));
    return u.toString();
  }

  async function fetchJson(url) {
    const res = await fetch(bust(url), { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
  }

  // ---------- Load Leagues from /assets/data/leagues.json ----------
  async function loadLeagues() {
    const container = document.getElementById("leagueChips");
    const meta = document.getElementById("leaguesMeta");
    if (!container) return;

    try {
      const data = await fetchJson("/assets/data/leagues.json");

      // Accept either:
      // 1) [{name:"..."}, ...]
      // 2) { items:[{name:"..."}] }
      const leagues = Array.isArray(data) ? data : (data.items || []);
      container.innerHTML = "";

      leagues.forEach(l => {
        const name = typeof l === "string" ? l : (l.name || l.title || "");
        if (!name) return;

        const chip = document.createElement("div");
        chip.className = "chip";
        chip.innerHTML = `<span class="dot"></span>${escapeHtml(name)}`;
        container.appendChild(chip);
      });

      if (meta) meta.textContent = `${leagues.length} tracked`;
    } catch (err) {
      container.innerHTML = `<div class="row"><div class="rowMain"><div class="rowTitle">Leagues not loading</div><div class="rowSub">Expected: <code>/assets/data/leagues.json</code></div></div><div class="tag gold">ERROR</div></div>`;
      if (meta) meta.textContent = "error";
      console.error(err);
    }
  }

  // ---------- Load AI News from /assets/data/ai-news.json ----------
  async function loadNews() {
    const list = document.getElementById("newsList");
    const meta = document.getElementById("newsMeta");
    if (!list) return;

    try {
      const data = await fetchJson("/assets/data/ai-news.json");

      // Accept either:
      // 1) [{title, summary, url, time, source}, ...]
      // 2) { meta:{updated}, items:[...] }
      const items = Array.isArray(data) ? data : (data.items || []);
      const updated = Array.isArray(data) ? "" : (data.meta?.updated || data.meta?.generatedAt || "");

      list.innerHTML = "";

      if (!items.length) {
        list.innerHTML = `<div class="row"><div class="rowMain"><div class="rowTitle">No AI news yet</div><div class="rowSub">Add items into <code>/assets/data/ai-news.json</code></div></div><div class="tag">EMPTY</div></div>`;
        if (meta) meta.textContent = "0 items";
        return;
      }

      items.slice(0, 12).forEach(n => {
        const title = n.title || n.headline || "Update";
        const summary = n.summary || n.desc || n.description || "Net Thud AI feed";
        const url = n.url || n.link || "";
        const source = n.source || "";
        const time = n.time || n.date || n.published || "";

        const sub = [source, time].filter(Boolean).join(" • ") || summary;

        const row = document.createElement("div");
        row.className = "row";
        row.innerHTML = `
          <div class="rowMain">
            <div class="rowTitle">${escapeHtml(title)}</div>
            <div class="rowSub">${escapeHtml(sub)}</div>
            ${url ? `<div class="rowSub" style="margin-top:8px"><a class="link" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">Open source →</a></div>` : ``}
          </div>
          <div class="tag green">NEW</div>
        `;
        list.appendChild(row);
      });

      if (meta) meta.textContent = updated ? `${items.length} items • updated ${updated}` : `${items.length} items`;
    } catch (err) {
      list.innerHTML = `<div class="row"><div class="rowMain"><div class="rowTitle">AI news not loading</div><div class="rowSub">Expected: <code>/assets/data/ai-news.json</code></div></div><div class="tag gold">ERROR</div></div>`;
      if (meta) meta.textContent = "error";
      console.error(err);
    }
  }

  // ---------- Safe helpers ----------
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s => (
      { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[s]
    ));
  }
  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, "&quot;");
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadLeagues();
    loadNews();

    // optional refresh for news (still GitHub-backed, not real-time)
    setInterval(loadNews, 60000);
  });
})();