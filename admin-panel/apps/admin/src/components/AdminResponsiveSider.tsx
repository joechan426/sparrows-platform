import React from "react";
import { useMediaQuery } from "@mui/material";
import { ThemedSider } from "@refinedev/mui";

type ThemedSiderProps = React.ComponentProps<typeof ThemedSider>;

/** Desktop (≥1025px): default Refine sidebar. Compact: hidden — use bottom tab bar instead. */
export const AdminResponsiveSider: React.FC<ThemedSiderProps> = (props) => {
  const isDesktop = useMediaQuery("(min-width:1025px)");
  if (!isDesktop) return null;
  return <ThemedSider {...props} />;
};
