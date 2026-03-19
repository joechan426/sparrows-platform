export const dynamic = "force-dynamic";
export default function OngoingPage() {
  return (
    <iframe
      title="Ongoing Tournament"
      className="embed-iframe"
      style={{ width: "100%", height: "100vh", border: "none", display: "block" }}
      src="/ongoing_tournament.html"
    />
  );
}
