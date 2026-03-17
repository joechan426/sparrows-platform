import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import { useNavigate } from "react-router-dom";

export const NoAccessPage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <Box sx={{ p: 3, textAlign: "center" }}>
      <Typography variant="h6" gutterBottom>
        No access
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        You do not have permission to access any section. Please contact an administrator to assign you at least one module.
      </Typography>
      <Button variant="contained" onClick={() => navigate("/")}>
        Back to home
      </Button>
    </Box>
  );
};
