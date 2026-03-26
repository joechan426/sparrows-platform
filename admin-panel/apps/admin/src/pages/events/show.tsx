import React from "react";
import { useParams, Link as RouterLink, useNavigate } from "react-router-dom";
import { useUpdate, useDelete } from "@refinedev/core";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Stack from "@mui/material/Stack";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import { useNotification } from "@refinedev/core";
import { apiUrl } from "../../lib/api-base";
import { getStoredAdmin, getToken } from "../../lib/admin-auth";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import CircularProgress from "@mui/material/CircularProgress";

type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  location: string | null;
  sportType: string;
  eventType: string;
  registrationOpen: boolean;
  capacity: number | null;
  isPaid?: boolean;
  priceCents?: number | null;
  currency?: string;
  paymentAccountAdminId?: string | null;
};

export const EventShowPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { open } = useNotification();
  const { mutate: deleteOne } = useDelete();
  const { mutate: update } = useUpdate();
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [event, setEvent] = React.useState<CalendarEvent | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const selfAdmin = getStoredAdmin();
  const [form, setForm] = React.useState<{
    title: string;
    startAt: string;
    endAt: string;
    location: string;
    description: string;
    isPaid: boolean;
    priceCents: string;
    currency: string;
    paymentAccountAdminId: string;
  }>({
    title: "",
    startAt: "",
    endAt: "",
    location: "",
    description: "",
    isPaid: false,
    priceCents: "",
    currency: "AUD",
    paymentAccountAdminId: "",
  });

  const [paymentRecipients, setPaymentRecipients] = React.useState<{ id: string; userName: string }[]>([]);
  const [recipientsLoading, setRecipientsLoading] = React.useState(false);

  React.useEffect(() => {
    if (!id) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setEvent(null);
    setIsLoading(true);
    fetch(apiUrl(`/calendar-events/${id}`))
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        if (body && typeof body === "object" && "id" in body) {
          setEvent(body as CalendarEvent);
        } else {
          setEvent(null);
        }
      })
      .catch(() => {
        if (!cancelled) setEvent(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  React.useEffect(() => {
    if (!event) return;
    const toLocalInput = (iso: string | null) => {
      if (!iso) return "";
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    };
    setForm({
      title: event.title ?? "",
      startAt: toLocalInput(event.startAt),
      endAt: toLocalInput(event.endAt),
      location: event.location ?? "",
      description: event.description ?? "",
      isPaid: Boolean(event.isPaid),
      priceCents: event.priceCents != null ? String(event.priceCents) : "",
      currency: event.currency ?? "AUD",
      paymentAccountAdminId: event.paymentAccountAdminId ?? "",
    });
  }, [event]);

  React.useEffect(() => {
    if (!event) return;
    const token = getToken();
    if (!token) return;
    setRecipientsLoading(true);
    if (selfAdmin && selfAdmin.role !== "ADMIN") {
      setPaymentRecipients([{ id: selfAdmin.id, userName: selfAdmin.userName }]);
      setRecipientsLoading(false);
      return;
    }
    fetch(apiUrl("/admin-users"), {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        const admins = Array.isArray(data) ? data : [];
        setPaymentRecipients(
          admins
            .filter(
              (a: any) => Array.isArray(a.permissions) && a.permissions.includes("CALENDAR_EVENTS"),
            )
            .map((a: any) => ({ id: String(a.id), userName: String(a.userName) })),
        );
      })
      .catch(() => setPaymentRecipients([]))
      .finally(() => setRecipientsLoading(false));
  }, [event]);

  const handleSave = () => {
    if (!id || !event) return;
    const fromLocalInput = (value: string): Date | null => {
      if (!value.trim()) return null;
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const startDate = fromLocalInput(form.startAt);
    const endDate = fromLocalInput(form.endAt);
    if (!startDate || !endDate) {
      open?.({ type: "error", message: "Start and end time must be valid." });
      return;
    }
    if (endDate.getTime() <= startDate.getTime()) {
      open?.({ type: "error", message: "End time must be after start time." });
      return;
    }
    setSaving(true);
    update(
      {
        resource: "calendar-events",
        id,
        values: {
          title: form.title.trim() || event.title,
          description: form.description.trim() || null,
          location: form.location.trim() || null,
          startAt: startDate,
          endAt: endDate,
          isPaid: form.isPaid,
          priceCents: form.isPaid
            ? form.priceCents.trim() === ""
              ? null
              : Number(form.priceCents)
            : null,
          currency: "AUD",
          paymentAccountAdminId: form.isPaid ? (form.paymentAccountAdminId || null) : null,
          registrationOpen: event.registrationOpen,
        },
      },
      {
        onSuccess: () => {
          open?.({ type: "success", message: "Event updated" });
          setEvent((prev) =>
            prev
              ? {
                  ...prev,
                  title: form.title.trim() || prev.title,
                  description: form.description.trim() || null,
                  location: form.location.trim() || null,
                  startAt: startDate.toISOString(),
                  endAt: endDate.toISOString(),
                  isPaid: form.isPaid,
                  priceCents: form.isPaid ? (form.priceCents.trim() === "" ? null : Number(form.priceCents)) : null,
                  currency: "AUD",
                  paymentAccountAdminId: form.isPaid ? (form.paymentAccountAdminId || null) : null,
                }
              : prev,
          );
        },
        onError: (e) => {
          open?.({
            type: "error",
            message: (e as any)?.message ?? "Failed to update event",
          });
        },
        onSettled: () => setSaving(false),
      },
    );
  };

  if (isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography>Loading…</Typography>
      </Box>
    );
  }
  if (!event) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="text.secondary">Event not found.</Typography>
        <Button component={RouterLink} to="/events" sx={{ mt: 1 }}>Back to events</Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, maxWidth: 720 }}>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap">
        <Button component={RouterLink} to="/events" variant="outlined" color="primary">
          Back to events
        </Button>
        <Button component={RouterLink} to={`/events/${id}/registrations`} variant="contained" color="primary">
          View registrations
        </Button>
        <Button color="error" variant="outlined" onClick={() => setDeleteOpen(true)}>
          Delete event
        </Button>
      </Stack>

      <Paper sx={{ p: 2 }}>
        <TextField
          label="Title"
          fullWidth
          margin="normal"
          value={form.title}
          onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
        />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            label="Start time"
            type="datetime-local"
            margin="normal"
            fullWidth
            InputLabelProps={{ shrink: true }}
            value={form.startAt}
            onChange={(e) => setForm((prev) => ({ ...prev, startAt: e.target.value }))}
          />
          <TextField
            label="End time"
            type="datetime-local"
            margin="normal"
            fullWidth
            InputLabelProps={{ shrink: true }}
            value={form.endAt}
            onChange={(e) => setForm((prev) => ({ ...prev, endAt: e.target.value }))}
          />
        </Stack>
        <TextField
          label="Location"
          fullWidth
          margin="normal"
          value={form.location}
          onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
        />
        <TextField
          label="Description"
          fullWidth
          margin="normal"
          multiline
          minRows={3}
          value={form.description}
          onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
        />
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2">Classification</Typography>
          <Typography variant="body2">
            Sport: {event.sportType} · Event type: {event.eventType} · Registration{" "}
            {event.registrationOpen ? "Open" : "Closed"}
          </Typography>
        </Box>

        <Box sx={{ mt: 2 }}>
          <FormControlLabel
            control={
              <Switch
                checked={form.isPaid}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setForm((prev) => ({
                    ...prev,
                    isPaid: checked,
                    priceCents: checked ? prev.priceCents : "",
                    paymentAccountAdminId: checked ? prev.paymentAccountAdminId : "",
                  }));
                }}
                disabled={Boolean(event.isPaid && event.paymentAccountAdminId && getStoredAdmin()?.role !== "ADMIN" && getStoredAdmin()?.id !== event.paymentAccountAdminId)}
              />
            }
            label="Paid event (checkout required before approval)"
          />

          {form.isPaid && (
            <Box sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 2 }}>
              <TextField
                label="Price (AUD cents, e.g. 100 = $1)"
                type="number"
                inputProps={{ min: 0 }}
                value={form.priceCents}
                onChange={(e) => setForm((prev) => ({ ...prev, priceCents: e.target.value }))}
                disabled={Boolean(event.isPaid && event.paymentAccountAdminId && getStoredAdmin()?.role !== "ADMIN" && getStoredAdmin()?.id !== event.paymentAccountAdminId)}
              />

              <FormControl fullWidth>
                <InputLabel id="paymentRecipientLabel2">Payment recipient manager</InputLabel>
                <Select
                  labelId="paymentRecipientLabel2"
                  label="Payment recipient manager"
                  value={form.paymentAccountAdminId}
                  onChange={(e) => setForm((prev) => ({ ...prev, paymentAccountAdminId: String(e.target.value) }))}
                  disabled={
                    Boolean(event.isPaid && event.paymentAccountAdminId && getStoredAdmin()?.role !== "ADMIN" && getStoredAdmin()?.id !== event.paymentAccountAdminId) ||
                    recipientsLoading
                  }
                >
                  {recipientsLoading && (
                    <MenuItem value="">
                      <CircularProgress size={16} /> Loading…
                    </MenuItem>
                  )}
                  {!recipientsLoading && paymentRecipients.length === 0 && (
                    <MenuItem value="" disabled>
                      No eligible managers found
                    </MenuItem>
                  )}
                  {paymentRecipients.map((m) => (
                    <MenuItem key={m.id} value={m.id}>
                      {m.userName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          )}
        </Box>
        <Box sx={{ mt: 2 }}>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </Box>
      </Paper>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Delete event?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Delete &quot;{event.title}&quot;? All registrations for this event will be removed. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              deleteOne(
                { resource: "calendar-events", id: id! },
                {
                  onSuccess: () => {
                    open?.({ type: "success", message: "Event deleted" });
                    navigate("/events");
                  },
                  onError: (e) => open?.({ type: "error", message: (e as any)?.message ?? "Delete failed" }),
                },
              );
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
