import React from "react";
import { createRoot } from "react-dom/client";

import { fetchWithAuth } from "./lib/fetchWithAuth";
import App from "./App";

// Use fetch that adds Bearer token for /api so dataProvider and direct fetch() get auth
if (typeof window !== "undefined") {
  window.fetch = fetchWithAuth;
}

const container = document.getElementById("root");
// eslint-disable-next-line
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
