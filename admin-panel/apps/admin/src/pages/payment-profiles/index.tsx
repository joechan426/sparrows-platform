import React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Divider from "@mui/material/Divider";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import DialogContentText from "@mui/material/DialogContentText";
import { useNotification } from "@refinedev/core";
import { getToken } from "../../lib/admin-auth";
import { apiUrl } from "../../lib/api-base";

type ProfileRow = {
  id: string;
  nickname: string;
  isActive: boolean;
  stripeConnected: boolean;
  stripeChargesEnabled: boolean;
  stripeDetailsSubmitted?: boolean;
  paypalRestAppConnected: boolean;
};

type StatusTone = "green" | "orange" | "red";

const HIGHLIGHT: Record<
  StatusTone,
  React.ComponentProps<typeof Typography>["sx"]
> = {
  green: {
    fontWeight: 700,
    color: "success.dark",
    bgcolor: "rgba(46, 125, 50, 0.2)",
    px: 1.25,
    py: 0.75,
    borderRadius: 1,
    display: "inline-block",
    boxShadow: "0 0 14px rgba(76, 175, 80, 0.55)",
  },
  orange: {
    fontWeight: 700,
    color: "warning.dark",
    bgcolor: "rgba(237, 108, 2, 0.22)",
    px: 1.25,
    py: 0.75,
    borderRadius: 1,
    display: "inline-block",
    boxShadow: "0 0 14px rgba(255, 152, 0, 0.45)",
  },
  red: {
    fontWeight: 700,
    color: "error.dark",
    bgcolor: "rgba(211, 47, 47, 0.2)",
    px: 1.25,
    py: 0.75,
    borderRadius: 1,
    display: "inline-block",
    boxShadow: "0 0 14px rgba(244, 67, 54, 0.55)",
  },
};

function stripeStatus(row: ProfileRow): { label: string; tone: StatusTone } {
  if (row.stripeChargesEnabled) return { label: "Ready", tone: "green" };
  if (row.stripeConnected && row.stripeDetailsSubmitted) return { label: "Connected", tone: "orange" };
  if (row.stripeConnected) return { label: "Onboarding", tone: "red" };
  return { label: "Not connected", tone: "orange" };
}

function paypalStatus(row: ProfileRow): { label: string; tone: StatusTone } {
  if (row.paypalRestAppConnected) return { label: "Ready", tone: "green" };
  return { label: "Not set", tone: "orange" };
}

