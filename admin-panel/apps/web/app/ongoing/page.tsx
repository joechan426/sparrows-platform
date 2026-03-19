import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const dynamic = "force-dynamic";
const LOCAL_ONGOING_HTML_PATH = "../../ongoing_tournament.html";

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
  let rawHtml: string | null = null;
  try {
    const fileUrl = new URL(LOCAL_ONGOING_HTML_PATH, import.meta.url);
    rawHtml = fs.readFileSync(fileURLToPath(fileUrl), "utf-8");
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
