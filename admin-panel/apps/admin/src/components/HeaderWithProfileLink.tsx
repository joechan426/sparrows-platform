import React from "react";
import { useGetIdentity } from "@refinedev/core";
import { Link } from "react-router-dom";
import AppBar from "@mui/material/AppBar";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import InputBase from "@mui/material/InputBase";
import useMediaQuery from "@mui/material/useMediaQuery";
import { HamburgerMenu } from "@refinedev/mui";
import SearchIcon from "@mui/icons-material/Search";

export const HeaderWithProfileLink: React.FC<{ sticky?: boolean }> = ({
  sticky = true,
}) => {
  const { data: user } = useGetIdentity();
  /** Match sparrowsweb: ≤1024px uses bottom tab bar instead of drawer. */
  const showSiderHamburger = useMediaQuery("(min-width:1025px)");

  return (
    <AppBar position={sticky ? "sticky" : "relative"}>
      <Toolbar>
        {showSiderHamburger ? <HamburgerMenu /> : null}
        <Stack
          direction="row"
          width="100%"
          justifyContent="space-between"
          alignItems="center"
          gap={1}
        >
          <Box
            sx={{
              display: { xs: "none", md: "flex" },
              alignItems: "center",
              gap: 1,
              px: 1.25,
              py: 0.5,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              minWidth: 260,
              bgcolor: "background.paper",
            }}
          >
            <SearchIcon fontSize="small" sx={{ color: "text.secondary" }} />
            <InputBase
              placeholder="Quick search…"
              inputProps={{ "aria-label": "quick search" }}
              sx={{ fontSize: 14, width: "100%" }}
            />
          </Box>
          <Stack
            direction="row"
            gap="16px"
            alignItems="center"
            justifyContent="center"
          >
            {user?.name && (
              <Button
                component={Link}
                to="/profile"
                variant="contained"
                sx={{
                  textTransform: "none",
                  px: 1,
                  backgroundColor: "#0b2f6b",
                  color: "#ffffff",
                  boxShadow: "0px 3px 10px rgba(0,0,0,0.25)",
                  borderRadius: "8px",
                  "&:hover": {
                    backgroundColor: "#08306b",
                    boxShadow: "0px 5px 16px rgba(0,0,0,0.28)",
                  },
                }}
                data-testid="header-user-name"
              >
                <Typography variant="subtitle2" component="span" sx={{ color: "inherit" }}>
                  {user.name}
                </Typography>
              </Button>
            )}
            {user?.avatar && <Avatar src={user?.avatar} alt={user?.name} />}
          </Stack>
        </Stack>
      </Toolbar>
    </AppBar>
  );
};
