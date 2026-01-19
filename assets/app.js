(() => {
  const $ = (s, el=document) => el.querySelector(s);

  // -----------------------------
  // Paths (match your repo)
  // -----------------------------
  const PATHS = {
    scores:   "assets/data/scores.json",
    upcoming: "assets/data/upcoming.json",
    transfers:"assets/data/transfers.json",
    news:     "assets/data/ai-news.json",
    leagues:  "assets/data/leagues.json",
  };

  // -----------------------------
  // UI helpers
  // -----------------------------
  function setYear(){
    const y = $("#year");
    if (y) y.textContent = new Date().getFullYear();
  }

  function showEmpty(listEl, title, subtitle, badgeText="SOON", badgeKind="info"){
    if (!listEl) return;
    listEl.innerHTML = `
      <div class="row">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <div class="sub">${escapeHtml(subtitle)}</div>
        </div>
        <span class="badge ${badgeKind}">${escapeHtml(badgeText)}</span>
      </div>
    `;
  }

  function renderRows(listEl, rowsHtml){
    if (!listEl) return;
    listEl.innerHTML = rowsHtml.join("");
  }

  function escapeHtml(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  async function fetchJson(url){
    // Important: avoid “sticky cache” on iOS + GH Pages
    const res = await fetch(url, { cache: "no-store" });

    // If file doesn’t exist yet, return null (NOT an error UI)
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status} loading ${url}`);
    return await res.json();
  }

  function fmtTime(iso){
    if (!iso) return "";
    try{
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso);
      return d.toLocaleString(undefined, { weekday:"short", hour:"2-digit", minute:"2-digit", month:"short", day:"numeric" });
    }catch{
      return String(iso);
    }
  }

  // -----------------------------
  // Burger / mobile nav
  // -----------------------------
  function setupMobileNav(){
    const burger = $("#burger");
    const mobileNav = $("#mobileNav");
    if (!burger || !mobileNav) return;

    burger.addEventListener("click", () => {
      const open = mobileNav.classList.toggle("show");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });

    mobileNav.querySelectorAll("a").forEach(a => {
      a.addEventListener("click", () => {
        mobileNav.classList.remove("show");
        burger.setAttribute("aria-expanded", "false");
      });
    });
  }

  // -----------------------------
  // SOUND (thud then crowd)
  // -----------------------------
  function setupSound(){
    const thud = $("#sfxThud");
    const crowd = $("#sfxCrowd");
    const toggle = $("#soundToggle");
    const label = $("#soundLabel");

    if (!toggle || !label) return;

    let enabled = true;
    let playedOnce = false;

    function setUI(){
      toggle.classList.toggle("off", !enabled);
      toggle.setAttribute("aria-pressed", enabled ? "true" : "false");
      label.textContent = enabled ? "Sound: ON" : "Sound: OFF";
    }

    function stopAll(){
      [thud, crowd].forEach(a => {
        if (!a) return;
        a.pause();
        a.currentTime = 0;
      });
    }

    async function playVibe(){
      if (!enabled || playedOnce) return;
      if (!thud || !crowd) return;

      try{
        thud.volume = 0.85;
        crowd.volume = 0.55;

        thud.currentTime = 0;
        crowd.currentTime = 0;

        await thud.play();
        setTimeout(() => {
          crowd.play().catch(()=>{});
          setTimeout(() => { crowd.pause(); crowd.currentTime = 0; }, 2200);
        }, 160);

        playedOnce = true;
      }catch{
        // autoplay restrictions can block until interaction
        playedOnce = false;
      }
    }

    ["pointerdown","touchstart","keydown","wheel"].forEach(evt => {
      window.addEventListener(evt, playVibe, { once:true, passive:true });
    });

    toggle.addEventListener("click", async () => {
      enabled = !enabled;
      setUI();
      if (!enabled) stopAll();
      else await playVibe();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopAll();
    });

    setUI();
  }

  // -----------------------------
  // LEAGUES
  // expects: { meta:{updated}, items:[{name, id?}] } OR just [{name}]
  // -----------------------------
  async function loadLeagues(){
    const chips = $("#leagueChips");
    const meta = $("#leaguesMeta");
    if (!chips) return;

    chips.innerHTML = "";
    if (meta) meta.textContent = "loading…";

    const data = await fetchJson(PATHS.leagues);
    if (!data){
      showEmpty(chips, "Leagues feed not published yet", `Create ${PATHS.leagues} in your repo.`, "SOON", "info");
      if (meta) meta.textContent = "not published";
      return;
    }

    const items = Array.isArray(data) ? data : (data.items || []);
    const updated = Array.isArray(data) ? "" : (data.meta?.updated || data.meta?.generatedAt || "");

    if (!items.length){
      showEmpty(chips, "No leagues yet", "Add items into leagues.json", "EMPTY", "warn");
      if (meta) meta.textContent = "0";
      return;
    }

    chips.innerHTML = items.map(l => {
      const name = escapeHtml(l.name || l);
      return `<span class="chip"><i></i>${name}</span>`;
    }).join("");

    if (meta) meta.textContent = updated ? `${items.length} • updated ${updated}` : `${items.length} tracked`;
  }

  // -----------------------------
  // AI NEWS
  // expects: { meta:{updated}, items:[{title, summary, url, source, time}] } OR just [{...}]
  // -----------------------------
  async function loadNews(){
    const list = $("#newsList");
    const meta = $("#newsMeta");
    if (!list) return;

    showEmpty(list, "Loading AI news…", `Fetching ${PATHS.news}`, "LIVE", "live");
    if (meta) meta.textContent = "loading…";

    const data = await fetchJson(PATHS.news);
    if (!data){
      showEmpty(list, "AI news not published yet", `Create ${PATHS.news} in your repo.`, "SOON", "info");
      if (meta) meta.textContent = "not published";
      return;
    }

    const items = Array.isArray(data) ? data : (data.items || []);
    const updated = Array.isArray(data) ? "" : (data.meta?.updated || data.meta?.generatedAt || "");

    if (!items.length){
      showEmpty(list, "No AI news yet", "Your feed file exists, but has 0 items.", "EMPTY", "warn");
      if (meta) meta.textContent = "0";
      return;
    }

    const rows = items.slice(0, 12).map(n => {
      const title = escapeHtml(n.title || n.headline || "Update");
      const summary = escapeHtml(n.summary || n.description || "");
      const source = escapeHtml(n.source || "Net Thud AI feed");
      const time = escapeHtml(n.time || n.published || "");
      const url = (n.url || n.link) ? String(n.url || n.link) : "";
      const sub = [source, time].filter(Boolean).join(" • ");

      return `
        <div class="row">
          <div>
            <strong>${title}</strong>
            <div class="sub">${summary || sub}</div>
            ${url ? `<div class="sub" style="margin-top:10px;"><a class="chipBtn" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open source →</a></div>` : ``}
          </div>
          <span class="badge live">NEW</span>
        </div>
      `;
    });

    renderRows(list, rows);
    if (meta) meta.textContent = updated ? `${items.length} • updated ${updated}` : `${items.length} items`;
  }

  // -----------------------------
  // LIVE SCORES
  // expects: { meta:{updated}, matches:[{league, home, away, score, minute, status, url?}] }
  // -----------------------------
  async function loadScores(){
    const list = $("#scoresList");
    const meta = $("#scoresMeta");
    if (!list) return;

    showEmpty(list, "Loading live scores…", `Fetching ${PATHS.scores}`, "LIVE", "live");
    if (meta) meta.textContent = "loading…";

    const data = await fetchJson(PATHS.scores);
    if (!data){
      showEmpty(list, "Live scores not published yet", `Create ${PATHS.scores} (your workflow should generate it).`, "SOON", "info");
      if (meta) meta.textContent = "not published";
      return;
    }

    const matches = data.matches || data.items || [];
    const updated = data.meta?.updated || data.meta?.generatedAt || "";

    if (!matches.length){
      showEmpty(list, "No live matches right now", "When matches are live, they’ll appear here.", "OK", "info");
      if (meta) meta.textContent = updated ? `updated ${updated}` : "none live";
      return;
    }

    const rows = matches.slice(0, 20).map(m => {
      const league = escapeHtml(m.league || "");
      const home = escapeHtml(m.home || m.homeTeam || "");
      const away = escapeHtml(m.away || m.awayTeam || "");
      const score = escapeHtml(m.score || "");
      const minute = escapeHtml(m.minute || "");
      const status = escapeHtml(m.status || "LIVE");

      const left = [league].filter(Boolean).join(" • ");
      const line = `${home} vs ${away}`;
      const sub = [left, minute ? `${minute}'` : "", status].filter(Boolean).join(" • ");

      return `
        <div class="row">
          <div>
            <strong>${line}</strong>
            <div class="sub">${sub}</div>
          </div>
          <span class="badge live">${score || "LIVE"}</span>
        </div>
      `;
    });

    renderRows(list, rows);
    if (meta) meta.textContent = updated ? `updated ${updated}` : `${matches.length} live`;
  }

  // -----------------------------
  // UPCOMING + TV
  // expects: { meta:{updated}, games:[{time, league, home, away, venue, tv:[...], stream:[...]}] }
  // -----------------------------
  async function loadUpcoming(){
    const list = $("#upcomingList");
    const meta = $("#upcomingMeta");
    if (!list) return;

    showEmpty(list, "Loading upcoming games…", `Fetching ${PATHS.upcoming}`, "LIVE", "live");
    if (meta) meta.textContent = "loading…";

    const data = await fetchJson(PATHS.upcoming);
    if (!data){
      showEmpty(list, "Upcoming schedule not published yet", `Create ${PATHS.upcoming} (generated by workflow).`, "SOON", "info");
      if (meta) meta.textContent = "not published";
      return;
    }

    const games = data.games || data.items || [];
    const updated = data.meta?.updated || data.meta?.generatedAt || "";

    if (!games.length){
      showEmpty(list, "No upcoming games in the feed", "Once your generator writes upcoming.json, it will show here.", "EMPTY", "warn");
      if (meta) meta.textContent = updated ? `updated ${updated}` : "0";
      return;
    }

    const rows = games.slice(0, 20).map(g => {
      const t = fmtTime(g.time || g.kickoff);
      const league = escapeHtml(g.league || "");
      const home = escapeHtml(g.home || "");
      const away = escapeHtml(g.away || "");
      const venue = escapeHtml(g.venue || "");
      const tv = Array.isArray(g.tv) ? g.tv : (g.tv ? [g.tv] : []);
      const stream = Array.isArray(g.stream) ? g.stream : (g.stream ? [g.stream] : []);

      const title = `${home} vs ${away}`;
      const subParts = [
        t,
        league,
        venue ? `@ ${venue}` : ""
      ].filter(Boolean);

      const tvLine = [...tv, ...stream].filter(Boolean).join(", ");
      const sub2 = tvLine ? `TV/Stream: ${escapeHtml(tvLine)}` : "TV/Stream: (feed will add channels here)";

      return `
        <div class="row">
          <div>
            <strong>${escapeHtml(title)}</strong>
            <div class="sub">${escapeHtml(subParts.join(" • "))}</div>
            <div class="sub" style="margin-top:6px;">${sub2}</div>
          </div>
          <span class="badge info">NEXT</span>
        </div>
      `;
    });

    renderRows(list, rows);
    if (meta) meta.textContent = updated ? `updated ${updated}` : `${games.length} upcoming`;
  }

  // -----------------------------
  // TRANSFERS
  // expects: { meta:{updated}, items:[{player, from, to, fee, status, source, url, time}] }
  // -----------------------------
  async function loadTransfers(){
    const list = $("#transfersList");
    const meta = $("#transfersMeta");
    if (!list) return;

    showEmpty(list, "Loading transfer desk…", `Fetching ${PATHS.transfers}`, "LIVE", "live");
    if (meta) meta.textContent = "loading…";

    const data = await fetchJson(PATHS.transfers);
    if (!data){
      showEmpty(list, "Transfer feed not published yet", `Create ${PATHS.transfers} (generated by workflow).`, "SOON", "info");
      if (meta) meta.textContent = "not published";
      return;
    }

    const items = data.items || data.transfers || [];
    const updated = data.meta?.updated || data.meta?.generatedAt || "";

    if (!items.length){
      showEmpty(list, "No transfer items yet", "When your generator writes transfers.json, it will show here.", "EMPTY", "warn");
      if (meta) meta.textContent = updated ? `updated ${updated}` : "0";
      return;
    }

    const rows = items.slice(0, 20).map(t => {
      const player = escapeHtml(t.player || "");
      const from = escapeHtml(t.from || "");
      const to = escapeHtml(t.to || "");
      const fee = escapeHtml(t.fee || "");
      const status = escapeHtml(t.status || "RUMOR");
      const src = escapeHtml(t.source || "");
      const time = escapeHtml(t.time || "");
      const url = t.url ? String(t.url) : "";

      const title = player ? player : "Transfer update";
      const sub = [from && to ? `${from} → ${to}` : "", fee, status].filter(Boolean).join(" • ");
      const sub2 = [src, time].filter(Boolean).join(" • ");

      return `
        <div class="row">
          <div>
            <strong>${title}</strong>
            <div class="sub">${escapeHtml(sub || sub2 || "Net Thud transfer desk")}</div>
            ${url ? `<div class="sub" style="margin-top:10px;"><a class="chipBtn" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open source →</a></div>` : ``}
          </div>
          <span class="badge warn">${escapeHtml(status)}</span>
        </div>
      `;
    });

    renderRows(list, rows);
    if (meta) meta.textContent = updated ? `updated ${updated}` : `${items.length} items`;
  }

  // -----------------------------
  // Boot
  // -----------------------------
  async function boot(){
    setYear();
    setupMobileNav();
    setupSound();

    // Load everything
    try{ await loadScores(); }catch(e){ console.error(e); }
    try{ await loadUpcoming(); }catch(e){ console.error(e); }
    try{ await loadTransfers(); }catch(e){ console.error(e); }
    try{ await loadNews(); }catch(e){ console.error(e); }
    try{ await loadLeagues(); }catch(e){ console.error(e); }

    // Refresh cadence (GitHub-backed “near live”)
    setInterval(() => { loadScores().catch(()=>{}); },   30_000);
    setInterval(() => { loadUpcoming().catch(()=>{}); }, 5*60_000);
    setInterval(() => { loadTransfers().catch(()=>{}); },3*60_000);
    setInterval(() => { loadNews().catch(()=>{}); },     60_000);
  }

  document.addEventListener("DOMContentLoaded", boot);
})();