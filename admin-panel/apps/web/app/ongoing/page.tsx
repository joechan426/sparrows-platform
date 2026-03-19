import fs from "node:fs";

export const dynamic = "force-dynamic";

const LOCAL_INDEX_HTML_PATH = "/Users/joechan/Desktop/sparrows-platform/admin-panel/apps/web/ongoing_tournament.html";
const RAW_ONGOING_HTML: string | null = (() => {
  try {
    return fs.readFileSync(LOCAL_INDEX_HTML_PATH, "utf-8");
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

function extractHeadStylesAndBody(html: string): { headStyles: string; bodyHtml: string } {
  const cleaned = stripLogosFromHtml(html);
  const styleBlocks = [...cleaned.matchAll(/<style[\s\S]*?<\/style>/gi)].map((m) => m[0]).join("\n");
  const bodyMatch = cleaned.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyHtml = bodyMatch?.[1] ?? cleaned;
  return { headStyles: styleBlocks, bodyHtml };
}

export default function OngoingPage() {
  if (!RAW_ONGOING_HTML) {
    return <div className="page-content" style={{ padding: 24 }}>Content unavailable.</div>;
  }
  const { headStyles, bodyHtml } = extractHeadStylesAndBody(RAW_ONGOING_HTML);
  return (
    <div className="ongoing-html-page">
      <style dangerouslySetInnerHTML={{ __html: headStyles }} />
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </div>
  );
}
