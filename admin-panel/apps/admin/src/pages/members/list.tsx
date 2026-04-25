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
import CircularProgress from "@mui/material/CircularProgress";
import { getToken, getStoredAdmin } from "../../lib/admin-auth";
import { apiUrl } from "../../lib/api-base";
import { useGridPreferences } from "../../lib/grid-preferences";
import { getRowAnimationClass, useAnimatedGridRows } from "../../lib/useAnimatedGridRows";
import { useTableActionLock } from "../../lib/useTableActionLock";

type MemberRow = {
  id: string;
  preferredName: string;
  email: string | null;
  createdAt: string;
  creditCents?: number;
};

export const MemberList: React.FC = () => {
  const [searchInput, setSearchInput] = useState("");
  const [rowSelectionModel, setRowSelectionModel] = useState<GridRowSelectionModel>({ type: "include", ids: new Set<string>() });
  const storedAdmin = getStoredAdmin();
  const isCoach = storedAdmin?.role === "COACH";
  const canManageCredits =
    storedAdmin?.role === "ADMIN" || storedAdmin?.permissions?.includes("CREDITS");
  const [resetPwOpen, setResetPwOpen] = useState(false);
  const [resetPwPassword, setResetPwPassword] = useState("");
  const [resetPwConfirm, setResetPwConfirm] = useState("");
  const [resetPwLoading, setResetPwLoading] = useState(false);
  const [resetPwError, setResetPwError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [uiRows, setUiRows] = useState<MemberRow[]>([]);
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [creditTarget, setCreditTarget] = useState<MemberRow | null>(null);
  const [creditDeltaInput, setCreditDeltaInput] = useState("");
  const [creditLoading, setCreditLoading] = useState(false);
  const tableLock = useTableActionLock();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { open: notify } = useNotification();

  const membersDataGrid = useDataGrid<MemberRow>({
    resource: "members",
    sorters: { initial: [{ field: "createdAt", order: "desc" }] },
    pagination: { current: 1, pageSize: 25 } as any,
  });
  const { dataGridProps, setFilters } = membersDataGrid;
  const refetchMembersList = (membersDataGrid as any)?.tableQueryResult?.refetch as
    | (() => Promise<unknown>)
    | undefined;

  const selectedIds = rowSelectionModel.type === "include" ? Array.from(rowSelectionModel.ids as Set<string>) : [];

  React.useEffect(() => {
    const next = searchInput.trim()
      ? [{ field: "q" as const, operator: "contains" as const, value: searchInput.trim() }]
      : [];
    setFilters(next);
  }, [searchInput, setFilters]);

  React.useEffect(() => {
    if (!isCoach) return;
    setRowSelectionModel({ type: "include", ids: new Set<string>() });
  }, [isCoach]);

  React.useEffect(() => {
    const refresh = () => {
      invalidate({ resource: "members", invalidates: ["list", "many", "detail"] });
      void refetchMembersList?.();
    };
    const onSoftRefresh = () => refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("sparrows:soft-refresh", onSoftRefresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(refresh, 20000);
    return () => {
      window.removeEventListener("sparrows:soft-refresh", onSoftRefresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [invalidate, refetchMembersList]);

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
      await tableLock.runWithLock("members:reset-password", selectedIds[0] ?? null, async () => {
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
        if (!res.ok) throw new Error(data?.message ?? "Reset failed.");
        setResetPwOpen(false);
        setResetPwPassword("");
        setResetPwConfirm("");
        setRowSelectionModel({ type: "include", ids: new Set() });
        invalidate({ resource: "members", invalidates: ["list", "many", "detail"] });
        await refetchMembersList?.();
      });
    } catch (error) {
      setResetPwError(error instanceof Error ? error.message : "Reset failed.");
    } finally {
      setResetPwLoading(false);
    }
  };

  const handleDeleteMembersConfirm = async () => {
    if (selectedIds.length === 0) return;
    const previousRows = uiRows;
    setDeleteLoading(true);
    try {
      setUiRows((prev) => prev.filter((row) => !selectedIds.includes(row.id)));
      await tableLock.runWithLock("members:delete-batch", selectedIds[0] ?? null, async () => {
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
        if (!res.ok) throw new Error(data?.message ?? "Delete failed");
        setDeleteOpen(false);
        setRowSelectionModel({ type: "include", ids: new Set() });
        invalidate({ resource: "members", invalidates: ["list", "many", "detail"] });
        await refetchMembersList?.();
      });
    } catch (error) {
      setUiRows(previousRows);
      notify?.({ type: "error", message: error instanceof Error ? error.message : "Delete failed" });
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
      ...(canManageCredits
        ? [
            {
              field: "creditCents",
              headerName: "Credit",
              width: 150,
              renderCell: ({ row }: { row: MemberRow }) => (
                <Button
                  size="small"
                  color="error"
                  disabled={tableLock.isLocked}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCreditTarget(row);
                    setCreditDeltaInput("");
                    setCreditDialogOpen(true);
                  }}
                >
                  AUD ${((row.creditCents ?? 0) / 100).toFixed(2)}
                </Button>
              ),
            } satisfies GridColDef,
          ]
        : []),
    ],
    [canManageCredits]
  );
  const gridPrefs = useGridPreferences("members-list", columns);
  const sourceRowsFromServer = (dataGridProps.rows ?? []) as MemberRow[];
  React.useEffect(() => {
    setUiRows(sourceRowsFromServer);
  }, [sourceRowsFromServer]);
  const sourceRows = uiRows;
  React.useEffect(() => {
    if (!dataGridProps.loading) setHasLoadedOnce(true);
  }, [dataGridProps.loading]);
  const animatedRows = useAnimatedGridRows<MemberRow>(
    sourceRows,
    React.useCallback((row: MemberRow) => row.id, []),
  );

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
        {!isCoach && (
          <>
            <Button
              variant="outlined"
              startIcon={<LockIcon />}
              disabled={selectedIds.length === 0 || tableLock.isLocked}
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
              disabled={selectedIds.length === 0 || tableLock.isLocked}
              sx={{ alignSelf: { xs: "stretch", sm: "auto" } }}
              onClick={() => setDeleteOpen(true)}
            >
              Delete member{selectedIds.length === 1 ? "" : "s"}{selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
            </Button>
          </>
        )}
      </Box>
      <Box sx={{ height: { xs: "calc(100dvh - 380px)", md: "calc(100dvh - 320px)" }, minHeight: 300 }}>
        <SaasDataGrid
          {...dataGridProps}
          rows={animatedRows}
          columns={gridPrefs.columns}
          loading={Boolean(dataGridProps.loading && !hasLoadedOnce)}
          checkboxSelection={!isCoach}
          rowSelectionModel={rowSelectionModel}
          onRowSelectionModelChange={setRowSelectionModel}
          columnVisibilityModel={gridPrefs.columnVisibilityModel}
          onColumnVisibilityModelChange={gridPrefs.onColumnVisibilityModelChange}
          onColumnWidthChange={gridPrefs.onColumnWidthChange}
          onRowClick={(params) => navigate(`/members/${params.id}`)}
          getRowClassName={(params) => {
            const row = params.row as MemberRow;
            return [getRowAnimationClass(row), tableLock.getRowStateClass(row.id)].filter(Boolean).join(" ");
          }}
          sx={{
            height: "100%",
            "& .MuiDataGrid-row": { cursor: "pointer" },
            ...(tableLock.isLocked ? { pointerEvents: "none" } : {}),
          }}
        />
      </Box>
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
      <Dialog open={creditDialogOpen} onClose={() => !creditLoading && setCreditDialogOpen(false)}>
        <DialogTitle>Adjust credit</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 1 }}>
            {creditTarget?.preferredName ?? "Member"} current credit: AUD $
            {((creditTarget?.creditCents ?? 0) / 100).toFixed(2)}
          </DialogContentText>
          <TextField
            fullWidth
            label="Delta (AUD, e.g. 10 or -5)"
            value={creditDeltaInput}
            onChange={(e) => setCreditDeltaInput(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreditDialogOpen(false)} disabled={creditLoading}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={creditLoading || !creditTarget || tableLock.isLocked}
            onClick={async () => {
              if (!creditTarget) return;
              const amount = Number(creditDeltaInput);
              const deltaCents = Math.round(amount * 100);
              if (!Number.isFinite(amount) || deltaCents === 0) return;
              setCreditLoading(true);
              const previousRows = uiRows;
              setUiRows((prev) =>
                prev.map((row) =>
                  row.id === creditTarget.id ? { ...row, creditCents: (row.creditCents ?? 0) + deltaCents } : row,
                ),
              );
              try {
                await tableLock.runWithLock("members:credit-adjust", creditTarget.id, async () => {
                  const token = getToken();
                  const res = await fetch(apiUrl(`/members/${creditTarget.id}/credit-adjust`), {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({ deltaCents }),
                  });
                  if (!res.ok) throw new Error("Credit adjustment failed");
                  setCreditDialogOpen(false);
                  await refetchMembersList?.();
                });
              } catch (error) {
                setUiRows(previousRows);
                notify?.({ type: "error", message: error instanceof Error ? error.message : "Credit adjustment failed" });
              } finally {
                setCreditLoading(false);
              }
            }}
          >
            {creditLoading ? <CircularProgress size={16} color="inherit" /> : "Apply"}
          </Button>
        </DialogActions>
      </Dialog>
    </List>
  );
};
