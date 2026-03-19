export const dynamic = "force-dynamic";

const HARDCODED_ONGOING_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Ongoing Tournament</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f7f8fa; color: #111; }
    .wrap { max-width: 980px; margin: 0 auto; padding: 16px; }
    .title { font-size: 28px; font-weight: 700; margin: 8px 0 16px; }
    .hint { color: #5b6470; margin-bottom: 10px; }
    .toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
    .toolbar label { font-size: 13px; color: #4b5563; }
    .toolbar select { padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 8px; background: #fff; }
    .list { display: grid; gap: 12px; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; display: grid; grid-template-columns: 44px 1fr; gap: 12px; align-items: center; }
    .logo { width: 40px; height: 40px; object-fit: contain; }
    .event-title { font-size: 16px; font-weight: 700; margin: 0 0 4px; }
    .meta { font-size: 13px; color: #5b6470; margin: 0; }
    .subtitle { font-size: 13px; color: #374151; margin: 0 0 10px; }
    .empty { padding: 24px; border-radius: 12px; background: #fff; border: 1px solid #e5e7eb; color: #5b6470; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1 class="title">Ongoing Tournament</h1>
    <p class="hint" id="hint">Loading tournaments...</p>
    <p class="subtitle" id="subtitle"></p>
    <div class="toolbar">
      <label for="tournamentSelect">Tournament:</label>
      <select id="tournamentSelect"></select>
    </div>
    <div id="list" class="list"></div>
  </div>
  <script>
    (async function () {
      var list = document.getElementById("list");
      var hint = document.getElementById("hint");
      var subtitle = document.getElementById("subtitle");
      var select = document.getElementById("tournamentSelect");
      var ENDPOINT = "https://script.google.com/macros/s/AKfycbwnepQmr17n-HfyRJozYlrFiCLbytZ7iDYszrCDANdenKKRbKvKdrHUTApe1ZbO4A/exec";

      function logoByTitle(title) {
        return /pickleball/i.test(title || "") ? "/images/pickleball.png" : "/images/volleyball.png";
      }
      function esc(v) {
        return String(v == null ? "" : v)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      }
      function render(payload) {
        var items = Array.isArray(payload.schedule) ? payload.schedule : [];
        if (!items || items.length === 0) {
          list.innerHTML = '<div class="empty">No ongoing tournaments.</div>';
          subtitle.textContent = "";
          return;
        }
        subtitle.textContent = [payload.webHeader, payload.webSubtitleLine1, payload.webSubtitleLine2, payload.webSubtitleLine3]
          .filter(Boolean)
          .join(" / ");
        list.innerHTML = items.map(function (it) {
          var title = it.tournament || payload.tournament || "Tournament";
          var logo = logoByTitle(title);
          return (
            '<article class="card">' +
              '<img class="logo" src="' + logo + '" alt="" />' +
              '<div>' +
                '<p class="event-title">' + esc(title) + '</p>' +
                '<p class="meta"><b>' + esc(it.team || "-") + '</b> vs <b>' + esc(it.opponent || "-") + '</b></p>' +
                '<p class="meta">' + esc(it.division || "-") + " · " + esc(it.date || "-") + " · " + esc(it.time || "-") + '</p>' +
                '<p class="meta">Location: ' + esc(it.location || "-") + " · Duty: " + esc(it.dutyTeam || "-") + '</p>' +
              '</div>' +
            '</article>'
          );
        }).join("");
      }
      function showError(msg) {
        list.innerHTML = '<div class="empty">' + esc(msg) + "</div>";
      }

      async function fetchTournamentPayload(tournamentName) {
        var url = ENDPOINT + "?tournament=" + encodeURIComponent(tournamentName);
        var res = await fetch(url);
        return await res.json();
      }

      try {
        var listRes = await fetch(ENDPOINT + "?action=listTournaments");
        var listData = await listRes.json();
        if (!listData || listData.ok !== true || !Array.isArray(listData.tournaments) || listData.tournaments.length === 0) {
          showError("No enabled tournaments in Config.");
          return;
        }
        hint.textContent = "Loaded from Google Script";
        select.innerHTML = listData.tournaments
          .map(function (name) {
            var selected = name === listData.defaultTournament ? " selected" : "";
            return '<option value="' + esc(name) + '"' + selected + ">" + esc(name) + "</option>";
          })
          .join("");

        async function loadAndRender(name) {
          list.innerHTML = '<div class="empty">Loading schedule...</div>';
          var payload = await fetchTournamentPayload(name);
          if (!payload || payload.ok !== true) {
            showError("API error: " + String(payload && payload.error ? payload.error : "Invalid response"));
            return;
          }
          render(payload);
        }

        var initial = listData.defaultTournament || listData.tournaments[0];
        await loadAndRender(initial);

        select.addEventListener("change", function () {
          loadAndRender(select.value);
        });
      } catch (e) {
        showError("Failed to load tournaments from Google Script endpoint.");
      }
    })();
  </script>
</body>
</html>`;

export default function OngoingPage() {
  return <iframe title="Ongoing Tournament" className="embed-iframe" style={{ width: "100%", height: "100vh", border: "none", display: "block" }} srcDoc={HARDCODED_ONGOING_HTML} />;
}
