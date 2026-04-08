import React, { useEffect, useRef, useState, useCallback } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";

/** Match sparrowsweb / admin mobile breakpoint */
const MOBILE_MQ = "(max-width: 1024px)";
const THRESHOLD_PX = 72;
const MAX_PULL_PX = 110;
const RESISTANCE = 0.42;

function getScrollTop(): number {
  return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
}

function isDisabledStartTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  return Boolean(
    target.closest(
      [
        "input",
        "textarea",
        "select",
        "[contenteditable='true']",
        ".MuiDataGrid-root",
        "[role='dialog']",
        "[role='alertdialog']",
        ".MuiModal-root.MuiModal-open",
        ".MuiDrawer-root",
        ".MuiPopover-root",
        ".MuiMenu-root",
        ".MuiSnackbar-root",
        'nav[aria-label="Main navigation"]',
        ".MuiAppBar-root",
      ].join(","),
    ),
  );
}

/**
 * Mobile / tablet: pull down at scroll top → soft-refresh current list views.
 */
export const PullToRefresh: React.FC = () => {
  const [enabled, setEnabled] = useState(false);
  const [pullPx, setPullPx] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const startY = useRef(0);
  const active = useRef(false);
  const pullAmount = useRef(0);
  const rafId = useRef(0);

  const flushPull = useCallback((px: number) => {
    pullAmount.current = px;
    if (rafId.current) cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => setPullPx(px));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(MOBILE_MQ);
    const apply = () => setEnabled(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !enabled || refreshing) return;

    const onTouchStart = (e: TouchEvent) => {
      if (getScrollTop() > 2) return;
      if (isDisabledStartTarget(e.target)) return;
      const t0 = e.touches[0];
      if (!t0) return;
      startY.current = t0.clientY;
      active.current = true;
      pullAmount.current = 0;
      flushPull(0);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!active.current) return;
      if (getScrollTop() > 2) {
        active.current = false;
        flushPull(0);
        return;
      }
      const t0 = e.touches[0];
      if (!t0) return;
      const dy = t0.clientY - startY.current;
      if (dy <= 0) {
        flushPull(0);
        return;
      }
      e.preventDefault();
      const p = Math.min(dy * RESISTANCE, MAX_PULL_PX);
      flushPull(p);
    };

    const onTouchEnd = () => {
      if (!active.current) return;
      active.current = false;
      const p = pullAmount.current;
      flushPull(0);
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
        rafId.current = 0;
      }
      if (p >= THRESHOLD_PX) {
        setRefreshing(true);
        window.dispatchEvent(new CustomEvent("sparrows:soft-refresh"));
        window.setTimeout(() => setRefreshing(false), 500);
      }
    };

    const onTouchCancel = () => {
      active.current = false;
      flushPull(0);
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchCancel);

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchCancel);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [enabled, refreshing, flushPull]);

  if (!enabled) return null;

  const show = pullPx > 6 || refreshing;
  const progress = Math.min(100, (pullPx / THRESHOLD_PX) * 100);

  return show ? (
    <Box
      aria-hidden
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: refreshing ? 52 : Math.max(36, pullPx),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1300,
        pointerEvents: "none",
        bgcolor: refreshing ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.75)",
        borderBottom: (t) => `1px solid ${t.palette.divider}`,
        transition: refreshing ? undefined : "none",
      }}
    >
      {refreshing ? (
        <CircularProgress size={28} color="primary" />
      ) : (
        <CircularProgress variant="determinate" value={progress} size={28} color="primary" />
      )}
    </Box>
  ) : null;
};
