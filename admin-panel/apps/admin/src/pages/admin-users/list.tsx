import React, { useState } from "react";
import { List, useDataGrid, EditButton, CreateButton } from "../../components/SaasRefineMui";
import { useInvalidate, useNotification } from "@refinedev/core";
import { type GridColDef, type GridRowSelectionModel } from "@mui/x-data-grid";
import { SaasDataGrid } from "../../components/SaasDataGrid";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import { Link } from "react-router-dom";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { getToken, getStoredAdmin } from "../../lib/admin-auth";
import { apiUrl } from "../../lib/api-base";

type AdminUserRow = {
  id: string;
  userName: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  permissions: string[];
};

export const AdminUserList: React.FC = () => {
  const adminUsersDataGrid = useDataGrid<AdminUserRow>({
    resource: "admin-users",
    sorters: { initial: [{ field: "createdAt", order: "desc" }] },
  });
  const { dataGridProps } = adminUsersDataGrid;
  const refetchAdminUsersList = (adminUsersDataGrid as any)?.tableQueryResult?.refetch as
    | (() => Promise<unknown>)
    | undefined;

  const [rowSelectionModel, setRowSelectionModel] = useState<GridRowSelectionModel>({
    type: "include",
    ids: new Set<string>(),
  });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const invalidate = useInvalidate();
  const { open: notify } = useNotification();

  const selectedIds =
    rowSelectionModel.type === "include" ? Array.from(rowSelectionModel.ids as Set<string>) : [];

  const stored = getStoredAdmin();
  const selfId = stored?.id;
  const isAdminViewer = stored?.role === "ADMIN";

  const handleDeleteConfirm = async () => {
    if (selectedIds.length === 0) return;
    if (selfId && selectedIds.includes(selfId)) {
      notify?.({ type: "error", message: "You cannot delete your own account." });
      return;
    }
    setDeleteLoading(true);
    try {
      const token = getToken();
      const res = await fetch(apiUrl("/admin-users/delete-batch"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ids: selectedIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify?.({ type: "error", message: data?.message ?? "Delete failed" });
        return;
      }
      notify?.({
        type: "success",
        message: `Deleted ${data.deleted ?? 0} admin user(s).`,
      });
      setDeleteOpen(false);
      setRowSelectionModel({ type: "include", ids: new Set() });
      invalidate({ resource: "admin-users", invalidates: ["list", "many", "detail"] });
      await refetchAdminUsersList?.();
    } finally {
      setDeleteLoading(false);
    }
  };

  const columns = React.useMemo<GridColDef[]>(
    () => [
      {
        field: "userName",
        headerName: "User name",
        flex: 1,
        minWidth: 200,
        renderCell: ({ row, value }) => (
          <Box sx={{ position: "relative", width: "100%", height: "100%", minHeight: 52 }}>
            <Box
              component={Link}
              to={`/admin-users/${row.id}/edit`}
              sx={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                display: "flex",
                alignItems: "center",
                pl: 1,
                fontWeight: 500,
                textDecoration: "none",
                color: "inherit",
                "&:hover": { backgroundColor: "action.hover" },
              }}
            >
              {value ?? "—"}
            </Box>
          </Box>
        ),
      },
      {
        field: "role",
        headerName: "Role",
        width: 110,
        renderCell: ({ value }) => (
          <Chip label={value} size="small" color={value === "ADMIN" ? "primary" : "default"} />
        ),
      },
      {
        field: "isActive",
        headerName: "Active",
        width: 90,
        type: "boolean",
      },
      {
        field: "permissions",
        headerName: "Modules",
        flex: 1,
        minWidth: 200,
        valueGetter: (value: unknown) =>
          Array.isArray(value) ? (value as string[]).join(", ") : "—",
      },
      {
        field: "createdAt",
        headerName: "Created",
        width: 160,
        valueGetter: (value: unknown) =>
          value != null ? new Date(value as string).toLocaleString() : "—",
      },
      {
        field: "actions",
        headerName: "Actions",
        sortable: false,
        filterable: false,
        renderCell: ({ row }) => <EditButton hideText recordItemId={row.id} />,
        width: 80,
      },
    ],
    [],
  );

  const selectionIncludesSelf = Boolean(selfId && selectedIds.includes(selfId));

  return (
    <List
      title="Admin users"
      headerButtons={
        <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
          {isAdminViewer && <CreateButton>Create Admin user</CreateButton>}
          {isAdminViewer && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteOutlineIcon />}
              disabled={selectedIds.length === 0}
              onClick={() => setDeleteOpen(true)}
            >
              Delete user{selectedIds.length === 1 ? "" : "s"}
              {selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
            </Button>
          )}
        </Stack>
      }
    >
      <SaasDataGrid
        {...dataGridProps}
        columns={columns}
        autoHeight
        checkboxSelection={isAdminViewer}
        disableRowSelectionOnClick
        rowSelectionModel={rowSelectionModel}
        onRowSelectionModelChange={setRowSelectionModel}
      />
      <Dialog open={deleteOpen} onClose={() => !deleteLoading && setDeleteOpen(false)}>
        <DialogTitle>Delete admin user{selectedIds.length === 1 ? "" : "s"}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently remove {selectedIds.length} selected account
            {selectedIds.length === 1 ? "" : "s"} from the database. This cannot be undone.
          </DialogContentText>
          {selectionIncludesSelf && (
            <DialogContentText color="error" sx={{ mt: 1 }}>
              Your own account is selected — you cannot delete it. Deselect yourself or cancel.
            </DialogContentText>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)} disabled={deleteLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={deleteLoading || selectionIncludesSelf}
          >
            {deleteLoading ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </List>
  );
};
