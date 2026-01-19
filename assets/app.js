/* Net Thud — app.js
   - Renders AI News (news.json)
   - Renders Live feed (live.json)
   - Auto refresh (polling)
*/

const $ = (s, el = document) => el.querySelector(s);

function escapeHTML(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function timeAgo(isoOrDateStr) {
  if (!isoOrDateStr) return "";
  const t = new Date(isoOrDateStr).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;

  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

async function fetchJSON(path) {
  // Cache-bust so GitHub Pages doesn’t serve old JSON
  const url = `${path}?v=${Date.now()}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Fetch failed: ${path} (${r.status})`);
  return r.json();
}

// ------------------------------------------------------------
// RENDER: AI NEWS
// expects news.json shape:
// { generatedAt, source:"NetThud AI", items:[{title, url, source, publishedAt, summary}] }
// ------------------------------------------------------------
function renderNews(items = []) {
  const el = $("#signalsList");   // reuse your existing container
  const el2 = $("#signalsList2"); // second panel (optional)
  if (!el && !el2) return;

  const rows = (items || []).slice(0, 8).map((n) => {
    const title = escapeHTML(n.title || "Untitled");
    const url = n.url ? String(n.url) : "#";
    const src = escapeHTML(n.source || "Source");
    const when = n.publishedAt ? timeAgo(n.publishedAt) : "";
    const summary = escapeHTML(n.summary || "");

    return `
      <div class="signal">
        <div>
          <strong><a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a></strong>
          <p>${summary}</p>
          <p style="margin-top:8px; font-size:12px; color:rgba(170,182,195,.85); font-weight:800;">
            ${src}${when ? ` • ${when}` : ""}
          </p>
        </div>
        <span class="tag model">NEWS</span>
      </div>
    `;
  }).join("");

  if (el) el.innerHTML = rows || `<div class="signal"><div><strong>No news yet</strong><p>news.json is empty.</p></div><span class="tag">—</span></div>`;
  if (el2) el2.innerHTML = rows || `<div class="signal"><div><strong>No news yet</strong><p>news.json is empty.</p></div><span class="tag">—</span></div>`;
}

// ------------------------------------------------------------
// RENDER: LIVE FEED
// expects live.json shape:
// { generatedAt, items:[{league, home, away, status, minute, score, url}] }
// ------------------------------------------------------------
function renderLive(items = []) {
  const mini = $("#miniBoard");
  if (!mini) return;

  const rows = (items || []).slice(0, 6).map((m) => {
    const league = escapeHTML(m.league || "");
    const home = escapeHTML(m.home || "");
    const away = escapeHTML(m.away || "");
    const status = escapeHTML(m.status || "LIVE");
    const minute = (m.minute != null) ? `${escapeHTML(String(m.minute))}'` : "";
    const score = escapeHTML(m.score || "");
    const url = m.url ? String(m.url) : "#";

    return `
      <div class="miniItem">
        <div>
          <strong>
            <a href="${url}" target="_blank" rel="noopener noreferrer">
              ${home} ${score ? `<span style="opacity:.9">(${score})</span>` : ""} vs ${away}
            </a>
          </strong>
          <span>${league}${(minute || status) ? ` • ${minute || status}` : ""}</span>
        </div>
        <span class="tag live">${status === "FT" ? "FT" : "LIVE"}</span>
      </div>
    `;
  }).join("");

  mini.innerHTML = rows || `<div class="miniItem"><div><strong>No live feed yet</strong><span>live.json is empty.</span></div><span class="tag">—</span></div>`;
}

// ------------------------------------------------------------
// MAIN LOADERS
// ------------------------------------------------------------
async function loadNews() {
  const data = await fetchJSON("/news.json");
  renderNews(data.items || []);
}

async function loadLive() {
  const data = await fetchJSON("/live.json");
  renderLive(data.items || []);
}

async function boot() {
  // Initial load
  try { await loadNews(); } catch (e) { /* ignore */ }
  try { await loadLive(); } catch (e) { /* ignore */ }

  // Auto refresh
  // News: every 5 minutes
  setInterval(() => loadNews().catch(() => {}), 5 * 60 * 1000);
  // Live feed: every 30 seconds
  setInterval(() => loadLive().catch(() => {}), 30 * 1000);
}

document.addEventListener("DOMContentLoaded", boot);