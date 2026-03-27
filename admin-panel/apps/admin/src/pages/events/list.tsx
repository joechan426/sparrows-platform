import React, { useState } from "react";
import { List, useDataGrid } from "@refinedev/mui";
import { useUpdate, useDelete, useNotification, useInvalidate } from "@refinedev/core";
import { DataGrid, type GridColDef, type GridRowSelectionModel } from "@mui/x-data-grid";
import { Link, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Switch from "@mui/material/Switch";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import MuiList from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import { apiUrl } from "../../lib/api-base";

type CalendarEventRow = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  sportType: string;
  eventType: string;
  registrationOpen: boolean;
  capacity: number | null;
  isPaid?: boolean;
  priceCents?: number | null;
  currency?: string | null;
  approvedCount?: number;
};

type PreviewEvent = {
  uid: string;
  summary: string;
  start: string;
  end: string;
  description: string | null;
  location: string | null;
};

function eventKey(ev: PreviewEvent): string {
  return `${ev.uid}|${ev.start}`;
}

function getSportType(summary: string): string {
  const t = summary.toLowerCase();
  if (t.includes("pickleball")) return "PICKLEBALL";
  if (t.includes("tennis")) return "TENNIS";
  return "VOLLEYBALL";
}

function getEventType(summary: string): string {
  const t = summary.toLowerCase();
  return t.includes("cup") ? "SPECIAL" : "NORMAL";
}

