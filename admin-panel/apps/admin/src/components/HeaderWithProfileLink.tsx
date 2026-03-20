import React from "react";
import { useGetIdentity } from "@refinedev/core";
import { Link } from "react-router-dom";
import AppBar from "@mui/material/AppBar";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import { HamburgerMenu } from "@refinedev/mui";

export const HeaderWithProfileLink: React.FC<{ sticky?: boolean }> = ({
  sticky = true,
}) => {
  const { data: user } = useGetIdentity();

  return (
    <AppBar position={sticky ? "sticky" : "relative"}>
      <Toolbar>
        <HamburgerMenu />
        <Stack
          direction="row"
          width="100%"
          justifyContent="flex-end"
          alignItems="center"
        >
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
