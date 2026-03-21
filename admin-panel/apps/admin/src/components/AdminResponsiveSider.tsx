import React from "react";
import { useMediaQuery } from "@mui/material";
import { AdminThemedSider } from "./AdminThemedSider";

type AdminThemedSiderProps = React.ComponentProps<typeof AdminThemedSider>;

/** Desktop (≥1025px): sidebar with menu filtered by module access. Compact: hidden — use bottom tab bar instead. */
export const AdminResponsiveSider: React.FC<AdminThemedSiderProps> = (props) => {
  const isDesktop = useMediaQuery("(min-width:1025px)");
  if (!isDesktop) return null;
  return <AdminThemedSider {...props} />;
};
