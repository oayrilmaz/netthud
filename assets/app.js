/* assets/app.js
   Net Thud — AI News loader for GitHub Pages
   - Reads /news.json
   - Renders into:
     #signalsList, #signalsList2 (top items)
     #miniBoard (top items condensed)
     #aiNewsGrid (optional full grid if you add it)
   - Works whether news.json is an array OR { items: [...] }
*/

(function () {
  const $ = (s, el = document) => el.querySelector(s);

  const NEWS_URL = "news.json";

  function safeText(v, fallback = "") {
    if (v === null || v === undefined) return fallback;
    return String(v);
  }

  function normalizeItems(raw) {
    // Supports:
    // 1) [ ... ]
    // 2) { items: [ ... ] }
    // 3) { news: [ ... ] }
    // 4) { data: [ ... ] }
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.items)) return raw.items;
    if (raw && Array.isArray(raw.news)) return raw.news;
    if (raw && Array.isArray(raw.data)) return raw.data;
    return [];
  }

  function pick(item, keys, fallback = "") {
    for (const k of keys) {
      if (item && item[k] !== undefined && item[k] !== null && item[k] !== "") return item[k];
    }
    return fallback;
  }

  function slugify(s) {
    return safeText(s)
      .toLowerCase()
      .trim()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function getTag(item) {
    // Prefer explicit tag/category, else default
    const tag =
      pick(item, ["tag", "category", "type"], "").toString().toUpperCase() ||
      "AI NEWS";
    return tag.length > 10 ? "AI NEWS" : tag;
  }

  function getTagKind(tag) {
    // Map to existing CSS tag classes if possible
    const t = tag.toUpperCase();
    if (t.includes("LIVE")) return "live";
    if (t.includes("MODEL")) return "model";
    if (t.includes("TRACK")) return "track";
    return "model"; // default look (blue)
  }

  function getWhen(item) {
    const v = pick(item, ["publishedAt", "published_at", "date", "time"], "");
    if (!v) return "";
    // If it’s ISO date, make it prettier
    const d = new Date(v);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return safeText(v);
  }

  function getLink(item) {
    // If item has url, use it; otherwise link to article.html by slug or index
    const url = pick(item, ["url", "link", "sourceUrl", "source_url"], "");
    return url ? safeText(url) : "";
  }

  function buildArticleHref(item, idx) {
    const id =
      pick(item, ["id", "slug"], "") ||
      slugify(pick(item, ["title", "headline"], `item-${idx}`)) ||
      `item-${idx}`;
    return `article.html?id=${encodeURIComponent(id)}`;
  }

  function renderSignals(containerId, items) {
    const el = document.getElementById(containerId);
    if (!el) return;

    el.innerHTML = "";

    const top = items.slice(0, 3);

    if (!top.length) {
      el.innerHTML = `
        <div class="signal">
          <div>
            <strong>No AI news yet</strong>
            <p>news.json is empty or not reachable. Check the file path and GitHub Pages build.</p>
          </div>
          <span class="tag track">WAIT</span>
        </div>
      `;
      return;
    }

    top.forEach((item, idx) => {
      const title = safeText(pick(item, ["title", "headline"], "Untitled"));
      const desc =
        safeText(pick(item, ["summary", "description", "dek"], "")) ||
        safeText(pick(item, ["whyItMatters", "why_it_matters"], "")) ||
        safeText(pick(item, ["insight", "note"], ""));
      const source = safeText(pick(item, ["source", "publisher"], ""));
      const when = getWhen(item);

      const tag = getTag(item);
      const kind = getTagKind(tag);

      const external = getLink(item);
      const detailHref = buildArticleHref(item, idx);

      const meta = [source, when].filter(Boolean).join(" • ");

      const pText = (desc || meta || "Tap for details.").trim();
      const href = external || detailHref;

      const row = document.createElement("a");
      row.className = "signal";
      row.href = href;
      if (external) {
        row.target = "_blank";
        row.rel = "noopener noreferrer";
      }

      row.innerHTML = `
        <div>
          <strong>${escapeHtml(title)}</strong>
          <p>${escapeHtml(pText)}</p>
        </div>
        <span class="tag ${kind}">${escapeHtml(tag)}</span>
      `;

      el.appendChild(row);
    });
  }

  function renderMiniBoard(items) {
    const el = document.getElementById("miniBoard");
    if (!el) return;

    el.innerHTML = "";

    const top = items.slice(0, 3);

    top.forEach((item, idx) => {
      const title = safeText(pick(item, ["title", "headline"], "Untitled"));
      const desc =
        safeText(pick(item, ["summary", "description"], "")) ||
        safeText(pick(item, ["whyItMatters", "why_it_matters"], ""));
      const tag = getTag(item);
      const kind = getTagKind(tag);

      const external = getLink(item);
      const detailHref = buildArticleHref(item, idx);
      const href = external || detailHref;

      const row = document.createElement("a");
      row.className = "miniItem";
      row.href = href;
      if (external) {
        row.target = "_blank";
        row.rel = "noopener noreferrer";
      }

      row.innerHTML = `
        <div>
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(desc || "Tap for details.")}</span>
        </div>
        <span class="tag ${kind}">${escapeHtml(tag)}</span>
      `;
      el.appendChild(row);
    });

    if (!top.length) {
      const row = document.createElement("div");
      row.className = "miniItem";
      row.innerHTML = `
        <div>
          <strong>No items</strong>
          <span>Add items into news.json</span>
        </div>
        <span class="tag track">WAIT</span>
      `;
      el.appendChild(row);
    }
  }

  function renderAiNewsGrid(items) {
    // Optional container you can add later:
    // <div class="twoCols" id="aiNewsGrid"></div> OR any div with id="aiNewsGrid"
    const el = document.getElementById("aiNewsGrid");
    if (!el) return;

    el.innerHTML = "";
    const top = items.slice(0, 6);

    top.forEach((item, idx) => {
      const title = safeText(pick(item, ["title", "headline"], "Untitled"));
      const summary =
        safeText(pick(item, ["summary", "description"], "")) ||
        safeText(pick(item, ["whyItMatters", "why_it_matters"], ""));
      const source = safeText(pick(item, ["source", "publisher"], ""));
      const when = getWhen(item);

      const external = getLink(item);
      const detailHref = buildArticleHref(item, idx);
      const href = external || detailHref;

      const card = document.createElement("a");
      card.className = "card";
      card.href = href;
      if (external) {
        card.target = "_blank";
        card.rel = "noopener noreferrer";
      }

      const metaBits = [source, when].filter(Boolean).join(" • ");

      card.innerHTML = `
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(summary || "Tap for details.")}</p>
        <div class="meta">
          ${metaBits ? `<span class="pill2">${escapeHtml(metaBits)}</span>` : ""}
          <span class="pill2">${escapeHtml(getTag(item))}</span>
        </div>
      `;
      el.appendChild(card);
    });
  }

  function escapeHtml(str) {
    return safeText(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function loadNews() {
    // Cache-bust so GitHub Pages updates show fast
    const url = `${NEWS_URL}?v=${Date.now()}`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`news.json HTTP ${res.status}`);

    const raw = await res.json();
    const items = normalizeItems(raw);

    // newest-first if there is a date
    items.sort((a, b) => {
      const da = new Date(pick(a, ["publishedAt", "published_at", "date", "time"], 0)).getTime();
      const db = new Date(pick(b, ["publishedAt", "published_at", "date", "time"], 0)).getTime();
      if (isNaN(da) && isNaN(db)) return 0;
      if (isNaN(da)) return 1;
      if (isNaN(db)) return -1;
      return db - da;
    });

    renderSignals("signalsList", items);
    renderSignals("signalsList2", items);
    renderMiniBoard(items);
    renderAiNewsGrid(items);
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadNews().catch((err) => {
      console.warn("[NetThud] news load failed:", err);

      // graceful fallback into signals
      const s1 = document.getElementById("signalsList");
      const s2 = document.getElementById("signalsList2");
      [s1, s2].forEach((el) => {
        if (!el) return;
        el.innerHTML = `
          <div class="signal">
            <div>
              <strong>AI news not loading</strong>
              <p>Check that <code>/news.json</code> exists at the repo root and is published by GitHub Pages.</p>
            </div>
            <span class="tag track">ERROR</span>
          </div>
        `;
      });
    });
  });
})();