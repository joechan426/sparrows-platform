import React, { useState, useEffect } from "react";
import { useParams, Link as RouterLink } from "react-router-dom";
import {
  useCustom,
  useNotification,
  useUpdate,
} from "@refinedev/core";
import { List } from "../../components/SaasRefineMui";
import { type GridColDef, type GridRowSelectionModel } from "@mui/x-data-grid";
import { SaasDataGrid } from "../../components/SaasDataGrid";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import { apiUrl } from "../../lib/api-base";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import { useGridPreferences } from "../../lib/grid-preferences";

type Member = {
  id: string;
  preferredName: string;
  email: string;
};

type CalendarEvent = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  eventType: string;
  registrationOpen: boolean;
  capacity: number | null;
  isPaid?: boolean;
  priceCents?: number | null;
  priceDollars?: number | null;
  currency?: string;
};

type EventRegistrationRow = {
  id: string;
  status: string;
  createdAt: string;
  teamName?: string | null;
  member?: Member | null;
  paymentStatus?: string;
  paymentProvider?: string | null;
  amountDueCents?: number | null;
  amountPaidCents?: number | null;
  paidAt?: string | null;
};

export const EventRegistrationsPage: React.FC = () => {
  /** Match admin panel mobile / bottom-nav breakpoint */
  const isMobileToolbar = useMediaQuery("(max-width:1024px)");
  const { id } = useParams<{ id: string }>();
  const { open } = useNotification();
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [eventLoading, setEventLoading] = useState(true);

  const { query: registrationsQuery, result } =
    useCustom<EventRegistrationRow[]>({
      url: id ? apiUrl(`/calendar-events/${id}/registrations`) : "",
      method: "get",
      queryOptions: {
        enabled: !!id,
      },
    });
  const registrationsData = result?.data;
  const registrationsLoading = registrationsQuery?.isLoading ?? false;
  const refetchRegistrations = registrationsQuery?.refetch;

  const { mutate: updateRegistration, mutateAsync: updateRegistrationAsync } = useUpdate();
  const { mutate: updateEvent } = useUpdate();
  const [capacityInput, setCapacityInput] = useState("");
  const [capacitySaving, setCapacitySaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addTeamName, setAddTeamName] = useState("");
  const [rowSelectionModel, setRowSelectionModel] = useState<GridRowSelectionModel>({
    type: "include",
    ids: new Set<string>(),
  });
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [bulkStatusLoading, setBulkStatusLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const selectedIds =
    rowSelectionModel.type === "include" ? (Array.from(rowSelectionModel.ids) as string[]) : [];
  const selectedCount = rowSelectionModel.type === "include" ? rowSelectionModel.ids.size : 0;

  useEffect(() => {
    if (!id) {
      setEvent(null);
      setEventLoading(false);
      return;
    }
    let cancelled = false;
    setEventLoading(true);
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
        if (!cancelled) setEventLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setBulkDeleteLoading(true);
    try {
      await Promise.all(
        selectedIds.map((regId) =>
          fetch(apiUrl(`/event-registrations/${regId}`), { method: "DELETE" }),
        ),
      );
      open?.({ type: "success", message: `Removed ${selectedIds.length} participant(s) from the event` });
      setRowSelectionModel({ type: "include", ids: new Set() });
      refetchRegistrations?.();
    } catch {
      open?.({ type: "error", message: "Failed to remove some participants" });
    } finally {
      setBulkDeleteLoading(false);
    }
  };

  const handleStatusChange = (
    registrationId: string,
    status: "PENDING" | "APPROVED" | "WAITING_LIST" | "REJECTED",
  ) => {
    if (status === "APPROVED" && event?.capacity != null) {
      const wouldBeApproved = approvedCount + (rows.find((r) => r.id === registrationId)?.status === "APPROVED" ? 0 : 1);
      if (wouldBeApproved > event.capacity) {
        open?.({
          type: "error",
          message: "Approving would exceed the event capacity limit.",
        });
        return;
      }
    }
    updateRegistration(
      {
        resource: "event-registrations",
        id: registrationId,
        values: { status },
      },
      {
        onSuccess: () => {
          open?.({
            type: "success",
            message: "Registration status updated",
          });
          refetchRegistrations?.();
        },
        onError: (error) => {
          open?.({
            type: "error",
            message:
              (error as any)?.message ?? "Failed to update registration status",
          });
        },
      },
    );
  };

  const rows: EventRegistrationRow[] =
    Array.isArray((registrationsData as any)?.data)
      ? ((registrationsData as any).data as EventRegistrationRow[])
      : Array.isArray(registrationsData)
        ? (registrationsData as EventRegistrationRow[])
        : [];

  const filteredRows = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const name = (r.member?.preferredName ?? "").toLowerCase();
      const email = (r.member?.email ?? "").toLowerCase();
      const teamName = (r.teamName ?? "").toLowerCase();
      return name.includes(q) || email.includes(q) || teamName.includes(q);
    });
  }, [rows, searchQuery]);

  const approvedCount = rows.filter((r) => r.status === "APPROVED").length;
  const statusCounts = React.useMemo(() => {
    const c = { PENDING: 0, APPROVED: 0, WAITING_LIST: 0, REJECTED: 0 };
    filteredRows.forEach((r) => {
      if (r.status in c) (c as Record<string, number>)[r.status] += 1;
    });
    return c;
  }, [filteredRows]);

  const handleBulkStatusChange = async (
    status: "PENDING" | "APPROVED" | "WAITING_LIST" | "REJECTED",
  ) => {
    if (selectedIds.length === 0) return;
    if (status === "APPROVED" && event?.capacity != null) {
      const currentlyApproved = rows.filter((r) => r.status === "APPROVED").length;
      const selectedNotYetApproved = selectedIds.filter(
        (id) => rows.find((r) => r.id === id)?.status !== "APPROVED",
      ).length;
      if (currentlyApproved + selectedNotYetApproved > event.capacity) {
        open?.({
          type: "error",
          message: "Approving all selected would exceed the event capacity limit.",
        });
        return;
      }
    }
    setBulkStatusLoading(true);
    try {
      await Promise.all(
        selectedIds.map((regId) =>
          updateRegistrationAsync({
            resource: "event-registrations",
            id: regId,
            values: { status },
          }),
        ),
      );
      open?.({
        type: "success",
        message: `Updated ${selectedIds.length} participant(s) to ${status.replace("_", " ")}`,
      });
      setRowSelectionModel({ type: "include", ids: new Set() });
      refetchRegistrations?.();
    } catch (err) {
      open?.({
        type: "error",
        message: (err as any)?.message ?? "Failed to update some registrations",
      });
    } finally {
      setBulkStatusLoading(false);
    }
  };

  const columns = React.useMemo<GridColDef[]>(
    () => [
      {
        field: "memberName",
        headerName: "Member",
        flex: 1,
        minWidth: 160,
        valueGetter: (_value, row: EventRegistrationRow) =>
          row.member?.preferredName ?? "—",
      },
      {
        field: "memberEmail",
        headerName: "Email",
        flex: 1,
        minWidth: 200,
        valueGetter: (_value, row: EventRegistrationRow) =>
          row.member?.email ?? "—",
      },
      {
        field: "teamName",
        headerName: "Team Name",
        flex: 1,
        minWidth: 160,
        valueGetter: (value: unknown) =>
          value != null && value !== "" ? (value as string) : "—",
      },
      {
        field: "status",
        headerName: "Status",
        width: 140,
        renderCell: ({ value }) => {
          const status = String(value ?? "");
          const statusStyle =
            status === "PENDING"
              ? { bgcolor: "grey.700", color: "white" }
              : status === "APPROVED"
                ? { bgcolor: "success.main", color: "white" }
                : status === "WAITING_LIST"
                  ? { bgcolor: "warning.main", color: "white" }
                  : status === "REJECTED"
                    ? { bgcolor: "error.main", color: "white" }
                    : {};
          return (
            <Chip
              label={status || "—"}
              size="small"
              variant="filled"
              sx={statusStyle}
            />
          );
        },
      },
      {
        field: "paymentStatus",
        headerName: "Payment",
        width: 160,
        renderCell: ({ row }) => {
          const ps = String(row.paymentStatus ?? "—");
          const style =
            ps === "PAID"
              ? { bgcolor: "success.main", color: "white" }
              : ps === "AWAITING_PAYMENT"
                ? { bgcolor: "grey.700", color: "white" }
                : ps === "WAIVED"
                  ? { bgcolor: "info.main", color: "white" }
                  : {};
          return <Chip label={ps} size="small" variant="filled" sx={style} />;
        },
      },
      {
        field: "amountPaidCents",
        headerName: "Paid",
        width: 140,
        valueGetter: (_value, row: EventRegistrationRow) =>
          row.amountPaidCents != null
            ? `$${(row.amountPaidCents / 100).toFixed(2)}`
            : "—",
      },
      {
        field: "paidAt",
        headerName: "Paid At",
        width: 180,
        valueGetter: (_value, row: EventRegistrationRow) =>
          row.paidAt ? new Date(row.paidAt).toLocaleString() : "—",
      },
      {
        field: "createdAt",
        headerName: "Registered At",
        width: 180,
        valueGetter: (value: unknown) =>
          value != null && value !== ""
            ? new Date(value as string).toLocaleString()
            : "—",
      },
      {
        field: "actions",
        headerName: "Actions",
        width: 420,
        minWidth: 420,
        sortable: false,
        filterable: false,
        align: "center",
        headerAlign: "center",
        renderCell: ({ row }: { row: EventRegistrationRow }) => (
          <Box sx={{ width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center" }}>
            <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center" useFlexGap>
              <Button
                size="small"
                variant="outlined"
                onClick={() => handleStatusChange(row.id, "PENDING")}
                sx={{ color: "grey.800", borderColor: "grey.600" }}
              >
                Pending
              </Button>
              <Button
                size="small"
                variant="contained"
                color="success"
                onClick={() => handleStatusChange(row.id, "APPROVED")}
              >
                Approve
              </Button>
              <Button
                size="small"
                variant="contained"
                color="warning"
                onClick={() => handleStatusChange(row.id, "WAITING_LIST")}
              >
                Waitlist
              </Button>
              <Button
                size="small"
                variant="contained"
                color="error"
                onClick={() => handleStatusChange(row.id, "REJECTED")}
              >
                Reject
              </Button>
            </Stack>
          </Box>
        ),
      },
    ],
    [approvedCount, rows, event?.capacity],
  );
  const gridPrefs = useGridPreferences("event-registrations-list", columns);

  useEffect(() => {
    if (event?.capacity != null) setCapacityInput(String(event.capacity));
    else setCapacityInput("");
  }, [event?.capacity]);

  const handleCapacitySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    const cap = capacityInput.trim() === "" ? null : parseInt(capacityInput, 10);
    if (cap !== null && (Number.isNaN(cap) || cap < 0)) {
      open?.({ type: "error", message: "Capacity must be a non-negative number or empty" });
      return;
    }
    setCapacitySaving(true);
    updateEvent(
      { resource: "calendar-events", id, values: { capacity: cap } },
      {
        onSuccess: () => {
          open?.({ type: "success", message: "Capacity updated" });
          setEvent((prev) => (prev ? { ...prev, capacity: cap } : prev));
        },
        onError: (err) => {
          open?.({ type: "error", message: (err as any)?.message ?? "Failed to update capacity" });
        },
        onSettled: () => setCapacitySaving(false),
      },
    );
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    const name = addName.trim();
    const email = addEmail.trim();
    const teamName = addTeamName.trim();
    if (!name) {
      open?.({ type: "error", message: "Name is required" });
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(apiUrl(`/calendar-events/${id}/registrations`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferredName: name,
          email: email || undefined,
          teamName: teamName || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message ?? "Failed to add participant");
      }
      open?.({ type: "success", message: "Participant added" });
      setAddName("");
      setAddEmail("");
      setAddTeamName("");
      setAddOpen(false);
      refetchRegistrations?.();
    } catch (err) {
      open?.({
        type: "error",
        message: (err as any)?.message ?? "Failed to add participant",
      });
    } finally {
      setAdding(false);
    }
  };

  return (
    <List
      title="Event Registrations"
      headerButtons={
        <Stack
          direction={isMobileToolbar ? "column" : "row"}
          spacing={2}
          alignItems={isMobileToolbar ? "stretch" : "center"}
          flexWrap="wrap"
          sx={{ width: isMobileToolbar ? "100%" : "auto" }}
        >
          <Button
            component={RouterLink}
            to="/events"
            variant="outlined"
            color="primary"
            fullWidth={isMobileToolbar}
          >
            Back to events
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={() => setAddOpen(true)}
            disabled={registrationsLoading}
            fullWidth={isMobileToolbar}
          >
            Add participant
          </Button>
          {selectedCount > 0 && (
            <>
              <Typography variant="body2" color="text.secondary">
                {selectedCount} selected
              </Typography>
              <Button
                variant="contained"
                size="small"
                color="success"
                onClick={() => handleBulkStatusChange("APPROVED")}
                disabled={bulkStatusLoading || bulkDeleteLoading}
              >
                All Approve
              </Button>
              <Button
                variant="contained"
                size="small"
                color="warning"
                onClick={() => handleBulkStatusChange("WAITING_LIST")}
                disabled={bulkStatusLoading || bulkDeleteLoading}
              >
                All Waitlist
              </Button>
              <Button
                variant="contained"
                size="small"
                color="error"
                onClick={() => handleBulkStatusChange("REJECTED")}
                disabled={bulkStatusLoading || bulkDeleteLoading}
              >
                All Reject
              </Button>
              <Button
                variant="outlined"
                size="small"
                color="error"
                onClick={handleBulkDelete}
                disabled={bulkDeleteLoading || bulkStatusLoading}
              >
                {bulkDeleteLoading ? "Removing…" : "Delete selected"}
              </Button>
            </>
          )}
          {event && (
            <Box
              component="form"
              onSubmit={handleCapacitySubmit}
              sx={{
                display: "flex",
                flexDirection: isMobileToolbar ? "column" : "row",
                alignItems: isMobileToolbar ? "stretch" : "center",
                gap: 1,
                flexWrap: "wrap",
                width: isMobileToolbar ? "100%" : "auto",
              }}
            >
              <Typography variant="body2" color="text.secondary">
                Capacity:
              </Typography>
              <TextField
                size="small"
                type="number"
                inputProps={{ min: 0 }}
                value={capacityInput}
                onChange={(e) => setCapacityInput(e.target.value)}
                sx={{ width: isMobileToolbar ? "100%" : 80 }}
                disabled={capacitySaving}
              />
              <Button
                type="submit"
                size="small"
                variant="outlined"
                disabled={capacitySaving}
                fullWidth={isMobileToolbar}
              >
                {capacitySaving ? "Saving…" : "Set capacity"}
              </Button>
            </Box>
          )}
        </Stack>
      }
    >
      {event && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="h6">{event.title}</Typography>
          <Typography variant="body2" color="text.secondary">
            {event.startAt
              ? new Date(event.startAt).toLocaleString()
              : "Start time not set"}{" "}
            —{" "}
            {event.endAt
              ? new Date(event.endAt).toLocaleString()
              : "End time not set"}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            Type: {event.eventType} · Registration{" "}
            {event.registrationOpen ? "Open" : "Closed"}
            {event.capacity != null && (
              <> · Capacity: {rows.length} / {event.capacity}</>
            )}
            {event.capacity == null && <> · Registrations: {rows.length}</>}
          </Typography>
          {(() => {
            const isPaid = Boolean(event.isPaid);
            const priceCentsForDisplay = isPaid ? event.priceCents ?? 0 : 0;
            const priceDollarsForDisplay = priceCentsForDisplay / 100;
            const currency = event.currency ?? "AUD";

            return (
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
                <Typography variant="body2">
                  Event price ({currency}):{" "}
                  <Box component="span" sx={{ color: "#1b5e20", fontWeight: 800 }}>
                    ${priceDollarsForDisplay.toFixed(2)}
                  </Box>
                </Typography>
                <IconButton
                  component={RouterLink}
                  to={`/events/${event.id}`}
                  size="small"
                  aria-label="Edit event price"
                >
                  <EditOutlinedIcon fontSize="small" />
                </IconButton>
              </Stack>
            );
          })()}
        </Box>
      )}

      <TextField
        size="small"
        placeholder="Search by name, email or team name…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        sx={{ mb: 2, width: "100%", maxWidth: 420, minWidth: 280 }}
        inputProps={{ type: "search" }}
      />

      <Stack
        direction="row"
        spacing={3}
        sx={{ mb: 2, justifyContent: "flex-end", flexWrap: "wrap" }}
      >
        <Typography variant="body2" sx={{ color: "grey.800", fontWeight: 600 }}>
          Pending: {statusCounts.PENDING}
        </Typography>
        <Typography variant="body2" sx={{ color: "success.main", fontWeight: 600 }}>
          Approved: {statusCounts.APPROVED}
        </Typography>
        <Typography variant="body2" sx={{ color: "warning.main", fontWeight: 600 }}>
          Waitlist: {statusCounts.WAITING_LIST}
        </Typography>
        <Typography variant="body2" sx={{ color: "error.main", fontWeight: 600 }}>
          Rejected: {statusCounts.REJECTED}
        </Typography>
      </Stack>

      <SaasDataGrid
        rows={filteredRows}
        columns={gridPrefs.columns}
        autoHeight
        loading={registrationsLoading}
        getRowId={(row: EventRegistrationRow) => row.id}
        checkboxSelection
        disableRowSelectionExcludeModel
        rowSelectionModel={rowSelectionModel}
        onRowSelectionModelChange={(model) => setRowSelectionModel(model)}
        columnVisibilityModel={gridPrefs.columnVisibilityModel}
        onColumnVisibilityModelChange={gridPrefs.onColumnVisibilityModelChange}
        onColumnWidthChange={gridPrefs.onColumnWidthChange}
      />
      <Dialog open={addOpen} onClose={() => !adding && setAddOpen(false)}>
        <DialogTitle>Add participant</DialogTitle>
        <Box component="form" onSubmit={handleAddSubmit}>
          <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            <TextField
              label="Name"
              required
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              autoFocus
            />
            <TextField
              label="Email (optional)"
              type="email"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
            />
            <TextField
              label="Team Name (optional)"
              value={addTeamName}
              onChange={(e) => setAddTeamName(e.target.value)}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAddOpen(false)} disabled={adding}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={adding}>
              {adding ? "Adding…" : "Add"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </List>
  );
};

