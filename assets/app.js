/* NetThud - assets/app.js
   - Works with your index.html IDs (scoresList, leagueChips, etc.)
   - Safe JSON fetch from assets/data/*
   - Cache busting
   - Never crashes UI if JSON missing / empty
*/

(function () {
  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function fmt(iso) {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso || "—");
      return d.toISOString();
    } catch {
      return String(iso || "—");
    }
  }

  function withCacheBust(urlStr) {
    const u = new URL(urlStr, document.baseURI);
    u.searchParams.set("v", String(Date.now()));
    return u.toString();
  }

  function candidateDataUrls(file) {
    // Always prefer assets/data/*
    const rel = new URL(`assets/data/${file}`, document.baseURI).toString();
    const abs = new URL(`/assets/data/${file}`, window.location.origin).toString();
    const dot = new URL(`./assets/data/${file}`, document.baseURI).toString();
    return Array.from(new Set([rel, abs, dot])).map(withCacheBust);
  }

  async function safeFetchJson(file) {
    const urls = candidateDataUrls(file);
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`${file} HTTP ${res.status} @ ${url}`);
        return await res.json();
      } catch (e) {
        console.warn("Fetch failed:", e.message);
      }
    }
    return null;
  }

  function row(title, meta, tagText, tagClass = "") {
    const d = document.createElement("div");
    d.className = "item";
    d.innerHTML = `
      <div>
        <strong>${esc(title)}</strong>
        <p>${esc(meta || "")}</p>
      </div>
      <span class="tag ${esc(tagClass)}">${esc(tagText)}</span>
    `;
    return d;
  }

  function emptyState(container, title, meta) {
    container.innerHTML = "";
    container.appendChild(row(title, meta, "EMPTY", "warn"));
  }

  function errState(container, title, meta) {
    container.innerHTML = "";
    container.appendChild(row(title, meta, "ERR", "warn"));
  }

  function updatedStamp(json) {
    return json?.generatedAt || json?.updated || json?.updatedAt || null;
  }

  function setMeta(el, count, iso) {
    if (!el) return;
    el.textContent = `${count} • updated ${iso ? fmt(iso) : "—"}`;
  }

  // ---------------- Scores ----------------
  function normalizeScores(data) {
    // Supports:
    // - { items: [{league, home, away, score, status, minute, when}] }
    // - { matches: [{home, away, homeScore, awayScore, league, date}] }
    const items = Array.isArray(data?.items) ? data.items : [];
    if (items.length) return { list: items, stamp: updatedStamp(data) };

    const matches = Array.isArray(data?.matches) ? data.matches : [];
    if (matches.length) {
      const mapped = matches.map(m => ({
        league: m.league,
        home: m.home,
        away: m.away,
        score: (m.homeScore != null && m.awayScore != null) ? `${m.homeScore}–${m.awayScore}` : "",
        status: "FT",
        when: m.date || ""
      }));
      return { list: mapped, stamp: updatedStamp(data) };
    }

    return { list: [], stamp: updatedStamp(data) };
  }

  async function loadScores() {
    const list = $("scoresList");
    const meta = $("scoresMeta");
    if (!list) return;

    const data = await safeFetchJson("scores.json");
    if (!data) {
      meta && (meta.textContent = "error");
      return errState(list, "Scores not loading", "Could not fetch assets/data/scores.json");
    }

    const { list: items, stamp } = normalizeScores(data);
    setMeta(meta, items.length, stamp);

    if (!items.length) return emptyState(list, "No final scores yet", "Matches will appear here once completed.");

    list.innerHTML = "";
    items.forEach(m => {
      const title = `${m.home || ""} ${m.score || ""} ${m.away || ""}`.trim() || "Match";
      const metaLine = [m.league, m.when, m.status, (m.minute != null ? `${m.minute}'` : "")]
        .filter(Boolean).join(" • ");
      list.appendChild(row(title, metaLine, (m.status || "FT")));
    });
  }

  // ---------------- Upcoming ----------------
  async function loadUpcoming() {
    const list = $("upcomingList");
    const meta = $("upcomingMeta");
    if (!list) return;

    const data = await safeFetchJson("upcoming.json");
    if (!data) {
      meta && (meta.textContent = "error");
      return errState(list, "Upcoming not loading", "Could not fetch assets/data/upcoming.json");
    }

    const items = Array.isArray(data?.items) ? data.items : [];
    setMeta(meta, items.length, updatedStamp(data));

    if (!items.length) return emptyState(list, "No upcoming matches", "Upcoming fixtures will appear here.");

    list.innerHTML = "";
    items.forEach(g => {
      const title = `${g.home || ""} vs ${g.away || ""}`.trim() || (g.title || "Match");
      const tv = Array.isArray(g.tv) ? g.tv.join(", ") : (g.tv || g.channel || "");
      const when = g.kickoffLocal || g.when || g.date || g.kickoffUTC || "";
      const metaLine = [g.league, when, tv].filter(Boolean).join(" • ");
      list.appendChild(row(title, metaLine, "UP"));
    });
  }

  // ---------------- Transfers ----------------
  async function loadTransfers() {
    const list = $("transfersList");
    const meta = $("transfersMeta");
    if (!list) return;

    const data = await safeFetchJson("transfers.json");
    if (!data) {
      meta && (meta.textContent = "error");
      return errState(list, "Transfers not loading", "Could not fetch assets/data/transfers.json");
    }

    const items = Array.isArray(data?.items) ? data.items : [];
    setMeta(meta, items.length, updatedStamp(data));

    if (!items.length) return emptyState(list, "No transfers yet", "Populate assets/data/transfers.json");

    list.innerHTML = "";
    items.forEach(t => {
      const title = t.title || t.headline || "Transfer update";
      const metaLine = [t.league, (t.source || "source"), (t.publishedAt || t.date || "")]
        .filter(Boolean).join(" • ");
      list.appendChild(row(title, metaLine, "NEW"));
    });
  }

  // ---------------- AI News ----------------
  async function loadNews() {
    const list = $("newsList");
    const meta = $("newsMeta");
    if (!list) return;

    const data = await safeFetchJson("ai-news.json");
    if (!data) {
      meta && (meta.textContent = "error");
      return errState(list, "AI News not loading", "Could not fetch assets/data/ai-news.json");
    }

    const items = Array.isArray(data?.items) ? data.items : [];
    setMeta(meta, items.length, updatedStamp(data));

    if (!items.length) return emptyState(list, "No AI news yet", "Populate assets/data/ai-news.json");

    list.innerHTML = "";
    items.slice(0, 10).forEach(n => {
      const el = document.createElement("a");
      el.href = n.url || "#";
      el.target = "_blank";
      el.rel = "noopener";
      el.className = "item";
      el.innerHTML = `
        <div>
          <strong>${esc(n.title || "News item")}</strong>
          <p>${esc([n.source, n.publishedAt ? String(n.publishedAt).slice(0,10) : "", n.summary || ""].filter(Boolean).join(" • "))}</p>
        </div>
        <span class="tag">OPEN</span>
      `;
      list.appendChild(el);
    });
  }

  // ---------------- Leagues ----------------
  async function loadLeagues() {
    const container = $("leagueChips");
    const meta = $("leaguesMeta");
    if (!container) return;

    const data = await safeFetchJson("leagues.json"); // <- MUST live in assets/data/leagues.json
    if (!data) {
      meta && (meta.textContent = "error");
      return errState(container, "Leagues not loading", "Could not fetch assets/data/leagues.json");
    }

    const items = Array.isArray(data?.items) ? data.items : [];
    setMeta(meta, items.length, updatedStamp(data));

    if (!items.length) return emptyState(container, "No leagues yet", "assets/data/leagues.json loaded but items[] is empty.");

    container.innerHTML = "";
    items.forEach(l => {
      const el = document.createElement("div");
      el.className = "chip";
      const emoji = l.emoji ? `${l.emoji} ` : "";
      const country = l.country ? ` • ${l.country}` : "";
      el.innerHTML = `<span class="dot"></span>${esc(emoji + (l.name || l.key || "League") + country)}`;
      container.appendChild(el);
    });
  }

  // ---------------- Sound toggle ----------------
  const SOUND_KEY = "netthud_sound";
  function getSound() { return localStorage.getItem(SOUND_KEY) !== "0"; }
  function setSoundUI(on) { const el = $("soundState"); if (el) el.textContent = on ? "ON" : "OFF"; }
  function setSound(on) { localStorage.setItem(SOUND_KEY, on ? "1" : "0"); setSoundUI(on); }
  function beep() {
    if (!getSound()) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "sine"; o.frequency.value = 440; g.gain.value = 0.02;
      o.connect(g); g.connect(ctx.destination);
      o.start(); setTimeout(() => { o.stop(); ctx.close(); }, 80);
    } catch {}
  }

  async function main() {
    const year = $("year");
    if (year) year.textContent = String(new Date().getFullYear());

    const pill = $("soundPill");
    setSoundUI(getSound());
    if (pill) {
      pill.addEventListener("click", () => {
        const on = !getSound();
        setSound(on);
        beep();
      });
    }

    await loadScores();
    await loadUpcoming();
    await loadTransfers();
    await loadNews();
    await loadLeagues();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();