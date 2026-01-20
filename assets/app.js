/* NetThud - assets/app.js
   - Safe JSON fetch from /assets/data/*
   - Cache busting
   - Never crash UI if JSON missing
   - Filters out external news sources (ESPN/BBC/etc.)
*/

(function () {
  // ---------- Utilities ----------
  function qs(sel) {
    return document.querySelector(sel);
  }
  function qsa(sel) {
    return Array.from(document.querySelectorAll(sel));
  }
  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }
  function isoNow() {
    return new Date().toISOString();
  }
  function fmtDateTime(iso) {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return String(iso || "");
      return d.toISOString().replace("T", " ").replace("Z", "Z");
    } catch {
      return String(iso || "");
    }
  }

  // Robust data URL builder (works on custom domains + GitHub Pages subpaths)
  function dataUrl(file) {
    const u = new URL(`assets/data/${file}`, document.baseURI);
    u.searchParams.set("v", String(Date.now())); // cache bust
    return u.toString();
  }

  async function safeFetchJson(file) {
    try {
      const res = await fetch(dataUrl(file), { cache: "no-store" });
      if (!res.ok) throw new Error(`${file} HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn("Data load failed:", file, err);
      return null; // never crash the UI
    }
  }

  // ---------- UI Targets ----------
  const UI = {
    finalScoresWrap:
      qs("#finalScores") || qs('[data-section="finalScores"]') || qs("#final-scores"),
    upcomingWrap:
      qs("#upcoming") || qs('[data-section="upcoming"]') || qs("#upcoming-tv"),
    transfersWrap:
      qs("#transfers") || qs('[data-section="transfers"]') || qs("#transfer-desk"),
    aiNewsWrap: qs("#aiNews") || qs('[data-section="aiNews"]') || qs("#ai-news"),
    leaguesWrap: qs("#leagues") || qs('[data-section="leagues"]') || qs("#leagues"),

    finalScoresUpdated: qs("#finalScoresUpdated") || qs('[data-updated="finalScores"]'),
    upcomingUpdated: qs("#upcomingUpdated") || qs('[data-updated="upcoming"]'),
    transfersUpdated: qs("#transfersUpdated") || qs('[data-updated="transfers"]'),
    aiNewsUpdated: qs("#aiNewsUpdated") || qs('[data-updated="aiNews"]'),
    leaguesUpdated: qs("#leaguesUpdated") || qs('[data-updated="leagues"]'),
  };

  function getUpdatedStamp(json) {
    // Your leagues.json uses "updated". Some other feeds may use "generatedAt".
    return json?.generatedAt || json?.updated || null;
  }

  function setUpdated(el, iso) {
    if (!el) return;
    el.textContent = iso ? `updated ${fmtDateTime(iso)}` : `updated ${fmtDateTime(isoNow())}`;
  }

  function clearWrap(wrap) {
    if (!wrap) return;
    wrap.innerHTML = "";
  }

  function renderCard(wrap, html) {
    if (!wrap) return;
    const div = document.createElement("div");
    div.innerHTML = html.trim();
    wrap.appendChild(div.firstElementChild);
  }

  // ---------- Filtering (remove ESPN/BBC/etc.) ----------
  const BLOCKED_DOMAINS = [
    "espn.com",
    "feeds.bbci.co.uk",
    "bbc.co.uk",
    "skysports.com",
    "goal.com",
    "theathletic.com",
  ];

  function getDomainFromUrl(url) {
    try {
      const u = new URL(url);
      return u.hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  function filterExternal(items) {
    if (!Array.isArray(items)) return [];
    return items.filter((it) => {
      const domain = getDomainFromUrl(it?.url || "");
      if (!domain) return true;
      return !BLOCKED_DOMAINS.some((b) => domain === b || domain.endsWith("." + b));
    });
  }

  // ---------- Renderers ----------
  function renderEmptyState(wrap, title, subtitle, badgeText) {
    renderCard(
      wrap,
      `
      <div class="card">
        <div class="card__title">${esc(title)}</div>
        <div class="card__sub">${esc(subtitle || "")}</div>
        ${badgeText ? `<div class="badge">${esc(badgeText)}</div>` : ""}
      </div>
      `
    );
  }

  function renderNewsList(wrap, items) {
    if (!wrap) return;
    clearWrap(wrap);

    if (!items.length) {
      renderEmptyState(
        wrap,
        "No AI news yet",
        "Once OpenAI generation is enabled, items will appear here.",
        "EMPTY"
      );
      return;
    }

    items.forEach((it) => {
      const title = it?.title || "Untitled";
      const source = it?.source || getDomainFromUrl(it?.url || "") || "source";
      const date = it?.date || it?.publishedAt || "";
      const summary = it?.summary || it?.description || "";
      const url = it?.url || "";

      const btn = url
        ? `<a class="btn-open" href="${esc(url)}" target="_blank" rel="noopener">OPEN</a>`
        : "";

      renderCard(
        wrap,
        `
        <div class="card">
          <div class="card__row">
            <div class="card__title">${esc(title)}</div>
            ${btn}
          </div>
          <div class="card__meta">${esc(source)}${date ? " \u2022 " + esc(date) : ""}</div>
          ${summary ? `<div class="card__sub">${esc(summary)}</div>` : ""}
        </div>
        `
      );
    });
  }

  function renderScores(wrap, items) {
    if (!wrap) return;
    clearWrap(wrap);

    if (!items.length) {
      renderEmptyState(wrap, "No final scores yet", "Matches will appear here once completed.", "EMPTY");
      return;
    }

    items.forEach((m) => {
      const league = m?.league || "";
      const home = m?.home || "";
      const away = m?.away || "";
      const score = m?.score || "";
      const status = m?.status || "";
      const minute = m?.minute != null ? String(m.minute) : "";

      renderCard(
        wrap,
        `
        <div class="card">
          <div class="card__title">${esc(home)} <span class="muted">vs</span> ${esc(away)}</div>
          <div class="card__meta">${esc(league)}${status ? " \u2022 " + esc(status) : ""}${
          minute ? " \u2022 " + esc(minute) + "'" : ""
        }</div>
          ${score ? `<div class="score">${esc(score)}</div>` : ""}
        </div>
        `
      );
    });
  }

  function renderUpcoming(wrap, items) {
    if (!wrap) return;
    clearWrap(wrap);

    if (!items.length) {
      renderEmptyState(wrap, "No upcoming matches", "Upcoming fixtures will appear here.", "EMPTY");
      return;
    }

    items.forEach((m) => {
      const title = m?.title || `${m?.home || ""} vs ${m?.away || ""}`.trim() || "Match";
      const league = m?.league || "";
      const when = m?.when || m?.date || "";
      const tv = m?.tv || m?.channel || "";

      renderCard(
        wrap,
        `
        <div class="card">
          <div class="card__row">
            <div class="card__title">${esc(title)}</div>
            <div class="badge green">UP</div>
          </div>
          <div class="card__meta">${esc(league)}${when ? " \u2022 " + esc(when) : ""}${
          tv ? " \u2022 " + esc(tv) : ""
        }</div>
        </div>
        `
      );
    });
  }

  function renderTransfers(wrap, items) {
    if (!wrap) return;
    clearWrap(wrap);

    if (!items.length) {
      renderEmptyState(wrap, "No transfers yet", "Once transfer generation is enabled, items will appear here.", "EMPTY");
      return;
    }

    items.forEach((t) => {
      const title = t?.title || t?.headline || "Transfer update";
      const source = t?.source || getDomainFromUrl(t?.url || "") || "source";
      const date = t?.date || t?.publishedAt || "";
      const url = t?.url || "";
      const btn = url
        ? `<a class="btn-open" href="${esc(url)}" target="_blank" rel="noopener">OPEN</a>`
        : "";

      renderCard(
        wrap,
        `
        <div class="card">
          <div class="card__row">
            <div class="card__title">${esc(title)}</div>
            ${btn}
          </div>
          <div class="card__meta">${esc(source)}${date ? " \u2022 " + esc(date) : ""}</div>
        </div>
        `
      );
    });
  }

  function renderLeagues(wrap, items) {
    if (!wrap) return;
    clearWrap(wrap);

    if (!items.length) {
      renderEmptyState(wrap, "Leagues not loading", "Missing: leagues.json", "ERR");
      return;
    }

    items.forEach((l) => {
      const name = l?.name || "League";
      const country = l?.country || "";
      const emoji = l?.emoji || "";
      renderCard(
        wrap,
        `
        <div class="card">
          <div class="card__title">${emoji ? esc(emoji) + " " : ""}${esc(name)}</div>
          ${country ? `<div class="card__sub">${esc(country)}</div>` : ""}
        </div>
        `
      );
    });
  }

  // ---------- Load & Render ----------
  async function main() {
    const [
      leaguesJson,
      scoresJson,
      upcomingJson,
      transfersJson,
      aiNewsJson,
      signalsJson,
    ] = await Promise.all([
      safeFetchJson("leagues.json"),
      safeFetchJson("scores.json"),
      safeFetchJson("upcoming.json"),
      safeFetchJson("transfers.json"),
      safeFetchJson("ai-news.json"),
      safeFetchJson("signals.json"),
    ]);

    const leaguesItems = leaguesJson?.items ?? [];
    const scoresItems = scoresJson?.items ?? [];
    const upcomingItems = upcomingJson?.items ?? [];
    const transfersItems = transfersJson?.items ?? [];
    const aiNewsItemsRaw = aiNewsJson?.items ?? [];
    const signalsItemsRaw = signalsJson?.items ?? [];

    const aiNewsItems = filterExternal(aiNewsItemsRaw);
    const signalsItems = filterExternal(signalsItemsRaw);
    const transfersItemsFiltered = filterExternal(transfersItems);

    setUpdated(UI.leaguesUpdated, getUpdatedStamp(leaguesJson));
    renderLeagues(UI.leaguesWrap, leaguesItems);

    setUpdated(UI.finalScoresUpdated, getUpdatedStamp(scoresJson));
    renderScores(UI.finalScoresWrap, scoresItems);

    setUpdated(UI.upcomingUpdated, getUpdatedStamp(upcomingJson));
    renderUpcoming(UI.upcomingWrap, upcomingItems);

    setUpdated(UI.transfersUpdated, getUpdatedStamp(transfersJson));
    renderTransfers(UI.transfersWrap, transfersItemsFiltered);

    setUpdated(UI.aiNewsUpdated, getUpdatedStamp(aiNewsJson));
    renderNewsList(UI.aiNewsWrap, aiNewsItems);

    window.NETTHUD = {
      loadedAt: isoNow(),
      data: {
        leagues: leaguesJson,
        scores: scoresJson,
        upcoming: upcomingJson,
        transfers: transfersJson,
        aiNews: aiNewsJson,
        signals: signalsJson,
      },
      filtered: {
        aiNewsItems,
        signalsItems,
        transfersItemsFiltered,
      },
    };

    console.log("NetThud loaded", window.NETTHUD);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();