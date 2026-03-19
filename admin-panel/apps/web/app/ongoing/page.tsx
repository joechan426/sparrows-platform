export const revalidate = 2592000; // 30 days (seconds)

export default function OngoingPage() {
  return (
    <div className="embed-page">
      <h1 className="page-title embed-page-title">Ongoing Tournament</h1>
      <iframe
        title="Ongoing Tournament"
        src="https://joechan426.github.io/sparrowsvolleyball/"
        className="embed-iframe"
      />
    </div>
  );
}
