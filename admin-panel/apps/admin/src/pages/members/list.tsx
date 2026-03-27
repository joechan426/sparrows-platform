import React, { useState, useMemo } from "react";
import { List, useDataGrid } from "../../components/SaasRefineMui";
import { useInvalidate, useNotification } from "@refinedev/core";
import { type GridColDef, type GridRowSelectionModel } from "@mui/x-data-grid";
import { SaasDataGrid } from "../../components/SaasDataGrid";
import { useNavigate } from "react-router-dom";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import SearchIcon from "@mui/icons-material/Search";
import LockIcon from "@mui/icons-material/Lock";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { getToken } from "../../lib/admin-auth";
import { apiUrl } from "../../lib/api-base";
import { useGridPreferences } from "../../lib/grid-preferences";

type MemberRow = {
  id: string;
  preferredName: string;
  email: string;
  createdAt: string;
};

export const MemberList: React.FC = () => {
  const [searchInput, setSearchInput] = useState("");
  const [rowSelectionModel, setRowSelectionModel] = useState<GridRowSelectionModel>({ type: "include", ids: new Set<string>() });
  const [resetPwOpen, setResetPwOpen] = useState(false);
  const [resetPwPassword, setResetPwPassword] = useState("");
  const [resetPwConfirm, setResetPwConfirm] = useState("");
  const [resetPwLoading, setResetPwLoading] = useState(false);
  const [resetPwError, setResetPwError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { open: notify } = useNotification();

  const { dataGridProps, setFilters } = useDataGrid<MemberRow>({
    resource: "members",
    sorters: { initial: [{ field: "createdAt", order: "desc" }] },
    pagination: { current: 1, pageSize: 25 } as any,
  });

  const selectedIds = rowSelectionModel.type === "include" ? Array.from(rowSelectionModel.ids as Set<string>) : [];

  React.useEffect(() => {
    const next = searchInput.trim()
      ? [{ field: "q" as const, operator: "contains" as const, value: searchInput.trim() }]
      : [];
    setFilters(next);
  }, [searchInput, setFilters]);

  const handleResetPasswordSubmit = async () => {
    setResetPwError("");
    if (resetPwPassword.length < 6) {
      setResetPwError("Password must be at least 6 characters.");
      return;
    }
    if (resetPwPassword !== resetPwConfirm) {
      setResetPwError("Passwords do not match.");
      return;
    }
    setResetPwLoading(true);
    try {
      const token = getToken();
      const res = await fetch(apiUrl("/members/reset-password"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ memberIds: selectedIds, newPassword: resetPwPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResetPwError(data?.message ?? "Reset failed.");
        return;
      }
      setResetPwOpen(false);
      setResetPwPassword("");
      setResetPwConfirm("");
      setRowSelectionModel({ type: "include", ids: new Set() });
      invalidate({ resource: "members", invalidates: ["list", "many", "detail"] });
    } finally {
      setResetPwLoading(false);
    }
  };

  const handleDeleteMembersConfirm = async () => {
    if (selectedIds.length === 0) return;
    setDeleteLoading(true);
    try {
      const token = getToken();
      const res = await fetch(apiUrl("/members/delete-batch"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ memberIds: selectedIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify?.({ type: "error", message: data?.message ?? "Delete failed" });
        return;
      }
      notify?.({
        type: "success",
        message: `Deleted ${data.deletedMembers ?? 0} member(s). Removed ${data.deletedRegistrations ?? 0} event registration(s).`,
      });
      setDeleteOpen(false);
      setRowSelectionModel({ type: "include", ids: new Set() });
      invalidate({ resource: "members", invalidates: ["list", "many", "detail"] });
    } finally {
      setDeleteLoading(false);
    }
  };

  const columns = React.useMemo<GridColDef[]>(
    () => [
      {
        field: "preferredName",
        headerName: "Name",
        flex: 1,
        minWidth: 160,
        align: "left",
        renderCell: ({ row }) => (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              height: "100%",
              width: "100%",
              textAlign: "left",
            }}
          >
            <Typography variant="body2" color="primary" sx={{ fontWeight: 500 }}>
              {row.preferredName ?? "—"}
            </Typography>
          </Box>
        ),
      },
      {
        field: "email",
        headerName: "Email",
        flex: 1,
        minWidth: 200,
      },
      {
        field: "createdAt",
        headerName: "Created at",
        width: 180,
        valueGetter: (value: unknown) =>
          value != null && value !== ""
            ? new Date(value as string).toLocaleString()
            : "—",
      },
    ],
    []
  );
  const gridPrefs = useGridPreferences("members-list", columns);

  return (
    <List title="Members">
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          flexWrap: "wrap",
          gap: 2,
          alignItems: { xs: "stretch", sm: "center" },
          mb: 2,
        }}
      >
        <TextField
          size="small"
          placeholder="Search by name or email…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          sx={{ width: { xs: "100%", sm: "auto" }, maxWidth: { xs: "100%", sm: 400 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon color="action" />
              </InputAdornment>
            ),
          }}
        />
        <Button
          variant="outlined"
          startIcon={<LockIcon />}
          disabled={selectedIds.length === 0}
          sx={{ alignSelf: { xs: "stretch", sm: "auto" } }}
          onClick={() => {
            setResetPwError("");
            setResetPwPassword("");
            setResetPwConfirm("");
            setResetPwOpen(true);
          }}
        >
          Reset password {selectedIds.length > 0 ? `(${selectedIds.length})` : ""}
        </Button>
        <Button
          variant="outlined"
          color="error"
          startIcon={<DeleteOutlineIcon />}
          disabled={selectedIds.length === 0}
          sx={{ alignSelf: { xs: "stretch", sm: "auto" } }}
          onClick={() => setDeleteOpen(true)}
        >
          Delete member{selectedIds.length === 1 ? "" : "s"}{selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
        </Button>
      </Box>
      <SaasDataGrid
        {...dataGridProps}
        columns={gridPrefs.columns}
        autoHeight
        checkboxSelection
        rowSelectionModel={rowSelectionModel}
        onRowSelectionModelChange={setRowSelectionModel}
        columnVisibilityModel={gridPrefs.columnVisibilityModel}
        onColumnVisibilityModelChange={gridPrefs.onColumnVisibilityModelChange}
        onColumnWidthChange={gridPrefs.onColumnWidthChange}
        onRowClick={(params) => navigate(`/members/${params.id}`)}
        sx={{
          "& .MuiDataGrid-row": { cursor: "pointer" },
        }}
      />
      <Dialog open={resetPwOpen} onClose={() => !resetPwLoading && setResetPwOpen(false)}>
        <DialogTitle>Reset password</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Set a new password for {selectedIds.length} selected member(s). They will need to use this password to log in.
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            type="password"
            label="New password"
            value={resetPwPassword}
            onChange={(e) => setResetPwPassword(e.target.value)}
            sx={{ mb: 1 }}
          />
          <TextField
            fullWidth
            type="password"
            label="Confirm new password"
            value={resetPwConfirm}
            onChange={(e) => setResetPwConfirm(e.target.value)}
          />
          {resetPwError && (
            <Typography color="error" variant="body2" sx={{ mt: 1 }}>
              {resetPwError}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetPwOpen(false)} disabled={resetPwLoading}>
            Cancel
          </Button>
          <Button onClick={handleResetPasswordSubmit} variant="contained" disabled={resetPwLoading}>
            {resetPwLoading ? "Saving…" : "Reset password"}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={deleteOpen} onClose={() => !deleteLoading && setDeleteOpen(false)}>
        <DialogTitle>Delete member{selectedIds.length === 1 ? "" : "s"}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently remove {selectedIds.length} selected member
            {selectedIds.length === 1 ? "" : "s"} from the database and delete all of their event registrations.
            This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)} disabled={deleteLoading}>
            Cancel
          </Button>
          <Button onClick={handleDeleteMembersConfirm} color="error" variant="contained" disabled={deleteLoading}>
            {deleteLoading ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </List>
  );
};
