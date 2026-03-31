import React, { useCallback, useEffect, useMemo, useState } from "react";
import { List } from "../../components/SaasRefineMui";
import { useNotification } from "@refinedev/core";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { getToken } from "../../lib/admin-auth";
import { apiUrl } from "../../lib/api-base";

type AnnouncementRow = {
  id: string;
  message: string;
  createdAt: string;
  createdByUserName?: string | null;
};

const PAGE_SIZE = 10;

export const AnnouncementListPage: React.FC = () => {
  const { open } = useNotification();
  const [messageInput, setMessageInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [items, setItems] = useState<AnnouncementRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const loadPage = useCallback(async (nextOffset: number, append: boolean) => {
    setIsLoading(true);
    try {
      const token = getToken();
      const res = await fetch(apiUrl(`/announcements?_start=${nextOffset}&_end=${nextOffset + PAGE_SIZE}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const body = await res.json().catch(() => []);
      if (!res.ok) throw new Error((body as any)?.message ?? "Failed to load announcements");
      const list = Array.isArray(body) ? (body as AnnouncementRow[]) : [];
      const headerTotal = Number(res.headers.get("X-Total-Count") ?? String(list.length));
      setTotal(Number.isFinite(headerTotal) ? headerTotal : list.length);
      setOffset(nextOffset + list.length);
      setItems((prev) => (append ? [...prev, ...list] : list));
    } catch (e: any) {
      open?.({ type: "error", message: e?.message ?? "Failed to load announcements" });
    } finally {
      setIsLoading(false);
    }
  }, [open]);

  useEffect(() => {
    void loadPage(0, false);
  }, [loadPage]);

  const handlePost = async () => {
    const message = messageInput.trim();
    if (!message) {
      open?.({ type: "error", message: "Please enter announcement text." });
      return;
    }
    setIsSubmitting(true);
    try {
      const token = getToken();
      const res = await fetch(apiUrl("/announcements"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message ?? "Failed to post announcement");
      setMessageInput("");
      open?.({ type: "success", message: "Announcement posted" });
      void loadPage(0, false);
    } catch (e: any) {
      open?.({ type: "error", message: e?.message ?? "Failed to post announcement" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const token = getToken();
      const res = await fetch(apiUrl(`/announcements/${id}`), {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message ?? "Failed to delete");
      open?.({ type: "success", message: "Announcement deleted" });
      void loadPage(0, false);
    } catch (e: any) {
      open?.({ type: "error", message: e?.message ?? "Failed to delete announcement" });
    }
  };

  const canLoadMore = useMemo(() => items.length < total, [items.length, total]);

  return (
    <List title="Announcements">
      <Stack spacing={1.5} sx={{ mb: 2 }}>
        <TextField
          label="Announcement text"
          multiline
          minRows={3}
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          placeholder="Type announcement message to publish to sparrowsweb and sparrows-app."
        />
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Button variant="contained" onClick={handlePost} disabled={isSubmitting}>
            {isSubmitting ? "Posting..." : "Post announcement"}
          </Button>
        </Box>
      </Stack>

      <Typography variant="h6" sx={{ mb: 1 }}>History</Typography>
      <Stack spacing={1}>
        {items.map((item) => (
          <Box key={item.id} sx={{ border: 1, borderColor: "divider", borderRadius: 1.5, p: 1.5 }}>
            <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>{item.message}</Typography>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {new Date(item.createdAt).toLocaleString()} {item.createdByUserName ? `· by ${item.createdByUserName}` : ""}
              </Typography>
              <Button
                size="small"
                color="error"
                variant="outlined"
                startIcon={<DeleteOutlineIcon />}
                onClick={() => handleDelete(item.id)}
              >
                Delete
              </Button>
            </Stack>
          </Box>
        ))}
        {!isLoading && items.length === 0 && (
          <Typography variant="body2" color="text.secondary">No announcements yet.</Typography>
        )}
      </Stack>
      <Box sx={{ mt: 2, display: "flex", justifyContent: "center" }}>
        <Button variant="outlined" disabled={!canLoadMore || isLoading} onClick={() => void loadPage(offset, true)}>
          {isLoading ? "Loading..." : canLoadMore ? "Load More" : "No more records"}
        </Button>
      </Box>
    </List>
  );
};
