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
  const [form, setForm] = React.useState<{
    title: string;
    startAt: string;
    endAt: string;
    location: string;
    description: string;
  }>({
    title: "",
    startAt: "",
    endAt: "",
    location: "",
    description: "",
  });

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
    });
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
