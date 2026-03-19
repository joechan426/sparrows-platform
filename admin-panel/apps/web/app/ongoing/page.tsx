export const dynamic = "force-dynamic";
const GITHUB_ONGOING_HTML_URL =
  "https://raw.githubusercontent.com/joechan426/sparrows-platform/main/admin-panel/apps/web/ongoing_tournament.html";

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

export default async function OngoingPage() {
  let rawHtml: string | null = null;
  try {
    const res = await fetch(GITHUB_ONGOING_HTML_URL, { cache: "no-store" });
    if (res.ok) rawHtml = await res.text();
  } catch {
    rawHtml = null;
  }
  if (!rawHtml) {
    return <div className="page-content" style={{ padding: 24 }}>Content unavailable.</div>;
  }
  const { headStyles, bodyHtml } = extractHeadStylesAndBody(rawHtml);
  return (
    <div className="ongoing-html-page">
      <style dangerouslySetInnerHTML={{ __html: headStyles }} />
      <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </div>
  );
}
