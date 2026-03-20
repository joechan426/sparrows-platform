"use client";

import { useEffect, useState } from "react";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";

export function PwaStatusBanner() {
  const [isOnline, setIsOnline] = useState(true);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOnline(navigator.onLine);

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Show "update available" when SW has a waiting worker.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let mounted = true;

    navigator.serviceWorker
      .getRegistration()
      .then((reg) => {
        if (!mounted) return;
        if (reg?.waiting) setUpdateAvailable(true);

        reg?.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            if (!mounted) return;
            // When it reaches "installed" again, there is likely a waiting worker.
            if (sw.state === "installed" && reg.waiting) {
              setUpdateAvailable(true);
            }
          });
        });
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <>
      <Snackbar
        open={!isOnline}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="warning" variant="filled" sx={{ maxWidth: 520 }}>
          You are offline. Event registration will be queued and sent when you’re back online.
        </Alert>
      </Snackbar>

      <Snackbar
        open={updateAvailable}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity="info"
          variant="filled"
          sx={{ maxWidth: 520 }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                setUpdateAvailable(false);
                window.location.reload();
              }}
            >
              Update
            </Button>
          }
        >
          A new version is available. Tap Update to refresh.
        </Alert>
      </Snackbar>
    </>
  );
}

