import React, { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import { Link as RouterLink } from "react-router-dom";
import { useNotification } from "@refinedev/core";
import { getToken } from "../../lib/admin-auth";
import { apiUrl } from "../../lib/api-base";

export const CleanupAwaitingPaymentsPage: React.FC = () => {
  const { open: notify } = useNotification();
  const [minAgeHours, setMinAgeHours] = useState(String(168));
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const run = async () => {
    const hours = Math.max(24, Math.floor(Number(minAgeHours) || 168));
    setMinAgeHours(String(hours));
    const token = getToken();
    if (!token) {
      notify?.({ type: "error", message: "Not logged in" });
      return;
    }
    setLoading(true);
    setLastResult(null);
    try {
      const res = await fetch(apiUrl("/maintenance/cleanup-awaiting-payment-registrations"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ minAgeHours: hours, dryRun }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify?.({ type: "error", message: data?.message ?? "Request failed" });
        setLastResult(typeof data?.error === "string" ? data.error : null);
        return;
      }
      if (data.dryRun) {
        const msg = `Dry run: ${data.wouldDelete ?? 0} registration(s) would be removed (older than ${data.minAgeHours}h before ${data.cutoff}).`;
        notify?.({ type: "success", message: msg });
        setLastResult(msg);
      } else {
        const msg = `Deleted ${data.deletedCount ?? 0} stale AWAITING_PAYMENT registration(s).`;
        notify?.({ type: "success", message: msg });
        setLastResult(msg);
      }
    } catch (e) {
      notify?.({ type: "error", message: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 2, maxWidth: 560, mx: "auto" }}>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Clean up stale unpaid registrations
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            Removes rows in <strong>AWAITING_PAYMENT</strong> whose{" "}
            <strong>createdAt</strong> is older than the threshold (legacy abandoned checkouts).
            Minimum age is <strong>24 hours</strong>; default is <strong>168 hours</strong> (7 days).
          </Typography>
          <Stack spacing={2}>
            <TextField
              label="Minimum age (hours)"
              type="number"
              size="small"
              inputProps={{ min: 24, max: 8760 }}
              value={minAgeHours}
              onChange={(e) => setMinAgeHours(e.target.value)}
              helperText="Only registrations created before this window are deleted."
            />
            <FormControlLabel
              control={<Checkbox checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />}
              label="Dry run (count only, do not delete)"
            />
            <Button variant="contained" onClick={() => void run()} disabled={loading}>
              {loading ? "Running…" : dryRun ? "Preview count" : "Delete stale rows"}
            </Button>
            {lastResult && (
              <Typography variant="body2" color="text.secondary">
                {lastResult}
              </Typography>
            )}
            <Button component={RouterLink} to="/events" variant="text" size="small">
              Back to Events
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
};
