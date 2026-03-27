import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import MuiLink from "@mui/material/Link";
import { getStoredAdmin, setAuth, getToken, hasPermission } from "../lib/admin-auth";
import { validateAdminPassword } from "../lib/password-rules";
import { axiosWithAuth } from "../lib/axiosWithAuth";
import { getFirstAccessiblePath } from "../lib/authProvider";

type FormValues = { userName: string; newPassword: string };

export const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const current = getStoredAdmin();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      userName: current?.userName ?? "",
      newPassword: "",
    },
  });

  if (!current) {
    navigate("/login", { replace: true });
    return null;
  }

  const onSubmit = async (data: FormValues) => {
    setSubmitError(null);
    const userName = typeof data.userName === "string" ? data.userName.trim() : "";
    const newPassword = typeof data.newPassword === "string" ? data.newPassword.trim() : "";

    if (!userName) {
      setSubmitError("User name is required.");
      return;
    }

    if (newPassword.length > 0) {
      const valid = validateAdminPassword(newPassword);
      if (!valid.ok) {
        setSubmitError(valid.message);
        return;
      }
    }

    try {
      const payload: { userName: string; newPassword?: string } = { userName };
      if (newPassword) payload.newPassword = newPassword;

      await axiosWithAuth.patch(`/admin-users/${current.id}`, {
        data: payload,
      });

      const token = getToken();
      if (token && userName !== current.userName) {
        setAuth(token, {
          ...current,
          userName,
        });
      }
      navigate(getFirstAccessiblePath(), { replace: true });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Failed to update profile.";
      setSubmitError(message);
    }
  };

  return (
    <Box sx={{ p: 2, maxWidth: 480, mx: "auto" }}>
      <Card>
        <CardContent sx={{ "&:last-child": { pb: 3 } }}>
          <Typography variant="h6" gutterBottom>
            My profile
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Change your user name and/or password. Leave password blank to keep the current one.
          </Typography>
          {current.role === "ADMIN" && (
            <Typography variant="body2" sx={{ mb: 2 }}>
              <MuiLink component={RouterLink} to={`/admin-users/${current.id}/edit`}>
                Customize which pages appear in your menu
              </MuiLink>
            </Typography>
          )}
          {hasPermission("PAYMENT_PROFILES") && (
            <Typography variant="body2" sx={{ mb: 2 }}>
              <MuiLink component={RouterLink} to="/payment-profiles">
                Payment profiles (Stripe / PayPal)
              </MuiLink>
            </Typography>
          )}
          {hasPermission("CALENDAR_EVENTS") && (
            <Typography variant="body2" sx={{ mb: 2 }}>
              <MuiLink component={RouterLink} to="/maintenance/cleanup-awaiting-payments">
                Maintenance: clean up stale unpaid event registrations
              </MuiLink>
            </Typography>
          )}
          {current.role === "ADMIN" && (
            <Typography variant="body2" sx={{ mb: 2 }}>
              <MuiLink component={RouterLink} to="/payments">
                Payments (paid event revenue)
              </MuiLink>
            </Typography>
          )}
          <Box
            component="form"
            onSubmit={handleSubmit(onSubmit)}
            sx={{ display: "flex", flexDirection: "column", gap: 2 }}
          >
            {submitError && (
              <Typography color="error" variant="body2">
                {submitError}
              </Typography>
            )}
            <TextField
              label="User name"
              {...register("userName", { required: "Required" })}
              error={!!errors.userName}
              helperText={errors.userName?.message}
              fullWidth
              autoComplete="username"
            />
            <TextField
              label="New password (leave blank to keep current)"
              type="password"
              {...register("newPassword")}
              fullWidth
              autoComplete="new-password"
              helperText="At least 8 characters with letter, number and special symbol."
            />
            <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <Button variant="outlined" onClick={() => navigate(-1)} disabled={isSubmitting}>
                Back
              </Button>
              <Button type="submit" variant="contained" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : "Save"}
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};
