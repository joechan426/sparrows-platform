import React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Stack from "@mui/material/Stack";
import { getToken } from "../../lib/admin-auth";
import { apiUrl } from "../../lib/api-base";

type ProfileRow = {
  id: string;
  nickname: string;
  stripeConnected: boolean;
  stripeChargesEnabled: boolean;
  paypalRestAppConnected: boolean;
};

export const PaymentProfilesPage: React.FC = () => {
  const [rows, setRows] = React.useState<ProfileRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [newNickname, setNewNickname] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [paypalIdByProfile, setPaypalIdByProfile] = React.useState<Record<string, string>>({});
  const [paypalSecretByProfile, setPaypalSecretByProfile] = React.useState<Record<string, string>>({});

  const load = React.useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/payment-profiles"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        throw new Error(data?.message ?? "Failed to load payment profiles");
      }
      setRows(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const createProfile = async () => {
    const token = getToken();
    if (!token) return;
    const nickname = newNickname.trim();
    if (!nickname) {
      setError("Enter a nickname for the new payment profile.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/payment-profiles"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ nickname }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message ?? "Create failed");
      }
      setNewNickname("");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const startStripe = async (profileId: string) => {
    const token = getToken();
    if (!token) return;
    setError(null);
    try {
      const res = await fetch(apiUrl(`/payment-profiles/${profileId}/stripe/onboarding`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message ?? "Stripe onboarding failed");
      }
      if (typeof data.url === "string") {
        window.location.href = data.url;
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Stripe onboarding failed");
    }
  };

  const disconnectStripe = async (profileId: string) => {
    const token = getToken();
    if (!token) return;
    setError(null);
    try {
      const res = await fetch(apiUrl(`/payment-profiles/${profileId}/stripe/disconnect`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message ?? "Disconnect failed");
      }
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Disconnect failed");
    }
  };

  const savePayPal = async (profileId: string) => {
    const token = getToken();
    if (!token) return;
    const clientId = (paypalIdByProfile[profileId] ?? "").trim();
    const clientSecret = (paypalSecretByProfile[profileId] ?? "").trim();
    if (!clientId || !clientSecret) {
      setError("PayPal Client ID and Secret are required.");
      return;
    }
    setError(null);
    try {
      const res = await fetch(apiUrl(`/payment-profiles/${profileId}/paypal`), {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paypalRestClientId: clientId,
          paypalRestClientSecret: clientSecret,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message ?? "PayPal save failed");
      }
      setPaypalIdByProfile((p) => ({ ...p, [profileId]: "" }));
      setPaypalSecretByProfile((p) => ({ ...p, [profileId]: "" }));
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "PayPal save failed");
    }
  };

  const clearPayPal = async (profileId: string) => {
    const token = getToken();
    if (!token) return;
    setError(null);
    try {
      const res = await fetch(apiUrl(`/payment-profiles/${profileId}/paypal`), {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paypalRestClientId: null,
          paypalRestClientSecret: null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message ?? "Clear PayPal failed");
      }
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Clear PayPal failed");
    }
  };

  return (
    <Box sx={{ p: 2, maxWidth: 960, mx: "auto" }}>
      <Typography variant="h5" gutterBottom>
        Payment profiles
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Super Managers connect Stripe and PayPal here. Each profile has a nickname managers select when creating paid
        events.
      </Typography>

      {error && (
        <Typography color="error" variant="body2" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>
            New profile
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
            <TextField
              label="Nickname"
              value={newNickname}
              onChange={(e) => setNewNickname(e.target.value)}
              size="small"
              fullWidth
              placeholder="e.g. Main club account"
            />
            <Button variant="contained" onClick={() => void createProfile()} disabled={creating}>
              {creating ? "Creating…" : "Create"}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {loading ? (
        <Typography>Loading…</Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Nickname</TableCell>
              <TableCell>Stripe</TableCell>
              <TableCell>PayPal REST</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography variant="body2" color="text.secondary">
                    No payment profiles yet. Create one above.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.nickname}</TableCell>
                <TableCell>
                  {r.stripeChargesEnabled ? "Ready" : r.stripeConnected ? "Onboarding…" : "Not connected"}
                </TableCell>
                <TableCell>{r.paypalRestAppConnected ? "Connected" : "Not set"}</TableCell>
                <TableCell align="right">
                  <Stack spacing={1} alignItems="flex-end">
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Button size="small" variant="outlined" onClick={() => void startStripe(r.id)}>
                        Stripe connect
                      </Button>
                      <Button
                        size="small"
                        color="warning"
                        variant="outlined"
                        onClick={() => void disconnectStripe(r.id)}
                        disabled={!r.stripeConnected}
                      >
                        Stripe disconnect
                      </Button>
                    </Stack>
                    <TextField
                      size="small"
                      label="PayPal Client ID"
                      value={paypalIdByProfile[r.id] ?? ""}
                      onChange={(e) =>
                        setPaypalIdByProfile((p) => ({ ...p, [r.id]: e.target.value }))
                      }
                      sx={{ minWidth: 220 }}
                    />
                    <TextField
                      size="small"
                      label="PayPal Secret"
                      type="password"
                      value={paypalSecretByProfile[r.id] ?? ""}
                      onChange={(e) =>
                        setPaypalSecretByProfile((p) => ({ ...p, [r.id]: e.target.value }))
                      }
                      sx={{ minWidth: 220 }}
                    />
                    <Stack direction="row" spacing={1}>
                      <Button size="small" variant="contained" onClick={() => void savePayPal(r.id)}>
                        Save PayPal
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        onClick={() => void clearPayPal(r.id)}
                        disabled={!r.paypalRestAppConnected}
                      >
                        Clear PayPal
                      </Button>
                    </Stack>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  );
};
