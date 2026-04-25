import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useNotification } from "@refinedev/core";
import { List } from "../../components/SaasRefineMui";
import { SaasDataGrid } from "../../components/SaasDataGrid";
import { type GridColDef } from "@mui/x-data-grid";
import { useGridPreferences } from "../../lib/grid-preferences";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import { getToken } from "../../lib/admin-auth";
import { apiUrl } from "../../lib/api-base";
import { getRowAnimationClass, useAnimatedGridRows } from "../../lib/useAnimatedGridRows";
import { useTableActionLock } from "../../lib/useTableActionLock";

type PaidRow = {
  id: string;
  memberId: string;
  memberPreferredName: string;
  memberEmail: string | null;
  eventId: string;
  eventTitle: string;
  eventStartAt: string;
  paymentProvider: "STRIPE" | "PAYPAL" | "MANUAL" | null;
  currency: string;
  amountPaidCents: number;
  paidAt: string | null;
  createdAt: string;
};

function currentMonthValue(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function registeredAtDisplay(row: PaidRow): string {
  const iso = row.paidAt ?? row.createdAt;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "—";
  }
}

function escapeCsvCell(value: string): string {
  const s = String(value ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const PaymentRevenueListPage: React.FC = () => {
  const { open: notify } = useNotification();
  const tableLock = useTableActionLock();
  const [monthFilter, setMonthFilter] = useState<string>(currentMonthValue());
  const [showAll, setShowAll] = useState(false);
  const [rows, setRows] = useState<PaidRow[]>([]);
  const [loading, setLoading] = useState(true);
  const animatedRows = useAnimatedGridRows<PaidRow>(
    rows,
    React.useCallback((row: PaidRow) => row.id, []),
  );

  const load = useCallback(async (showSkeleton: boolean) => {
    const token = getToken();
    if (!token) return;
    if (showSkeleton) setLoading(true);
    try {
      const q = showAll ? "month=all" : `month=${encodeURIComponent(monthFilter)}`;
      const res = await fetch(apiUrl(`/payments/paid-registrations?${q}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify?.({ type: "error", message: body?.message ?? "Failed to load payments" });
        setRows([]);
        return;
      }
      setRows(Array.isArray(body.data) ? body.data : []);
    } catch (e) {
      notify?.({ type: "error", message: e instanceof Error ? e.message : "Failed to load payments" });
      setRows([]);
    } finally {
      if (showSkeleton) setLoading(false);
    }
  }, [monthFilter, showAll, notify]);

  useEffect(() => {
    void load(true);
  }, [monthFilter, showAll, load]);

  useEffect(() => {
    const refresh = () => {
      void load(false);
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
  }, [load]);

  const stats = useMemo(() => {
    const eventIds = new Set(rows.map((r) => r.eventId));
    const memberIds = new Set(rows.map((r) => r.memberId));
    const totalCents = rows.reduce((s, r) => s + (r.amountPaidCents ?? 0), 0);
    const currencies = [...new Set(rows.map((r) => (r.currency ?? "AUD").toUpperCase()))];
    return {
      eventCount: eventIds.size,
      memberCount: memberIds.size,
      totalCents,
      currencies,
    };
  }, [rows]);

  const exportCsv = useCallback(() => {
    tableLock.begin("payments:export-csv", null);
    if (rows.length === 0) {
      notify?.({ type: "error", message: "No rows to export for the current filter." });
      tableLock.finishError(null);
      return;
    }
    const headers = ["Member", "Email", "Event", "Start", "Payment Provider", "Currency", "Paid", "Registered At"];
    const body = rows.map((r) =>
      [
        r.memberPreferredName ?? "",
        r.memberEmail ?? "",
        r.eventTitle ?? "",
        (() => {
          try {
            return new Date(r.eventStartAt).toLocaleString();
          } catch {
            return "—";
          }
        })(),
        r.paymentProvider ?? "—",
        r.currency ?? "AUD",
        ((r.amountPaidCents ?? 0) / 100).toFixed(2),
        registeredAtDisplay(r),
      ]
        .map((c) => escapeCsvCell(c))
        .join(","),
    );
    const csv = [headers.map((h) => escapeCsvCell(h)).join(","), ...body].join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const suffix = showAll ? "all" : monthFilter.replace(/-/g, "") || "export";
    a.href = url;
    a.download = `payments-${suffix}.csv`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    notify?.({ type: "success", message: `Exported ${rows.length} row(s) to CSV.` });
    void tableLock.finishSuccess();
  }, [rows, showAll, monthFilter, notify, tableLock]);

  const columns = useMemo<GridColDef[]>(
    () => [
      {
        field: "memberPreferredName",
        headerName: "Member",
        flex: 1,
        minWidth: 140,
        renderCell: ({ row }) => (
          <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
            <Typography component={Link} to={`/members/${row.memberId}`} variant="body2" color="primary" sx={{ fontWeight: 500 }}>
              {row.memberPreferredName ?? "—"}
            </Typography>
          </Box>
        ),
      },
      {
        field: "memberEmail",
        headerName: "Email",
        flex: 1,
        minWidth: 200,
        renderCell: ({ row }) => (
          <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
            {row.memberEmail ? (
              <Typography component={Link} to={`/members/${row.memberId}`} variant="body2" color="primary">
                {row.memberEmail}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.primary">
                {""}
              </Typography>
            )}
          </Box>
        ),
      },
      {
        field: "eventTitle",
        headerName: "Event",
        flex: 1,
        minWidth: 180,
        renderCell: ({ row }) => (
          <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
            <Typography component={Link} to={`/events/${row.eventId}/registrations`} variant="body2" color="primary">
              {row.eventTitle ?? "—"}
            </Typography>
          </Box>
        ),
      },
      {
        field: "eventStartAt",
        headerName: "Start",
        width: 190,
        valueGetter: (_v, row) => {
          try {
            return new Date(row.eventStartAt).toLocaleString();
          } catch {
            return "—";
          }
        },
        renderCell: ({ row }) => (
          <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
            <Typography component={Link} to={`/events/${row.eventId}`} variant="body2" color="text.primary">
              {(() => {
                try {
                  return new Date(row.eventStartAt).toLocaleString();
                } catch {
                  return "—";
                }
              })()}
            </Typography>
          </Box>
        ),
      },
      {
        field: "paymentProvider",
        headerName: "Payment Provider",
        width: 160,
        valueGetter: (_v, row) => {
          if (row.paymentProvider === "STRIPE") return "Stripe";
          if (row.paymentProvider === "PAYPAL") return "PayPal";
          if (row.paymentProvider === "MANUAL") return "Manual";
          return "—";
        },
      },
      {
        field: "amountPaidCents",
        headerName: "Paid",
        width: 120,
        align: "right",
        headerAlign: "right",
        renderCell: ({ row }) => {
          const amt = (row.amountPaidCents ?? 0) / 100;
          const ccy = row.currency ?? "AUD";
          return (
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", width: "100%", height: "100%" }}>
              <Typography component={Link} to={`/events/${row.eventId}`} variant="body2" sx={{ fontWeight: 600 }}>
                {ccy} ${amt.toFixed(2)}
              </Typography>
            </Box>
          );
        },
      },
      {
        field: "registeredAt",
        headerName: "Registered At",
        width: 200,
        sortable: false,
        valueGetter: (_v, row) => registeredAtDisplay(row),
        renderCell: ({ row }) => (
          <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
            <Typography component={Link} to={`/events/${row.eventId}`} variant="body2" color="text.primary">
              {registeredAtDisplay(row)}
            </Typography>
          </Box>
        ),
      },
    ],
    [],
  );

  const gridPrefs = useGridPreferences("payments-paid-revenue", columns);

  return (
    <List title="Payments">
      <Stack spacing={2} sx={{ mb: 2 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          alignItems={{ xs: "stretch", sm: "center" }}
          flexWrap="wrap"
        >
          <TextField
            select
            size="small"
            label="Period"
            value={showAll ? "all" : "month"}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "all") setShowAll(true);
              else {
                setShowAll(false);
                if (!monthFilter) setMonthFilter(currentMonthValue());
              }
            }}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="month">Single month</MenuItem>
            <MenuItem value="all">All time</MenuItem>
          </TextField>
          {!showAll && (
            <TextField
              type="month"
              size="small"
              label="Month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 200 }}
            />
          )}
        </Stack>

        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 1, sm: 4 }}
          sx={{
            py: 1.5,
            px: 2,
            borderRadius: 2,
            border: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Events in view:{" "}
            <Box component="span" sx={{ fontWeight: 800, color: "warning.main" }}>
              {stats.eventCount}
            </Box>
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Members in view:{" "}
            <Box component="span" sx={{ fontWeight: 800, color: "warning.main" }}>
              {stats.memberCount}
            </Box>
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Total paid:{" "}
            {stats.currencies.length <= 1 ? (
              <Box component="span" sx={{ fontWeight: 700, color: "success.dark" }}>
                {stats.currencies[0] ?? "AUD"} ${(stats.totalCents / 100).toFixed(2)}
              </Box>
            ) : (
              <Box component="span" sx={{ fontWeight: 600, color: "warning.dark" }}>
                Multiple currencies — see Paid column
              </Box>
            )}
          </Typography>
        </Stack>

        <Stack direction="row" justifyContent="flex-end" alignItems="center" sx={{ flexWrap: "wrap", gap: 1 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<DownloadOutlinedIcon />}
            onClick={exportCsv}
            disabled={loading || tableLock.isLocked || rows.length === 0}
          >
            {tableLock.isActionRunning("payments:export-csv") ? "Exporting…" : "Export CSV"}
          </Button>
        </Stack>
      </Stack>

      <Box sx={{ position: "relative", height: { xs: "calc(100dvh - 470px)", md: "calc(100dvh - 380px)" }, minHeight: 300 }}>
        {loading && (
          <Box sx={{ position: "absolute", right: 8, top: -40, zIndex: 1 }}>
            <CircularProgress size={22} />
          </Box>
        )}
        <SaasDataGrid
          rows={animatedRows}
          columns={gridPrefs.columns}
          loading={loading}
          getRowId={(r) => r.id}
          columnVisibilityModel={gridPrefs.columnVisibilityModel}
          onColumnVisibilityModelChange={gridPrefs.onColumnVisibilityModelChange}
          onColumnWidthChange={gridPrefs.onColumnWidthChange}
          disableRowSelectionOnClick
          getRowClassName={(params) => getRowAnimationClass(params.row as PaidRow)}
          sx={{ height: "100%", ...(loading || tableLock.isLocked ? { pointerEvents: "none" } : {}) }}
        />
      </Box>
    </List>
  );
};
