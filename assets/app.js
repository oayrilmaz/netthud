/* =========================================================
   Net Thud - app.js (GitHub Pages friendly)
   - Loads AI news + Leagues from /assets/data/*.json
   - Prevents duplicate init / triple rendering
   ========================================================= */

(() => {
  // ---- Single-run guard (prevents double-execution if script is included twice)
  if (window.__NETTHUD_APP_BOOTED__) return;
  window.__NETTHUD_APP_BOOTED__ = true;

  const $ = (id) => document.getElementById(id);

  // -------------------------------
  // Render helpers
  // -------------------------------
  function setError(container, msg) {
    if (!container) return;
    container.innerHTML = `<div class="error">${msg}</div>`;
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // -------------------------------
  // Load Leagues
  // -------------------------------
  async function loadLeagues() {
    const container = $("leagueChips");
    if (!container) return;

    // clear first (prevents “triple view” if init accidentally happens again)
    container.innerHTML = "";

    try {
      // Your repo path (per screenshot)
      const res = await fetch("/assets/data/leagues.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`Leagues JSON not found: ${res.status}`);

      const leagues = await res.json();
      if (!Array.isArray(leagues)) throw new Error("Leagues JSON must be an array");

      if (leagues.length === 0) {
        setError(container, "No leagues in leagues.json");
        return;
      }

      leagues.forEach((l) => {
        const name = typeof l === "string" ? l : l?.name;
        if (!name) return;

        const el = document.createElement("div");
        el.className = "league-pill"; // keep your requested class name
        el.innerHTML = `<span class="dot"></span>${escapeHtml(name)}`;
        container.appendChild(el);
      });
    } catch (err) {
      console.error(err);
      setError(container, "Leagues not loading");
    }
  }

  // -------------------------------
  // Load AI News
  // -------------------------------
  async function loadAiNews() {
    const container = $("aiNews");
    if (!container) return;

    container.innerHTML = "";

    try {
      const res = await fetch("/assets/data/ai-news.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`AI news JSON not found: ${res.status}`);

      const items = await res.json();
      if (!Array.isArray(items)) throw new Error("ai-news.json must be an array");

      if (items.length === 0) {
        setError(container, "No AI news items yet");
        return;
      }

      items.slice(0, 10).forEach((n) => {
        const title = n?.title ?? "Untitled";
        const source = n?.source ?? "Net Thud AI feed";
        const url = n?.url ?? "";
        const badge = n?.badge ?? "NEW";

        const el = document.createElement("div");
        el.className = "card";

        const titleHtml = escapeHtml(title);
        const sourceHtml = escapeHtml(source);
        const badgeHtml = escapeHtml(badge);

        el.innerHTML = `
          <div class="row">
            <strong>${titleHtml}</strong>
            <span class="tag live">${badgeHtml}</span>
          </div>
          <div class="muted">${sourceHtml}</div>
        `;

        // Make clickable if url exists
        if (url) {
          const a = document.createElement("a");
          a.href = url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.className = "linkWrap";
          a.appendChild(el);
          container.appendChild(a);
        } else {
          container.appendChild(el);
        }
      });
    } catch (err) {
      console.error(err);
      setError(container, "AI news not loading");
    }
  }

  // -------------------------------
  // Init
  // -------------------------------
  document.addEventListener("DOMContentLoaded", async () => {
    await Promise.all([loadLeagues(), loadAiNews()]);
  });
})();