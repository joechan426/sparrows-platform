import React from "react";
import { Link } from "react-router-dom";
import Typography from "@mui/material/Typography";
import { getFirstAccessiblePath } from "../lib/authProvider";

/**
 * Brand / title link: goes to first accessible module (dashboard is not shown).
 */
export const AdminHomeLink: React.FC = () => {
  const to = getFirstAccessiblePath();
  return (
    <Link to={to} style={{ textDecoration: "none" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          minHeight: 64,
        }}
      >
        <img
          src="/asset/img/Sparrow_FullLogo.png"
          alt="Sparrows Platform"
          style={{ height: 32, objectFit: "contain" }}
        />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <Typography variant="subtitle1" component="span" color="primary" sx={{ lineHeight: 1.2 }}>
            Sparrows Admin Panel
          </Typography>
        </div>
      </div>
    </Link>
  );
};
