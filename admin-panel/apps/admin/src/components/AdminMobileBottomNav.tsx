import React, { useEffect, useMemo, useRef } from "react";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { useMenu, useLogout } from "@refinedev/core";
import type { TreeMenuItem } from "@refinedev/core";
import { canAccessResource } from "../lib/authProvider";
import { useMediaQuery, useTheme } from "@mui/material";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";

function isTabActive(route: string, pathname: string): boolean {
  const base = route.replace(/\/$/, "") || "/";
  if (base === "/") return pathname === "/";
  return pathname === base || pathname.startsWith(`${base}/`);
}

function isRootListItem(item: TreeMenuItem): boolean {
  const parent = item.meta && typeof item.meta === "object" && "parent" in item.meta ? (item.meta as { parent?: string }).parent : undefined;
  if (parent) return false;
  return typeof item.route === "string" && item.route.length > 0;
}

/**
 * Mobile / tablet bottom navigation — text only, horizontally scrollable.
 * Height / padding aligned with sparrowsweb bottom tab bar (see web globals.css).
 */
export const AdminMobileBottomNav: React.FC = () => {
  const theme = useTheme();
  const isDesktop = useMediaQuery("(min-width:1025px)");
  const location = useLocation();
  const { menuItems } = useMenu();
  const { mutate: logout, isPending: logoutPending } = useLogout();
  const activeLinkRef = useRef<HTMLAnchorElement | null>(null);

  const tabs = useMemo(() => {
    const roots = menuItems.filter(isRootListItem).filter((item) => {
      const name = typeof item.name === "string" ? item.name : "";
      return name && canAccessResource(name);
    });
    const fromMenu = roots.map((item) => ({
      key: String(item.key ?? item.name ?? item.route),
      label: item.label ?? item.name ?? item.route,
      route: item.route as string,
    }));
    const dashboardTab = canAccessResource("dashboard")
      ? [{ key: "dashboard", label: "Dashboard", route: "/" }]
      : [];
    return [...dashboardTab, ...fromMenu, { key: "profile", label: "Profile", route: "/profile" }];
  }, [menuItems]);

  useEffect(() => {
    if (isDesktop) return;
    activeLinkRef.current?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [location.pathname, isDesktop, tabs]);

  if (isDesktop) return null;

  return (
    <Paper
      component="nav"
      aria-label="Main navigation"
      square
      elevation={4}
      sx={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: theme.zIndex.drawer + 2,
        borderTop: (t) => `1px solid ${t.palette.divider}`,
        pt: "12px",
        px: "6px",
        pb: "calc(12px + env(safe-area-inset-bottom, 0px))",
        bgcolor: "background.paper",
        boxShadow: "0 -2px 12px rgba(0, 0, 0, 0.06)",
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "row",
          flexWrap: "nowrap",
          gap: 0.5,
          overflowX: "auto",
          overflowY: "hidden",
          WebkitOverflowScrolling: "touch",
          pb: 0.5,
          scrollbarWidth: "thin",
          "&::-webkit-scrollbar": { height: 4 },
        }}
      >
        {tabs.map((tab) => {
          const active = isTabActive(tab.route, location.pathname);
          return (
            <Box
              key={tab.key}
              component={RouterLink}
              to={tab.route}
              ref={active ? activeLinkRef : undefined}
              sx={{
                flex: "0 0 auto",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                px: 1.25,
                py: 0.75,
                minHeight: 44,
                borderRadius: 2,
                fontSize: "0.75rem",
                lineHeight: 1.15,
                fontWeight: active ? 600 : 500,
                color: active ? "text.primary" : "text.secondary",
                bgcolor: active ? "action.selected" : "transparent",
                textDecoration: "none",
                whiteSpace: "nowrap",
                WebkitTapHighlightColor: "transparent",
                "&:active": {
                  opacity: 0.85,
                },
              }}
            >
              {tab.label}
            </Box>
          );
        })}
        <Box
          component="button"
          type="button"
          aria-label="Log out"
          disabled={logoutPending}
          onClick={() => logout()}
          sx={{
            flex: "0 0 auto",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            px: 1.25,
            py: 0.75,
            minHeight: 44,
            borderRadius: 2,
            border: "none",
            margin: 0,
            cursor: logoutPending ? "default" : "pointer",
            fontFamily: "inherit",
            fontSize: "0.75rem",
            lineHeight: 1.15,
            fontWeight: 500,
            color: "error.main",
            bgcolor: "transparent",
            whiteSpace: "nowrap",
            WebkitTapHighlightColor: "transparent",
            "&:active": {
              opacity: logoutPending ? 1 : 0.85,
            },
            "&:disabled": {
              opacity: 0.6,
            },
          }}
        >
          {logoutPending ? "…" : "Logout"}
        </Box>
      </Box>
    </Paper>
  );
};
