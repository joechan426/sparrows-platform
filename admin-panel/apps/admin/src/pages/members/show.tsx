import React, { useEffect, useState } from "react";
import { useParams, Link as RouterLink } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import EditOutlined from "@mui/icons-material/EditOutlined";
import { getToken } from "../../lib/admin-auth";
import { apiUrl } from "../../lib/api-base";

type Member = {
  id: string;
  preferredName: string;
  email: string | null;
  createdAt: string;
};

type CalendarEvent = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  location: string | null;
  sportType: string;
  eventType: string;
};

type RegistrationRow = {
  id: string;
  status: string;
  teamName: string | null;
  createdAt: string;
  event: CalendarEvent | null;
};

const statusColor: Record<string, "default" | "primary" | "success" | "warning" | "error"> = {
  PENDING: "default",
  APPROVED: "success",
  WAITING_LIST: "warning",
  REJECTED: "error",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

const EMAIL_CHANGE_WARNING =
  "This will log the user out immediately and affect how they sign in.";

const PASSWORD_CHANGE_WARNING =
  "This will change how the member signs in. They will need to use the new password.";

const NAME_CHANGE_INFO =
  "This change will update the member's profile on the web and iOS app.";

export const MemberShow: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [member, setMember] = useState<Member | null>(null);
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [changeEmailOpen, setChangeEmailOpen] = useState(false);
  const [changeEmailValue, setChangeEmailValue] = useState("");
  const [changeEmailSaving, setChangeEmailSaving] = useState(false);
  const [changeEmailError, setChangeEmailError] = useState("");
  const [changeEmailConfirmOpen, setChangeEmailConfirmOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [changePasswordValue, setChangePasswordValue] = useState("");
  const [changePasswordSaving, setChangePasswordSaving] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState("");
  const [changePasswordConfirmOpen, setChangePasswordConfirmOpen] = useState(false);
  const [changeNameOpen, setChangeNameOpen] = useState(false);
  const [changeNameValue, setChangeNameValue] = useState("");
  const [changeNameSaving, setChangeNameSaving] = useState(false);
  const [changeNameError, setChangeNameError] = useState("");

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(apiUrl(`/members/${id}`)).then((r) => r.json()),
      fetch(apiUrl(`/members/${id}/registrations`)).then((r) => r.json()),
    ])
      .then(([memberData, regData]) => {
        if (cancelled) return;
        if (memberData && typeof memberData === "object" && "id" in memberData) {
          setMember(memberData as Member);
        } else {
          setMember(null);
        }
        setRegistrations(Array.isArray(regData) ? regData : []);
      })
      .catch(() => {
        if (!cancelled) {
          setMember(null);
          setRegistrations([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="text.secondary">Loading…</Typography>
      </Box>
    );
  }

  if (!member) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography color="error">Member not found.</Typography>
        <Button component={RouterLink} to="/members" sx={{ mt: 1 }}>
          Back to Members
        </Button>
      </Box>
    );
  }

  const now = new Date();
  const upcoming = registrations.filter((r) => r.event && new Date(r.event.endAt) >= now);
  const past = registrations.filter((r) => r.event && new Date(r.event.endAt) < now);

  return (
    <Box sx={{ p: 2 }}>
      <Button component={RouterLink} to="/members" sx={{ mb: 2 }}>
        ← Back to Members
      </Button>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Member
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography variant="body1">
            <strong>Name:</strong> {member.preferredName}
          </Typography>
          <IconButton
            size="small"
            aria-label="Change name"
            onClick={() => {
              setChangeNameValue(member.preferredName);
              setChangeNameError("");
              setChangeNameOpen(true);
            }}
          >
            <EditOutlined fontSize="small" />
          </IconButton>
        </Box>
        <Typography variant="body1" sx={{ mb: 1 }}>
          <strong>Email:</strong> {member.email ?? ""}
        </Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center" }}>
          <Button
            size="small"
            variant="outlined"
            color="primary"
            onClick={() => {
              setChangeEmailValue(member.email ?? "");
              setChangeEmailError("");
              setChangeEmailOpen(true);
            }}
          >
            Change email
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="primary"
            onClick={() => {
              setChangePasswordValue("");
              setChangePasswordError("");
              setChangePasswordOpen(true);
            }}
          >
            Change password
          </Button>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Created: {formatDate(member.createdAt)}
        </Typography>
      </Paper>

      <Dialog open={changeEmailOpen} onClose={() => !changeEmailSaving && setChangeEmailOpen(false)}>
        <DialogTitle>Change member email</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {EMAIL_CHANGE_WARNING}
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            type="email"
            label="New email"
            value={changeEmailValue}
            onChange={(e) => setChangeEmailValue(e.target.value)}
          />
          {changeEmailError && (
            <Typography color="error" variant="body2" sx={{ mt: 1 }}>
              {changeEmailError}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChangeEmailOpen(false)} disabled={changeEmailSaving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              const newEmail = changeEmailValue.trim();
              if (!newEmail) {
                setChangeEmailError("Email is required.");
                return;
              }
              setChangeEmailError("");
              setChangeEmailConfirmOpen(true);
            }}
            disabled={changeEmailSaving}
          >
            Confirm change
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={changeEmailConfirmOpen}
        onClose={() => !changeEmailSaving && setChangeEmailConfirmOpen(false)}
      >
        <DialogTitle>Confirm change email</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to change this member&apos;s email? This will log the user out
            immediately and affect how they sign in.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChangeEmailConfirmOpen(false)} disabled={changeEmailSaving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={async () => {
              const newEmail = changeEmailValue.trim();
              if (!newEmail || !id) return;
              setChangeEmailSaving(true);
              try {
                const res = await fetch(apiUrl(`/members/${id}`), {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email: newEmail }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                  setChangeEmailError(data?.message ?? "Update failed.");
                  setChangeEmailConfirmOpen(false);
                  return;
                }
                setMember((m) => (m ? { ...m, email: newEmail } : null));
                setChangeEmailConfirmOpen(false);
                setChangeEmailOpen(false);
              } finally {
                setChangeEmailSaving(false);
              }
            }}
            disabled={changeEmailSaving}
          >
            {changeEmailSaving ? "Saving…" : "Yes, change email"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={changeNameOpen} onClose={() => !changeNameSaving && setChangeNameOpen(false)}>
        <DialogTitle>Change member name</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {NAME_CHANGE_INFO}
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            label="Name"
            value={changeNameValue}
            onChange={(e) => setChangeNameValue(e.target.value)}
          />
          {changeNameError && (
            <Typography color="error" variant="body2" sx={{ mt: 1 }}>
              {changeNameError}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChangeNameOpen(false)} disabled={changeNameSaving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={async () => {
              const name = changeNameValue.trim();
              if (!name || !id) {
                setChangeNameError("Name is required.");
                return;
              }
              setChangeNameError("");
              setChangeNameSaving(true);
              try {
                const res = await fetch(apiUrl(`/members/${id}`), {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ preferredName: name }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                  setChangeNameError(data?.message ?? "Update failed.");
                  return;
                }
                setMember((m) => (m ? { ...m, preferredName: name } : null));
                setChangeNameOpen(false);
              } finally {
                setChangeNameSaving(false);
              }
            }}
            disabled={changeNameSaving || !changeNameValue.trim()}
          >
            {changeNameSaving ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={changePasswordOpen} onClose={() => !changePasswordSaving && setChangePasswordOpen(false)}>
        <DialogTitle>Change member password</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {PASSWORD_CHANGE_WARNING}
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            type="password"
            label="New password"
            value={changePasswordValue}
            onChange={(e) => setChangePasswordValue(e.target.value)}
            autoComplete="new-password"
          />
          {changePasswordError && (
            <Typography color="error" variant="body2" sx={{ mt: 1 }}>
              {changePasswordError}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChangePasswordOpen(false)} disabled={changePasswordSaving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              const pwd = changePasswordValue.trim();
              if (!pwd) {
                setChangePasswordError("Password is required.");
                return;
              }
              if (pwd.length < 6) {
                setChangePasswordError("Password must be at least 6 characters.");
                return;
              }
              setChangePasswordError("");
              setChangePasswordConfirmOpen(true);
            }}
            disabled={changePasswordSaving}
          >
            Confirm change
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={changePasswordConfirmOpen}
        onClose={() => !changePasswordSaving && setChangePasswordConfirmOpen(false)}
      >
        <DialogTitle>Confirm change password</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to change this member&apos;s password? This will affect how they
            sign in. They will need to use the new password to log in.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChangePasswordConfirmOpen(false)} disabled={changePasswordSaving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={async () => {
              const newPassword = changePasswordValue.trim();
              if (!newPassword || !id) return;
              setChangePasswordSaving(true);
              setChangePasswordError("");
              try {
                const token = getToken();
                const res = await fetch(apiUrl("/members/reset-password"), {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  },
                  body: JSON.stringify({ memberIds: [id], newPassword }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                  setChangePasswordError(data?.message ?? "Update failed.");
                  setChangePasswordConfirmOpen(false);
                  return;
                }
                setChangePasswordConfirmOpen(false);
                setChangePasswordOpen(false);
              } finally {
                setChangePasswordSaving(false);
              }
            }}
            disabled={changePasswordSaving}
          >
            {changePasswordSaving ? "Saving…" : "Yes, change password"}
          </Button>
        </DialogActions>
      </Dialog>

      <Typography variant="h6" sx={{ mb: 1 }}>
        Upcoming &amp; past events
      </Typography>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Event</TableCell>
              <TableCell>Date / Time</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Team</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {upcoming.concat(past).length === 0 ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <Typography color="text.secondary">No event registrations.</Typography>
                </TableCell>
              </TableRow>
            ) : (
              upcoming.concat(past).map((reg) => (
                <TableRow key={reg.id}>
                  <TableCell>
                    <Typography variant="body2">
                      {reg.event?.title ?? "—"}
                    </Typography>
                    {reg.event && (
                      <Typography variant="caption" color="text.secondary">
                        {reg.event.sportType} · {reg.event.eventType}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {reg.event
                      ? `${formatDate(reg.event.startAt)} – ${formatDate(reg.event.endAt)}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={reg.status}
                      size="small"
                      color={statusColor[reg.status] ?? "default"}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>{reg.teamName ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};
