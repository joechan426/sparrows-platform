import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const dynamic = "force-dynamic";

const LOCAL_INDEX_HTML_PATH = "../../ongoing_tournament.html";
const RAW_ONGOING_HTML: string | null = (() => {
  try {
    const fileUrl = new URL(LOCAL_INDEX_HTML_PATH, import.meta.url);
    return fs.readFileSync(fileURLToPath(fileUrl), "utf-8");
  } catch {
    return null;
  }
})();

function stripLogosFromHtml(html: string): string {
  // Remove any <img ...> tags that reference "logo" in any attribute.
  // This is heuristic but matches the request ("cancel all logos").
  const withoutLogoImgs = html.replace(/<img\b[^>]*logo[^>]*>/gi, "");
  return withoutLogoImgs;
}

export default function OngoingPage() {
  try {
    if (!RAW_ONGOING_HTML) throw new Error("ongoing_tournament.html missing");
    const cleanedHtml = stripLogosFromHtml(RAW_ONGOING_HTML);

    // Use srcDoc so the HTML (including its CSS/JS) renders as-is.
    return <iframe title="Ongoing Tournament" className="embed-iframe" style={{ height: "85vh", width: "100%" }} srcDoc={cleanedHtml} />;
  } catch {
    // Fallback if the local ongoing_tournament.html can't be read (e.g. missing file in runtime env).
    return <iframe title="Ongoing Tournament" src="https://joechan426.github.io/sparrowsvolleyball/" className="embed-iframe" style={{ height: "85vh", width: "100%" }} />;
  }
}
