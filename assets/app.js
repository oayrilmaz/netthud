(function () {
  const $ = (sel) => document.querySelector(sel);

  const signals = [
    { t: "Late Goal Heat", d: "Leagues with the highest 75+ minute volatility today.", b: "LIVE" },
    { t: "First Goal Impact", d: "Where the opening goal most often decides the match.", b: "MODEL" },
    { t: "Momentum Swings", d: "Teams that respond fastest after conceding.", b: "TRACK" }
  ];

  function renderSignals() {
    const host = $("#signals");
    if (!host) return;

    host.innerHTML = signals.map(s => `
      <div class="item">
        <div class="left">
          <div class="t">${s.t}</div>
          <div class="d">${s.d}</div>
        </div>
        <div class="badge">${s.b}</div>
      </div>
    `).join("");
  }

  document.addEventListener("DOMContentLoaded", renderSignals);
})();