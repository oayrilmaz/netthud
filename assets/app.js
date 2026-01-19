/* Net Thud — app.js
   - Loads leagues from /leagues.json (repo root)
   - Loads AI news from /assets/data/ai-news.json
   - Prevents duplicate rendering (triple sections) by rendering into ONE target container
*/

(() => {
  "use strict";

  // -----------------------
  // Helpers
  // -----------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function withCacheBust(path) {
    // Helps GitHub Pages show updated JSON quickly
    const url = new URL(path, window.location.origin);
    url.searchParams.set("v", String(Date.now()));
    return url.toString();
  }

  async function fetchJson(path) {
    const res = await fetch(withCacheBust(path), { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
    return await res.json();
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderError(container, title, detail) {
    if (!container) return;
    container.innerHTML = `
      <div class="signal" style="border-color: rgba(255,211,90,.25);">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <p>${escapeHtml(detail)}</p>
        </div>
        <span class="tag track">ERROR</span>
      </div>
    `;
  }

  // Render into ONE container (first found), clear the rest to avoid duplicates
  function pickPrimaryContainer(ids) {
    const els = ids.map(id => document.getElementById(id)).filter(Boolean);
    if (!els.length) return { primary: null, others: [] };
    return { primary: els[0], others: els.slice(1) };
  }

  // -----------------------
  // Mobile menu (optional)
  // -----------------------
  function initMobileMenu() {
    const burger = $("#burger");
    const mobileNav = $("#mobileNav");
    if (!burger || !mobileNav) return;

    burger.addEventListener("click", () => {
      const open = mobileNav.classList.toggle("show");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });

    $$("#mobileNav a").forEach(a => {
      a.addEventListener("click", () => {
        mobileNav.classList.remove("show");
        burger.setAttribute("aria-expanded", "false");
      });
    });
  }

  // -----------------------
  // Leagues
  // -----------------------
  async function loadLeagues() {
    const container = document.getElementById("leagueChips");
    if (!container) return;

    try {
      // IMPORTANT: your leagues.json is at repo root (as your screenshot shows)
      const leagues = await fetchJson("leagues.json");

      container.innerHTML = "";

      leagues.forEach(l => {
        const name = typeof l === "string" ? l : (l?.name ?? "");
        if (!name) return;

        const el = document.createElement("div");
        // Use whichever class your CSS expects.
        // If your CSS uses ".chip", keep it. If it uses ".league-pill", keep that.
        el.className = container.classList.contains("chips") ? "chip" : "league-pill";
        el.innerHTML = `<span class="miniDot dot"></span>${escapeHtml(name)}`;
        container.appendChild(el);
      });

    } catch (err) {
      console.error("Leagues load error:", err);
      container.innerHTML = `<div class="error">Leagues not loading. Check that <strong>leagues.json</strong> is at repo root.</div>`;
    }
  }

  // -----------------------
  // AI News
  // -----------------------
  async function loadAiNews() {
    // Create or use an existing container in your HTML with id="aiNewsList"
    const container = document.getElementById("aiNewsList");
    if (!container) return;

    try {
      // Your screenshot shows: assets/data/ai-news.json
      const data = await fetchJson("assets/data/ai-news.json");

      // Accept either: { items:[...] } OR [...]
      const items = Array.isArray(data) ? data : (data.items || data.news || []);

      container.innerHTML = "";

      if (!items.length) {
        container.innerHTML = `<div class="card"><p style="margin:0;color:var(--muted2)">No AI news items yet.</p></div>`;
        return;
      }

      items.slice(0, 6).forEach(item => {
        const title = item.title || item.headline || "Update";
        const source = item.source || "Net Thud AI feed";
        const url = item.url || item.link || "";
        const tag = item.tag || "NEW";

        const wrap = document.createElement("div");
        wrap.className = "signal";

        wrap.innerHTML = `
          <div>
            <strong>${escapeHtml(title)}</strong>
            <p>${escapeHtml(source)}</p>
          </div>
          <span class="tag live">${escapeHtml(tag)}</span>
        `;

        if (url) {
          wrap.style.cursor = "pointer";
          wrap.addEventListener("click", () => window.open(url, "_blank", "noopener,noreferrer"));
        }

        container.appendChild(wrap);
      });

    } catch (err) {
      console.error("AI news load error:", err);
      renderError(container, "AI news not loading", "Check that assets/data/ai-news.json exists and is published by GitHub Pages.");
    }
  }

  // -----------------------
  // Signals (prevents triples)
  // -----------------------
  function renderSignalsOnce() {
    // Your page had multiple signal containers (e.g., signalsList, signalsList2, miniBoard).
    // We render into ONE primary container and clear the rest to prevent duplicates.
    const { primary, others } = pickPrimaryContainer(["signalsList", "signalsList2"]);
    if (!primary) return;

    // Clear duplicates
    others.forEach(el => (el.innerHTML = ""));

    // If you later add a real JSON feed, replace this with fetchJson("assets/data/signals.json")
    const signals = [
      { title: "Late Goal Heat", desc: "Leagues with the highest 75+ minute volatility today.", tag: "LIVE", kind: "live" },
      { title: "First Goal Impact", desc: "Where the opening goal most often decides the match.", tag: "MODEL", kind: "model" },
      { title: "Momentum Shifts", desc: "Goal timing and response — who collapses, who resets, who strikes again.", tag: "TRACK", kind: "track" }
    ];

    primary.innerHTML = "";
    signals.forEach(s => {
      const row = document.createElement("div");
      row.className = "signal";
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(s.title)}</strong>
          <p>${escapeHtml(s.desc)}</p>
        </div>
        <span class="tag ${escapeHtml(s.kind)}">${escapeHtml(s.tag)}</span>
      `;
      primary.appendChild(row);
    });

    // Mini board (render once)
    const mini = document.getElementById("miniBoard");
    if (mini) {
      mini.innerHTML = "";
      signals.forEach(s => {
        const row = document.createElement("div");
        row.className = "miniItem";
        row.innerHTML = `
          <div>
            <strong>${escapeHtml(s.title)}</strong>
            <span>${escapeHtml(s.desc)}</span>
          </div>
          <span class="tag ${escapeHtml(s.kind)}">${escapeHtml(s.tag)}</span>
        `;
        mini.appendChild(row);
      });
    }
  }

  // -----------------------
  // Footer year
  // -----------------------
  function setYear() {
    const year = document.getElementById("year");
    if (year) year.textContent = new Date().getFullYear();
  }

  // -----------------------
  // Boot
  // -----------------------
  document.addEventListener("DOMContentLoaded", async () => {
    initMobileMenu();
    setYear();

    // Load dynamic content
    renderSignalsOnce();
    await loadLeagues();
    await loadAiNews();
  });

})();