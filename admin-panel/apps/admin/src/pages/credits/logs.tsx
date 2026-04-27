import React from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import { useNotification } from "@refinedev/core";
import { getToken } from "../../lib/admin-auth";
import { apiUrl } from "../../lib/api-base";

type CreditLogRow = {
  id: string;
  createdAt: string;
  preferredName: string;
  email: string;
  beforeCreditCents: number;
  deltaCents: number;
  afterCreditCents: number;
  reason: "EVENT_UPDATE" | "MANUAL_UPDATE";
  note: string;
};

const PAGE_SIZE = 20;

function centsToAud(cents: number) {
  const sign = cents >= 0 ? "" : "-";
  return `${sign}AUD ${(Math.abs(cents) / 100).toFixed(2)}`;
}

function deltaLabel(cents: number) {
  const sign = cents >= 0 ? "+" : "-";
  return `${sign}AUD ${(Math.abs(cents) / 100).toFixed(2)}`;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("en-AU", { hour12: false });
}

export const CreditLogsPage: React.FC = () => {
  const { open } = useNotification();
  const [query, setQuery] = React.useState("");
  const [logsDesc, setLogsDesc] = React.useState<CreditLogRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [initialLoading, setInitialLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(true);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  const fetchPage = React.useCallback(
    async (start: number, append: boolean) => {
      const token = getToken();
      if (!token) return;
      const end = start + PAGE_SIZE;
      const q = query.trim();
      const qs = new URLSearchParams({
        _start: String(start),
        _end: String(end),
      });
      if (q) qs.set("q", q);

      const res = await fetch(apiUrl(`/credits/logs?${qs.toString()}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => []);
      if (!res.ok) {
        throw new Error((body as { message?: string })?.message ?? "Failed to load credit logs");
      }
      const rows = Array.isArray(body) ? (body as CreditLogRow[]) : [];
      const nextTotal = Number(res.headers.get("X-Total-Count") ?? rows.length);
      setTotal(nextTotal);
      setHasMore(start + rows.length < nextTotal);
      setLogsDesc((prev) => (append ? [...prev, ...rows] : rows));
    },
    [query],
  );

  React.useEffect(() => {
    let cancelled = false;
    setInitialLoading(true);
    setHasMore(true);
    setLogsDesc([]);

    const timer = window.setTimeout(async () => {
      try {
        await fetchPage(0, false);
      } catch (e: unknown) {
        if (!cancelled) {
          open?.({ type: "error", message: e instanceof Error ? e.message : "Failed to load credit logs" });
        }
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fetchPage, open]);

  const loadOlder = React.useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const scroller = scrollRef.current;
    const oldHeight = scroller?.scrollHeight ?? 0;
    setLoadingMore(true);
    try {
      await fetchPage(logsDesc.length, true);
      requestAnimationFrame(() => {
        if (!scroller) return;
        const newHeight = scroller.scrollHeight;
        scroller.scrollTop = newHeight - oldHeight + scroller.scrollTop;
      });
    } catch (e: unknown) {
      open?.({ type: "error", message: e instanceof Error ? e.message : "Failed to load older logs" });
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, hasMore, loadingMore, logsDesc.length, open]);

  const handleScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const el = event.currentTarget;
      if (el.scrollTop <= 40 && hasMore && !loadingMore) {
        void loadOlder();
      }
    },
    [hasMore, loadingMore, loadOlder],
  );

  const logsAsc = React.useMemo(() => [...logsDesc].reverse(), [logsDesc]);

  return (
    <Box sx={{ px: { xs: 1, md: 2 }, py: 1 }}>
      <Typography variant="h5" sx={{ mb: 1, fontWeight: 700 }}>
        Credit log
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Showing {logsAsc.length} / {total} logs. Newest entries are at the bottom. Scroll up to load older rows.
      </Typography>

      <Paper variant="outlined" sx={{ height: { xs: "60vh", md: "65vh" }, display: "flex", flexDirection: "column" }}>
        <Box
          ref={scrollRef}
          onScroll={handleScroll}
          sx={{
            flex: 1,
            overflowY: "auto",
            px: 1.5,
            py: 1,
            bgcolor: "background.default",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 13,
            whiteSpace: "nowrap",
          }}
        >
          {initialLoading ? (
            <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 200 }}>
              <CircularProgress size={24} />
            </Stack>
          ) : logsAsc.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No credit logs found.
            </Typography>
          ) : (
            <Stack spacing={0.5}>
              {loadingMore && (
                <Stack direction="row" alignItems="center" spacing={1} sx={{ py: 0.5 }}>
                  <CircularProgress size={14} />
                  <Typography variant="caption" color="text.secondary">
                    Loading older logs...
                  </Typography>
                </Stack>
              )}
              {logsAsc.map((row) => (
                <React.Fragment key={row.id}>
                  <Typography component="div">
                    [{formatDateTime(row.createdAt)}] {row.preferredName} &lt;{row.email}&gt; | before:{" "}
                    {centsToAud(row.beforeCreditCents)} | delta: {deltaLabel(row.deltaCents)} | after:{" "}
                    {centsToAud(row.afterCreditCents)} | reason: {row.reason} | note: {row.note}
                  </Typography>
                  <Divider />
                </React.Fragment>
              ))}
            </Stack>
          )}
        </Box>

        <Box sx={{ p: 1.25, borderTop: 1, borderColor: "divider" }}>
          <TextField
            fullWidth
            label="Search logs"
            placeholder="Type to search preferred name, email, reason, note..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            size="small"
          />
        </Box>
      </Paper>
    </Box>
  );
};
