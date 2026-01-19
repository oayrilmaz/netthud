/* Net Thud — app.js (single-source rendering, GitHub Pages safe) */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

const PATHS = {
  leagues: "assets/data/leagues.json",
  aiNews: "assets/data/ai-news.json"
};

// -------- Mobile nav
function initMobileNav() {
  const burger = $("#burger");
  const mobileNav = $("#mobileNav");
  if (!burger || !mobileNav) return;

  burger.addEventListener("click", () => {
    const open = mobileNav.classList.toggle("show");
    burger.setAttribute("aria-expanded", open ? "true" : "false");
  });

  $$("#mobileNav a").forEach(a =>
    a.addEventListener("click", () => {
      mobileNav.classList.remove("show");
      burger.setAttribute("aria-expanded", "false");
    })
  );
}

// -------- Active nav (prevents "stuck highlight")
function initActiveNav() {
  const navLinks = $$("nav .navlink");
  const navLinksMobile = $$("#mobileNav .navlink");
  const all = [...navLinks, ...navLinksMobile];

  function setActive(hash) {
    all.forEach(l => l.classList.remove("active"));
    all.forEach(l => {
      if (l.getAttribute("href") === hash) l.classList.add("active");
    });
  }

  $$('a[href^="#"]').forEach(a => {
    a.addEventListener("click", e => {
      const id = a.getAttribute("href");
      if (!id || id === "#") return;
      const target = document.querySelector(id);
      if (!target) return;

      e.preventDefault();
      setActive(id);
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      history.pushState(null, "", id);
    });
  });

  const sectionIds = ["home", "signals", "ai-news", "leagues", "indexes", "about"];
  const sectionEls = sectionIds.map(id => document.getElementById(id)).filter(Boolean);

  function getActiveSectionHash() {
    const offset = 110;
    let best = null;
    let bestDist = Infinity;

    for (const el of sectionEls) {
      const r = el.getBoundingClientRect();
      const dist = Math.abs(r.top - offset);
      const penalty = r.bottom < offset ? 99999 : 0;
      const score = dist + penalty;
      if (score < bestDist) {
        bestDist = score;
        best = el;
      }
    }
    return best ? `#${best.id}` : "#home";
  }

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      setActive(getActiveSectionHash());
      ticking = false;
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);

  // initial
  const start = location.hash && document.querySelector(location.hash) ? location.hash : "#home";
  setActive(start);
  onScroll();
}

// -------- Footer year
function setYear() {
  const y = $("#year");
  if (y) y.textContent = new Date().getFullYear();
}

// -------- Signals (render ONLY ONCE to avoid triples)
function renderSignalsOnce() {
  // IMPORTANT: Use only ONE container id in your HTML: id="signalsList"
  const container = $("#signalsList");
  if (!container) return;

  const signals = [
    { title: "Late Goal Heat", desc: "Leagues with the highest 75+ minute volatility today.", tag: "LIVE", kind: "live" },
    { title: "First Goal Impact", desc: "Where the opening goal most often decides the match.", tag: "MODEL", kind: "model" },
    { title: "Momentum Shifts", desc: "Goal timing and response — who collapses, who resets, who strikes again.", tag: "track", kind: "track" }
  ];

  container.innerHTML = "";
  signals.forEach(s => {
    const row = document.createElement("div");
    row.className = "rowCard";
    row.innerHTML = `
      <div class="rowText">
        <strong>${s.title}</strong>
        <span>${s.desc}</span>
      </div>
      <span class="chip ${s.kind}">${String(s.tag).toUpperCase()}</span>
    `;
    container.appendChild(row);
  });
}

// -------- AI News (loads from assets/data/ai-news.json)
async function loadAiNews() {
  const list = $("#aiNewsList");
  const meta = $("#aiNewsMeta");
  if (!list) return;

  try {
    const res = await fetch(PATHS.aiNews, { cache: "no-store" });
    if (!res.ok) throw new Error(`AI news not found: ${PATHS.aiNews}`);

    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.items || []);
    list.innerHTML = "";

    items.slice(0, 6).forEach(item => {
      const title = item.title || "Update";
      const source = item.source || "Net Thud AI feed";
      const url = item.url || "";
      const badge = item.badge || "NEW";

      const card = document.createElement(url ? "a" : "div");
      card.className = "rowCard";
      if (url) {
        card.href = url;
        card.target = "_blank";
        card.rel = "noopener noreferrer";
      }

      card.innerHTML = `
        <div class="rowText">
          <strong>${title}</strong>
          <span>${source}</span>
        </div>
        <span class="chip live">${badge}</span>
      `;
      list.appendChild(card);
    });

    if (meta) meta.textContent = `${items.length} items`;
  } catch (err) {
    console.error(err);
    list.innerHTML = `
      <div class="errorBox">
        <strong>AI news not loading</strong>
        <div class="muted">Expected: ${PATHS.aiNews}</div>
      </div>
    `;
    if (meta) meta.textContent = "error";
  }
}

// -------- Leagues (loads from assets/data/leagues.json)
async function loadLeagues() {
  const container = $("#leagueChips");
  if (!container) return;

  try {
    const res = await fetch(PATHS.leagues, { cache: "no-store" });
    if (!res.ok) throw new Error(`Leagues JSON not found: ${PATHS.leagues}`);

    const leagues = await res.json();
    container.innerHTML = "";

    leagues.forEach(l => {
      const el = document.createElement("div");
      el.className = "league-pill";
      el.innerHTML = `<span class="dot"></span>${l.name}`;
      container.appendChild(el);
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="errorBox"><strong>Leagues not loading</strong><div class="muted">Expected: ${PATHS.leagues}</div></div>`;
  }
}

// -------- Sound (optional)
function initSound() {
  const thud = $("#sfxThud");
  const crowd = $("#sfxCrowd");
  const toggle = $("#soundToggle");
  const label = $("#soundLabel");

  if (!thud || !crowd || !toggle) return;

  let soundEnabled = true;
  let playedOnce = false;

  function stopAudio() {
    [thud, crowd].forEach(a => {
      a.pause();
      a.currentTime = 0;
    });
  }

  function setUI() {
    toggle.classList.toggle("off", !soundEnabled);
    toggle.setAttribute("aria-pressed", soundEnabled ? "true" : "false");
    if (label) label.textContent = soundEnabled ? "Sound: ON" : "Sound: OFF";
  }
  setUI();

  async function playVibe() {
    if (!soundEnabled || playedOnce) return;
    try {
      thud.volume = 0.82;
      crowd.volume = 0.55;
      thud.currentTime = 0;
      crowd.currentTime = 0;

      await thud.play();
      setTimeout(() => {
        crowd.play().catch(() => {});
        setTimeout(() => {
          crowd.pause();
          crowd.currentTime = 0;
        }, 2300);
      }, 180);

      playedOnce = true;
    } catch {
      playedOnce = false;
    }
  }

  ["pointerdown", "touchstart", "wheel", "keydown"].forEach(evt => {
    window.addEventListener(evt, playVibe, { once: true, passive: true });
  });

  toggle.addEventListener("click", async () => {
    soundEnabled = !soundEnabled;
    setUI();
    if (!soundEnabled) stopAudio();
    else await playVibe();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAudio();
  });
}

// -------- Boot
document.addEventListener("DOMContentLoaded", () => {
  initMobileNav();
  initActiveNav();
  setYear();

  renderSignalsOnce();   // <- only one render
  loadAiNews();
  loadLeagues();

  initSound();
});