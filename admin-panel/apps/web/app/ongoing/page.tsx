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
    .hint { color: #5b6470; margin-bottom: 14px; }
    .list { display: grid; gap: 12px; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; display: grid; grid-template-columns: 44px 1fr; gap: 12px; align-items: center; }
    .logo { width: 40px; height: 40px; object-fit: contain; }
    .event-title { font-size: 16px; font-weight: 700; margin: 0 0 4px; }
    .meta { font-size: 13px; color: #5b6470; margin: 0; }
    .empty { padding: 24px; border-radius: 12px; background: #fff; border: 1px solid #e5e7eb; color: #5b6470; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1 class="title">Ongoing Tournament</h1>
    <p class="hint">Live list loaded from tournament API.</p>
    <div id="list" class="list"></div>
  </div>
  <script>
    (async function () {
      var list = document.getElementById("list");
      var ENDPOINT = "https://script.google.com/macros/s/AKfycbwnepQmr17n-HfyRJozYlrFiCLbytZ7iDYszrCDANdenKKRbKvKdrHUTApe1ZbO4A/exec";
      var TOURNAMENT = "Sparrows Cup";
      function logoByTitle(title) {
        return /pickleball/i.test(title || "") ? "/images/pickleball.png" : "/images/volleyball.png";
      }
      function render(items) {
        if (!items || items.length === 0) {
          list.innerHTML = '<div class="empty">No ongoing tournaments.</div>';
          return;
        }
        list.innerHTML = items.map(function (it) {
          var title = it.title || "Tournament";
          var start = it.startAt ? new Date(it.startAt).toLocaleString() : "-";
          var end = it.endAt ? new Date(it.endAt).toLocaleString() : "-";
          var logo = logoByTitle(title);
          return (
            '<article class="card">' +
              '<img class="logo" src="' + logo + '" alt="" />' +
              '<div>' +
                '<p class="event-title">' + title + '</p>' +
                '<p class="meta">Start: ' + start + '</p>' +
                '<p class="meta">End: ' + end + '</p>' +
              '</div>' +
            '</article>'
          );
        }).join("");
      }

      try {
        var url = ENDPOINT + "?tournament=" + encodeURIComponent(TOURNAMENT);
        var res = await fetch(url);
        var data = await res.json();
        if (Array.isArray(data)) {
          render(data);
          return;
        }
        if (data && data.ok === true) {
          if (Array.isArray(data.items)) {
            render(data.items);
            return;
          }
          if (data.tournament) {
            render([data.tournament]);
            return;
          }
        }
        if (data && data.ok === false) {
          list.innerHTML =
            '<div class="empty">API error: ' +
            String(data.error || "Invalid response") +
            '<br/>Current tournament param: <b>' +
            TOURNAMENT +
            "</b></div>";
          return;
        }
        render([]);
      } catch (e) {
        list.innerHTML = '<div class="empty">Failed to load tournaments from Google Script endpoint.</div>';
      }
    })();
  </script>
</body>
</html>`;

export default function OngoingPage() {
  return <iframe title="Ongoing Tournament" className="embed-iframe" style={{ width: "100%", height: "100vh", border: "none", display: "block" }} srcDoc={HARDCODED_ONGOING_HTML} />;
}