export const EventList: React.FC = () => {
  const navigate = useNavigate();
  const { open: openNotification } = useNotification();
  const dataGrid = useDataGrid<CalendarEventRow>({
    resource: "calendar-events",
  });
  const { dataGridProps } = dataGrid;
  const refetchList = (dataGrid as any)?.tableQueryResult?.refetch as (() => Promise<unknown>) | undefined;

  const invalidate = useInvalidate();
  const { mutate: update } = useUpdate();
  const { mutate: deleteOne } = useDelete();
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [previewEvents, setPreviewEvents] = useState<PreviewEvent[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [importTab, setImportTab] = useState(0);
  const [importing, setImporting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null);
  const [rowSelectionModel, setRowSelectionModel] = useState<GridRowSelectionModel>({
    type: "include",
    ids: new Set<string>(),
  });
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [listSearchQuery, setListSearchQuery] = useState("");
  const [importSearchQuery, setImportSearchQuery] = useState("");

  const selectedIds = rowSelectionModel.type === "include" ? Array.from(rowSelectionModel.ids) as string[] : [];
  const selectedCount = rowSelectionModel.type === "include" ? rowSelectionModel.ids.size : 0;
  const [bulkDeleteConfirmPending, setBulkDeleteConfirmPending] = useState(false);

  const handleBulkOpenRegistration = async () => {
    if (selectedIds.length === 0) return;
    setBulkActionLoading(true);
    try {
      await Promise.all(
        selectedIds.map((id) =>
          fetch(apiUrl(`/calendar-events/${id}`), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ registrationOpen: true }),
          }),
        ),
      );
      openNotification?.({ type: "success", message: `Opened registration for ${selectedIds.length} event(s)` });
      setRowSelectionModel({ type: "include", ids: new Set() });
      invalidate({ resource: "calendar-events", invalidates: ["list", "many", "detail"] });
      await refetchList?.();
      window.location.reload();
    } catch {
      openNotification?.({ type: "error", message: "Failed to update some events" });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkCloseRegistration = async () => {
    if (selectedIds.length === 0) return;
    setBulkActionLoading(true);
    try {
      await Promise.all(
        selectedIds.map((id) =>
          fetch(apiUrl(`/calendar-events/${id}`), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ registrationOpen: false }),
          }),
        ),
      );
      openNotification?.({ type: "success", message: `Closed registration for ${selectedIds.length} event(s)` });
      setRowSelectionModel({ type: "include", ids: new Set() });
      invalidate({ resource: "calendar-events", invalidates: ["list", "many", "detail"] });
      await refetchList?.();
      window.location.reload();
    } catch {
      openNotification?.({ type: "error", message: "Failed to update some events" });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!bulkDeleteConfirmPending) {
      setBulkDeleteConfirmPending(true);
      openNotification?.({
        type: "error",
        message: "This action cannot be undone. Click 'Delete selected' again to confirm.",
      });
      return;
    }
    setBulkActionLoading(true);
    try {
      await Promise.all(
        selectedIds.map((id) => fetch(apiUrl(`/calendar-events/${id}`), { method: "DELETE" })),
      );
      openNotification?.({ type: "success", message: `Deleted ${selectedIds.length} event(s)` });
      setRowSelectionModel({ type: "include", ids: new Set() });
      setBulkDeleteConfirmPending(false);
      invalidate({ resource: "calendar-events", invalidates: ["list", "many", "detail"] });
      await refetchList?.();
      window.location.reload();
    } catch {
      openNotification?.({ type: "error", message: "Failed to delete some events" });
    } finally {
      setBulkActionLoading(false);
    }
  };

  const openImportDialog = async () => {
    setImportDialogOpen(true);
    setPreviewLoading(true);
    setSelectedKeys(new Set());
    try {
      const res = await fetch(apiUrl("/calendar-events/import"));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? "Failed to load calendar");
      setPreviewEvents(Array.isArray(data) ? data : []);
    } catch (e) {
      openNotification?.({ type: "error", message: e instanceof Error ? e.message : "Failed to load calendar" });
      setPreviewEvents([]);
    } finally {
      setPreviewLoading(false);
    }
  };

  const filteredByTab = React.useMemo(() => {
    const t = (s: string) => s.toLowerCase();
    const tabFilters: ((ev: PreviewEvent) => boolean)[] = [
      (ev) => !t(ev.summary).includes("tennis") && !t(ev.summary).includes("pickleball"),
      (ev) => t(ev.summary).includes("pickleball"),
      (ev) => t(ev.summary).includes("tennis"),
      (ev) => getEventType(ev.summary) === "SPECIAL",
    ];
    const fn = tabFilters[importTab];
    return fn ? previewEvents.filter(fn) : previewEvents;
  }, [previewEvents, importTab]);

  const filteredByTabAndSearch = React.useMemo(() => {
    const q = importSearchQuery.trim().toLowerCase();
    if (!q) return filteredByTab;
    return filteredByTab.filter(
      (ev) => (ev.summary ?? "").toLowerCase().includes(q) || (ev.location ?? "").toLowerCase().includes(q),
    );
  }, [filteredByTab, importSearchQuery]);

  const toggleSelectAll = () => {
    if (filteredByTabAndSearch.length === 0) return;
    const allSelected = filteredByTabAndSearch.every((e) => selectedKeys.has(eventKey(e)));
    if (allSelected) {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        filteredByTabAndSearch.forEach((e) => next.delete(eventKey(e)));
        return next;
      });
    } else {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        filteredByTabAndSearch.forEach((e) => next.add(eventKey(e)));
        return next;
      });
    }
  };

  const toggleEvent = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleImportSelected = async () => {
    const events = previewEvents
      .filter((e) => selectedKeys.has(eventKey(e)))
      .map((e) => ({ ...e, sourceEventId: eventKey(e) }));
    if (events.length === 0) {
      openNotification?.({ type: "error", message: "Select at least one event to import" });
      return;
    }
    setImporting(true);
    try {
      const res = await fetch(apiUrl("/calendar-events/import"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? "Import failed");
      openNotification?.({ type: "success", message: `Import complete. Created: ${data.created}, Updated: ${data.updated}, Skipped: ${data.skipped}` });
      invalidate({ resource: "calendar-events", invalidates: ["list", "many", "detail"] });
      await refetchList?.();
      setImportDialogOpen(false);
      window.location.reload();
    } catch (e) {
      openNotification?.({ type: "error", message: e instanceof Error ? e.message : "Import failed" });
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteClick = React.useCallback((row: CalendarEventRow) => {
    setDeleteConfirm({ id: row.id, title: row.title ?? "This event" });
  }, []);

  const handleDeleteConfirm = () => {
    if (!deleteConfirm) return;
    deleteOne(
      { resource: "calendar-events", id: deleteConfirm.id },
      {
        onSuccess: () => {
          openNotification?.({ type: "success", message: "Event deleted" });
          setDeleteConfirm(null);
          invalidate({ resource: "calendar-events", invalidates: ["list", "many", "detail"] });
          refetchList?.();
        },
        onError: (e) => {
          openNotification?.({ type: "error", message: (e as any)?.message ?? "Delete failed" });
        },
      },
    );
  };

  const listRows = (dataGridProps.rows ?? []) as CalendarEventRow[];
  const filteredListRows = React.useMemo(() => {
    const q = listSearchQuery.trim().toLowerCase();
    if (!q) return listRows;
    return listRows.filter(
      (row) =>
        (row.title ?? "").toLowerCase().includes(q) ||
        (row.sportType ?? "").toLowerCase().includes(q) ||
        (row.eventType ?? "").toLowerCase().includes(q),
    );
  }, [listRows, listSearchQuery]);

  const columns = React.useMemo<GridColDef[]>(
    () => [
      {
        field: "title",
        headerName: "Event",
        flex: 1,
        headerAlign: "left",
        align: "left",
        renderCell: ({ row }) => (
          <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
            <Link to={`/events/${row.id}`} style={{ textDecoration: "none", width: "100%" }}>
              <Typography color="primary" sx={{ fontWeight: 500, textAlign: "left", width: "100%" }}>
                {row.title ?? "-"}
              </Typography>
            </Link>
          </Box>
        ),
      },
      {
        field: "startAt",
        headerName: "Start",
        width: 180,
        renderCell: ({ row, value }) => (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
            <Link to={`/events/${row.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <Typography variant="body2" sx={{ textAlign: "center" }}>
                {value != null && value !== "" ? new Date(value as string).toLocaleString() : "—"}
              </Typography>
            </Link>
          </Box>
        ),
      },
      {
        field: "endAt",
        headerName: "End",
        width: 180,
        renderCell: ({ row, value }) => (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
            <Link to={`/events/${row.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <Typography variant="body2" sx={{ textAlign: "center" }}>
                {value != null && value !== "" ? new Date(value as string).toLocaleString() : "—"}
              </Typography>
            </Link>
          </Box>
        ),
      },
      {
        field: "sportType",
        headerName: "Sport",
        width: 120,
      },
      {
        field: "eventType",
        headerName: "Type",
        width: 120,
      },
      {
        field: "isPaid",
        headerName: "Price",
        width: 130,
        align: "center",
        headerAlign: "center",
        sortable: false,
        renderCell: ({ row }) => {
          const paid = Boolean(row.isPaid);
          if (!paid) {
            return (
              <Box
                sx={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Link to={`/events/${row.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                    No
                  </Typography>
                </Link>
              </Box>
            );
          }

          const cents = row.priceCents ?? 0;
          const amt = cents / 100;
          return (
            <Box
              sx={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Link to={`/events/${row.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <Typography variant="body2" sx={{ fontWeight: 700, textAlign: "center" }} color="text.primary">
                  ${amt.toFixed(2)}
                </Typography>
              </Link>
            </Box>
          );
        },
      },
      {
        field: "capacity",
        headerName: "Capacity",
        width: 140,
        renderCell: ({ row }) => {
          const approved = row.approvedCount ?? 0;
          const text = row.capacity == null
            ? `${approved}/Unlimited`
            : `${approved}/${row.capacity}`;
          return (
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
              <Link to={`/events/${row.id}/registrations`} style={{ textDecoration: "none", color: "inherit" }}>
                <Typography variant="body2" sx={{ textAlign: "center" }}>{text}</Typography>
              </Link>
            </Box>
          );
        },
      },
      {
        field: "registrationOpen",
        headerName: "Registration Open",
        width: 180,
        renderCell: ({ row }) => (
          <Switch
            checked={Boolean(row.registrationOpen)}
            onChange={() => {
              update(
                { resource: "calendar-events", id: row.id, values: { registrationOpen: !row.registrationOpen } },
                {},
              );
            }}
            inputProps={{ "aria-label": "Toggle registration" }}
          />
        ),
      },
      {
        field: "actions",
        headerName: "Actions",
        /* Wide enough for “Registrations” + “Delete” side-by-side (esp. mobile). */
        width: 312,
        minWidth: 312,
        maxWidth: 312,
        sortable: false,
        align: "center",
        headerAlign: "center",
        renderCell: ({ row }) => (
          <Box sx={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Stack
              direction="row"
              spacing={1}
              flexWrap="nowrap"
              justifyContent="center"
              alignItems="center"
              useFlexGap
              sx={{ flexShrink: 0 }}
            >
              <Button size="small" variant="outlined" component={Link} to={`/events/${row.id}/registrations`}>
                Registrations
              </Button>
              <Button size="small" color="error" variant="outlined" onClick={() => handleDeleteClick(row)}>
                Delete
              </Button>
            </Stack>
          </Box>
        ),
      },
    ],
    [update, handleDeleteClick],
  );

  return (
    <>
      <List
        title="Events"
        headerButtons={
          <Stack spacing={1} alignItems="stretch" sx={{ width: "100%", maxWidth: "100%" }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              flexWrap="wrap"
              alignItems={{ xs: "stretch", sm: "center" }}
            >
              <Button variant="contained" onClick={openImportDialog} sx={{ width: { xs: "100%", sm: "auto" } }}>
                Import from Google Calendar
              </Button>
              <Button
                variant="contained"
                color="primary"
                onClick={() => navigate("/events/create")}
                sx={{ width: { xs: "100%", sm: "auto" } }}
              >
                Create event
              </Button>
            </Stack>
            {selectedCount > 0 && (
              <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
                <Typography variant="body2" color="text.secondary" sx={{ ml: { sm: 1 } }}>
                  {selectedCount} selected
                </Typography>
                <Button variant="outlined" size="small" onClick={handleBulkOpenRegistration} disabled={bulkActionLoading}>
                  Open Registration
                </Button>
                <Button variant="outlined" size="small" onClick={handleBulkCloseRegistration} disabled={bulkActionLoading}>
                  Close Registration
                </Button>
                <Button variant="outlined" size="small" color="error" onClick={handleBulkDelete} disabled={bulkActionLoading}>
                  Delete selected
                </Button>
              </Stack>
            )}
          </Stack>
        }
      >
        <TextField
          size="small"
          placeholder="Search event & sport…"
          value={listSearchQuery}
          onChange={(e) => setListSearchQuery(e.target.value)}
          sx={{ mb: 1, width: { xs: "100%", sm: "auto" }, minWidth: { xs: 0, sm: 220 } }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start">Search</InputAdornment> } }}
        />
        <DataGrid
          {...dataGridProps}
          rows={filteredListRows}
          columns={columns}
          autoHeight
          getRowId={(row: CalendarEventRow) => row.id}
          checkboxSelection
          disableRowSelectionExcludeModel
          rowSelectionModel={rowSelectionModel}
          onRowSelectionModelChange={(newModel) => setRowSelectionModel(newModel)}
          sx={{
            "& .MuiDataGrid-row:nth-of-type(even)": {
              backgroundColor: "action.hover",
            },
          }}
        />
      </List>
      <Dialog
        open={importDialogOpen}
        onClose={() => !importing && setImportDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        sx={{ "& .MuiDialog-paper": { maxHeight: "90vh" } }}
      >
        <DialogTitle>Import from Google Calendar</DialogTitle>
        <DialogContent>
          {previewLoading ? (
            <Typography>Loading calendar…</Typography>
          ) : previewEvents.length === 0 ? (
            <Typography color="text.secondary">No events found in the calendar feed.</Typography>
          ) : (
            <>
              <Tabs value={importTab} onChange={(_, v) => setImportTab(v)} sx={{ borderBottom: 1, borderColor: "divider", mb: 1 }}>
                <Tab label="Volleyball" />
                <Tab label="Pickleball" />
                <Tab label="Tennis" />
                <Tab label="Special Event" />
              </Tabs>
              <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={filteredByTabAndSearch.length > 0 && filteredByTabAndSearch.every((e) => selectedKeys.has(eventKey(e)))}
                      indeterminate={filteredByTabAndSearch.some((e) => selectedKeys.has(eventKey(e))) && !filteredByTabAndSearch.every((e) => selectedKeys.has(eventKey(e)))}
                      onChange={toggleSelectAll}
                    />
                  }
                  label="Select all in tab"
                />
                <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                  {selectedKeys.size} of {previewEvents.length} selected
                </Typography>
              </Stack>
              <TextField
                size="small"
                placeholder="Search in this tab…"
                value={importSearchQuery}
                onChange={(e) => setImportSearchQuery(e.target.value)}
                fullWidth
                sx={{ mb: 1 }}
                slotProps={{ input: { startAdornment: <InputAdornment position="start">Search</InputAdornment> } }}
              />
              <MuiList dense sx={{ maxHeight: 280, overflow: "auto" }}>
                {filteredByTabAndSearch.map((ev) => {
                  const key = eventKey(ev);
                  return (
                    <ListItem key={key} dense disablePadding>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={selectedKeys.has(key)}
                            onChange={() => toggleEvent(key)}
                          />
                        }
                        label={
                          <Box>
                            <Typography variant="body2">{ev.summary || "(No title)"}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {ev.start ? new Date(ev.start).toLocaleString() : ""}
                              {ev.location ? ` · ${ev.location}` : ""}
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItem>
                  );
                })}
              </MuiList>
              {filteredByTabAndSearch.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  {filteredByTab.length === 0 ? "No events in this category." : "No events match your search."}
                </Typography>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportDialogOpen(false)} disabled={importing}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleImportSelected}
            disabled={importing || previewLoading || previewEvents.length === 0 || selectedKeys.size === 0}
          >
            {importing ? "Importing…" : "Import selected"}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)}>
        <DialogTitle>Delete event?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Delete &quot;{deleteConfirm?.title}&quot;? This will also remove all registrations for this event. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeleteConfirm} autoFocus>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

