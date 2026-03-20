import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useList, useNotification } from "@refinedev/core";
import { List } from "@refinedev/mui";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import EditOutlined from "@mui/icons-material/EditOutlined";
import Groups from "@mui/icons-material/Groups";
import { apiUrl } from "../../lib/api-base";

type DivisionRow = {
  id: string;
  tournamentId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
};

export const TournamentDivisions = () => {
  const { id: tournamentId } = useParams<{ id: string }>();
  const { open: openNotification } = useNotification();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<DivisionRow | null>(null);
  const [createName, setCreateName] = useState("");
  const [createSortOrder, setCreateSortOrder] = useState(0);
  const [editName, setEditName] = useState("");
  const [editSortOrder, setEditSortOrder] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { result, query } = useList({
    resource: "divisions",
    filters: tournamentId ? [{ field: "tournamentId", operator: "eq", value: tournamentId }] : [],
    queryOptions: { enabled: !!tournamentId },
  });

  const rows: DivisionRow[] = Array.isArray(result?.data) ? (result.data as DivisionRow[]) : [];
  const isLoading = query.isLoading;

  const handleCreate = async () => {
    if (!tournamentId) return;
    setSaving(true);
    try {
      const res = await fetch(apiUrl("/divisions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId,
          name: createName.trim(),
          sortOrder: createSortOrder,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? `Request failed: ${res.status}`);
      openNotification?.({ type: "success", message: "Division created." });
      setCreateOpen(false);
      setCreateName("");
      setCreateSortOrder(0);
      window.location.reload();
    } catch (e) {
      openNotification?.({
        type: "error",
        message: e instanceof Error ? e.message : "Failed to create division",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEditOpen = (row: DivisionRow) => {
    setEditRow(row);
    setEditName(row.name);
    setEditSortOrder(row.sortOrder);
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editRow) return;
    setSaving(true);
    try {
      const res = await fetch(apiUrl(`/divisions/${editRow.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), sortOrder: editSortOrder }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? `Request failed: ${res.status}`);
      openNotification?.({ type: "success", message: "Division updated." });
      setEditOpen(false);
      setEditRow(null);
      window.location.reload();
    } catch (e) {
      openNotification?.({
        type: "error",
        message: e instanceof Error ? e.message : "Failed to update division",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (divisionId: string) => {
    setDeletingId(divisionId);
    try {
      const res = await fetch(apiUrl(`/divisions/${divisionId}`), { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? `Request failed: ${res.status}`);
      openNotification?.({ type: "success", message: "Division deleted." });
      window.location.reload();
    } catch (e) {
      openNotification?.({
        type: "error",
        message: e instanceof Error ? e.message : "Failed to delete division",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const columns = React.useMemo<GridColDef[]>(
    () => [
      { field: "name", headerName: "Name", flex: 1, minWidth: 160 },
      { field: "sortOrder", headerName: "Order", width: 80 },
      {
        field: "createdAt",
        headerName: "Created at",
        width: 180,
        valueGetter: (value: unknown) =>
          value != null ? new Date(value as string).toLocaleString() : "—",
      },
      {
        field: "actions",
        headerName: "Actions",
        width: 160,
        sortable: false,
        renderCell: ({ row }: { row: DivisionRow }) => (
          <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
            <Button
              component={Link}
              to={`/tournaments/${tournamentId}/divisions/${row.id}/pools`}
              size="small"
              startIcon={<Groups />}
            >
              Pools
            </Button>
            <Button
              component={Link}
              to={`/tournaments/${tournamentId}/divisions/${row.id}/knockout`}
              size="small"
            >
              Knockout
            </Button>
            <IconButton
              size="small"
              aria-label="Edit"
              onClick={() => handleEditOpen(row)}
            >
              <EditOutlined fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              aria-label="Delete"
              disabled={!!deletingId}
              onClick={() => window.confirm("Delete this division? This is only allowed if no registrations use it.") && handleDelete(row.id)}
            >
              <DeleteOutline fontSize="small" />
            </IconButton>
          </Box>
        ),
      },
    ],
    [deletingId]
  );

  return (
    <>
      <List
        title="Divisions"
        headerButtons={
          <Button
            variant="contained"
            onClick={() => setCreateOpen(true)}
            disabled={!tournamentId}
          >
            Create Division
          </Button>
        }
      >
        <DataGrid
          rows={rows}
          columns={columns}
          autoHeight
          loading={isLoading}
          getRowId={(row: { id: string }) => row.id}
          disableRowSelectionOnClick
        />
      </List>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Division</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Name"
            fullWidth
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="e.g. Mixed A"
          />
          <TextField
            margin="dense"
            label="Sort order"
            type="number"
            fullWidth
            value={createSortOrder}
            onChange={(e) => setCreateSortOrder(Number(e.target.value) || 0)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!createName.trim() || saving}>
            {saving ? "Creating…" : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Division</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Name"
            fullWidth
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
          <TextField
            margin="dense"
            label="Sort order"
            type="number"
            fullWidth
            value={editSortOrder}
            onChange={(e) => setEditSortOrder(Number(e.target.value) || 0)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleEdit} disabled={!editName.trim() || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
