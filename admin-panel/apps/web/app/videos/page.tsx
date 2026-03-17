"use client";

export default function VideosPage() {
  return (
    <div className="embed-page">
      <h1 className="page-title embed-page-title">Videos</h1>
      <iframe
        title="Sparrows Videos - YouTube"
        src="https://www.youtube.com/@SparrowsVolleyball/videos"
        className="embed-iframe"
      />
    </div>
  );
}