export const PaymentProfilesPage: React.FC = () => {
  const { open } = useNotification();
  const [rows, setRows] = React.useState<ProfileRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [newNickname, setNewNickname] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [paypalIdByProfile, setPaypalIdByProfile] = React.useState<Record<string, string>>({});
  const [paypalSecretByProfile, setPaypalSecretByProfile] = React.useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = React.useState<ProfileRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const syncStripeStatusForRows = React.useCallback(async (token: string, baseRows: ProfileRow[]) => {
    const targets = baseRows.filter((r) => r.stripeConnected && !r.stripeChargesEnabled);
    if (targets.length === 0) return;

    const updates: Record<string, { stripeChargesEnabled: boolean; stripeDetailsSubmitted: boolean }> = {};

    await Promise.all(
      targets.map(async (r) => {
        try {
          const res = await fetch(apiUrl(`/payment-profiles/${r.id}/stripe/status`), {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) return;
          if (typeof data.chargesEnabled !== "boolean" || typeof data.detailsSubmitted !== "boolean") return;
          updates[r.id] = { stripeChargesEnabled: data.chargesEnabled, stripeDetailsSubmitted: data.detailsSubmitted };
        } catch {
          // Ignore individual failures; other profiles should still render.
        }
      }),
    );

    const hasAnyUpdate = Object.keys(updates).length > 0;
    if (!hasAnyUpdate) return;

    setRows((prev) =>
      prev.map((r) => {
        const u = updates[r.id];
        if (!u) return r;
        return { ...r, stripeChargesEnabled: u.stripeChargesEnabled, stripeDetailsSubmitted: u.stripeDetailsSubmitted };
      }),
    );
  }, []);

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
      const nextRows = Array.isArray(data) ? data : [];
      setRows(nextRows);
      void syncStripeStatusForRows(token, nextRows);
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
      open?.({ type: "success", message: "Payment profile created." });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Create failed";
      setError(message);
      open?.({ type: "error", message });
    } finally {
      setCreating(false);
    }
  };

  const setProfileActive = async (id: string, isActive: boolean) => {
    const token = getToken();
    if (!token) return;
    setError(null);
    try {
      const res = await fetch(apiUrl(`/payment-profiles/${id}`), {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message ?? "Update failed");
      }
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, isActive } : r)));
      open?.({ type: "success", message: `Profile ${isActive ? "activated" : "deactivated"}.` });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Update failed";
      setError(message);
      open?.({ type: "error", message });
      await load();
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const token = getToken();
    if (!token) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/payment-profiles/${deleteTarget.id}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message ?? "Delete failed");
      }
      setDeleteTarget(null);
      await load();
      open?.({ type: "success", message: "Payment profile deleted." });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Delete failed";
      setError(message);
      open?.({ type: "error", message });
    } finally {
      setDeleting(false);
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
        open?.({ type: "progress", message: "Redirecting to Stripe onboarding..." });
        window.location.href = data.url;
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Stripe onboarding failed";
      setError(message);
      open?.({ type: "error", message });
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
    <Box sx={{ p: 2, maxWidth: 720, mx: "auto" }}>
      <Typography variant="h5" gutterBottom>
        Payment profiles
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Inactive profiles are hidden from the paid-event payment account picker. Delete is blocked if any event still
        uses the profile.
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
      ) : rows.length === 0 ? (
        <Typography color="text.secondary">No payment profiles yet.</Typography>
      ) : (
        <Stack spacing={1}>
          {rows.map((r) => {
            const st = stripeStatus(r);
            const pp = paypalStatus(r);
            return (
              <Accordion key={r.id} defaultExpanded disableGutters>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={2}
                    alignItems={{ sm: "center" }}
                    sx={{ width: "100%", pr: 1 }}
                  >
                    <Typography fontWeight={600}>{r.nickname}</Typography>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Typography sx={HIGHLIGHT[st.tone]} variant="body2">
                        Stripe: {st.label}
                      </Typography>
                      <Typography sx={HIGHLIGHT[pp.tone]} variant="body2">
                        PayPal: {pp.label}
                      </Typography>
                      {!r.isActive && <Chip label="Inactive (hidden in events)" size="small" color="default" />}
                    </Stack>
                    <Box sx={{ flexGrow: 1 }} />
                    <FormControlLabel
                      control={
                        <Switch
                          checked={r.isActive}
                          onChange={(e) => {
                            e.stopPropagation();
                            void setProfileActive(r.id, e.target.checked);
                          }}
                          color="primary"
                        />
                      }
                      label="Active"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  <Stack spacing={3}>
                    <Box>
                      <Typography variant="subtitle2" gutterBottom>
                        Stripe Connect
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                        Status:{" "}
                        <Box component="span" sx={HIGHLIGHT[st.tone]}>
                          {st.label}
                        </Box>
                      </Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Button size="small" variant="outlined" onClick={() => void startStripe(r.id)}>
                          Connect or continue onboarding
                        </Button>
                        <Button
                          size="small"
                          color="warning"
                          variant="outlined"
                          onClick={() => void disconnectStripe(r.id)}
                          disabled={!r.stripeConnected}
                        >
                          Disconnect Stripe
                        </Button>
                      </Stack>
                    </Box>

                    <Divider />

                    <Box>
                      <Typography variant="subtitle2" gutterBottom>
                        PayPal REST app
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                        Status:{" "}
                        <Box component="span" sx={HIGHLIGHT[pp.tone]}>
                          {pp.label}
                        </Box>
                      </Typography>
                      <Stack spacing={1.5} sx={{ maxWidth: 400 }}>
                        <TextField
                          size="small"
                          label="Client ID"
                          value={paypalIdByProfile[r.id] ?? ""}
                          onChange={(e) =>
                            setPaypalIdByProfile((p) => ({ ...p, [r.id]: e.target.value }))
                          }
                          fullWidth
                        />
                        <TextField
                          size="small"
                          label="Secret"
                          type="password"
                          value={paypalSecretByProfile[r.id] ?? ""}
                          onChange={(e) =>
                            setPaypalSecretByProfile((p) => ({ ...p, [r.id]: e.target.value }))
                          }
                          fullWidth
                        />
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
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
                    </Box>

                    <Divider />

                    <Box>
                      <Button color="error" variant="outlined" onClick={() => setDeleteTarget(r)}>
                        Delete profile
                      </Button>
                    </Box>
                  </Stack>
                </AccordionDetails>
              </Accordion>
            );
          })}
        </Stack>
      )}

      <Dialog open={deleteTarget != null} onClose={() => !deleting && setDeleteTarget(null)}>
        <DialogTitle>Delete payment profile?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Remove &quot;{deleteTarget?.nickname}&quot;? Events still linked to this profile must be updated first.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={() => void confirmDelete()} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
