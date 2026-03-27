import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useList, useNotification } from "@refinedev/core";
import { List } from "../../components/SaasRefineMui";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import EditOutlined from "@mui/icons-material/EditOutlined";
import PersonAdd from "@mui/icons-material/PersonAdd";
import PersonRemove from "@mui/icons-material/PersonRemove";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableBody from "@mui/material/TableBody";
import { apiUrl } from "../../lib/api-base";

type PoolRow = {
  id: string;
  divisionId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
};

type RegistrationOption = {
  id: string;
  team?: { name: string };
  status: string;
  poolId?: string | null;
};

export const TournamentDivisionPools = () => {
  const { id: tournamentId, divisionId } = useParams<{ id: string; divisionId: string }>();
  const { open: openNotification } = useNotification();
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<PoolRow | null>(null);
  const [createName, setCreateName] = useState("");
  const [createSortOrder, setCreateSortOrder] = useState(0);
  const [editName, setEditName] = useState("");
  const [editSortOrder, setEditSortOrder] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addTeamPoolId, setAddTeamPoolId] = useState<string | null>(null);
  const [approvedRegistrations, setApprovedRegistrations] = useState<RegistrationOption[]>([]);
  const [registrationsLoading, setRegistrationsLoading] = useState(false);

  const { result, query } = useList({
    resource: "pools",
    filters: divisionId ? [{ field: "divisionId", operator: "eq", value: divisionId }] : [],
    queryOptions: { enabled: !!divisionId },
  });

  const pools: PoolRow[] = Array.isArray(result?.data) ? (result.data as PoolRow[]) : [];
  const isLoading = query.isLoading;

  useEffect(() => {
    if (!addTeamPoolId || !tournamentId) return;
    setRegistrationsLoading(true);
    fetch(apiUrl(`/tournament-registrations?tournamentId=${tournamentId}&_start=0&_end=200`))
      .then((res) => res.json())
      .then((data: (RegistrationOption & { divisionId?: string })[]) => {
        const list = Array.isArray(data) ? data : [];
        setApprovedRegistrations(
          list.filter((r) => r.status === "APPROVED" && r.divisionId === divisionId)
        );
      })
      .catch(() => setApprovedRegistrations([]))
      .finally(() => setRegistrationsLoading(false));
  }, [addTeamPoolId, tournamentId, divisionId]);

  const handleCreate = async () => {
    if (!divisionId) return;
    setSaving(true);
    try {
      const res = await fetch(apiUrl("/pools"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          divisionId,
          name: createName.trim(),
          sortOrder: createSortOrder,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? `Request failed: ${res.status}`);
      openNotification?.({ type: "success", message: "Pool created." });
      setCreateOpen(false);
      setCreateName("");
      setCreateSortOrder(0);
      window.location.reload();
    } catch (e) {
      openNotification?.({
        type: "error",
        message: e instanceof Error ? e.message : "Failed to create pool",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEditOpen = (row: PoolRow) => {
    setEditRow(row);
    setEditName(row.name);
    setEditSortOrder(row.sortOrder);
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editRow) return;
    setSaving(true);
    try {
      const res = await fetch(apiUrl(`/pools/${editRow.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), sortOrder: editSortOrder }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? `Request failed: ${res.status}`);
      openNotification?.({ type: "success", message: "Pool updated." });
      setEditOpen(false);
      setEditRow(null);
      window.location.reload();
    } catch (e) {
      openNotification?.({
        type: "error",
        message: e instanceof Error ? e.message : "Failed to update pool",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (poolId: string) => {
    setDeletingId(poolId);
    try {
      const res = await fetch(apiUrl(`/pools/${poolId}`), { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? `Request failed: ${res.status}`);
      openNotification?.({ type: "success", message: "Pool deleted." });
      window.location.reload();
    } catch (e) {
      openNotification?.({
        type: "error",
        message: e instanceof Error ? e.message : "Failed to delete pool",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleAddToPool = async (registrationId: string, poolId: string) => {
    try {
      const res = await fetch(apiUrl(`/tournament-registrations/${registrationId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poolId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? `Request failed: ${res.status}`);
      openNotification?.({ type: "success", message: "Team added to pool." });
      setAddTeamPoolId(null);
      window.location.reload();
    } catch (e) {
      openNotification?.({
        type: "error",
        message: e instanceof Error ? e.message : "Failed to add team",
      });
    }
  };

  const handleRemoveFromPool = async (registrationId: string) => {
    try {
      const res = await fetch(apiUrl(`/tournament-registrations/${registrationId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poolId: null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? `Request failed: ${res.status}`);
      openNotification?.({ type: "success", message: "Team removed from pool." });
      window.location.reload();
    } catch (e) {
      openNotification?.({
        type: "error",
        message: e instanceof Error ? e.message : "Failed to remove team",
      });
    }
  };

  const [poolRegistrations, setPoolRegistrations] = useState<Record<string, RegistrationOption[]>>({});
  useEffect(() => {
    if (!tournamentId || !divisionId || pools.length === 0) return;
    fetch(apiUrl(`/tournament-registrations?tournamentId=${tournamentId}&_start=0&_end=500`))
      .then((res) => res.json())
      .then((data: (RegistrationOption & { poolId?: string | null; divisionId?: string })[]) => {
        const list = Array.isArray(data) ? data : [];
        const byPool: Record<string, RegistrationOption[]> = {};
        pools.forEach((p) => (byPool[p.id] = []));
        list.forEach((r) => {
          if (r.status === "APPROVED" && r.divisionId === divisionId) {
            const pid = r.poolId ?? (r as { pool?: { id: string } }).pool?.id;
            if (pid) {
              if (!byPool[pid]) byPool[pid] = [];
              byPool[pid].push(r);
            }
          }
        });
        setPoolRegistrations(byPool);
      })
      .catch(() => setPoolRegistrations({}));
  }, [tournamentId, divisionId, pools]);

  const availableToAdd = addTeamPoolId
    ? approvedRegistrations.filter((r) => !(r.poolId ?? (r as { pool?: { id: string } }).pool?.id))
    : [];

  return (
    <>
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary" component={Link} to={`/tournaments/${tournamentId}/divisions`} sx={{ textDecoration: "none" }}>
          ← Back to Divisions
        </Typography>
      </Box>
      <List
        title="Pools"
        headerButtons={
          <Button variant="contained" onClick={() => setCreateOpen(true)} disabled={!divisionId}>
            Create Pool
          </Button>
        }
      >
        {isLoading ? (
          <Typography>Loading…</Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {pools.map((pool) => (
              <Box
                key={pool.id}
                sx={{
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1,
                  p: 2,
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                  <Typography variant="h6">{pool.name}</Typography>
                  <IconButton size="small" aria-label="Edit" onClick={() => handleEditOpen(pool)}>
                    <EditOutlined fontSize="small" />
                  </IconButton>
                  <Button
                    size="small"
                    startIcon={<PersonAdd />}
                    onClick={() => setAddTeamPoolId(pool.id)}
                  >
                    Add team
                  </Button>
                  <IconButton
                    size="small"
                    aria-label="Delete"
                    disabled={!!deletingId}
                    onClick={() =>
                      window.confirm("Delete this pool? Only allowed if no teams are assigned.") &&
                      handleDelete(pool.id)
                    }
                  >
                    <DeleteOutline fontSize="small" />
                  </IconButton>
                </Box>
                <Typography variant="subtitle2" sx={{ mt: 1 }}>
                  Teams
                </Typography>
                <Box component="ul" sx={{ m: 0, pl: 2.5, mb: 2 }}>
                  {(poolRegistrations[pool.id] ?? []).map((reg) => (
                    <ListItem key={reg.id} disablePadding sx={{ py: 0.25 }}>
                      <ListItemText primary={reg.team?.name ?? reg.id} />
                      <IconButton
                        size="small"
                        aria-label="Remove"
                        onClick={() => handleRemoveFromPool(reg.id)}
                      >
                        <PersonRemove fontSize="small" />
                      </IconButton>
                    </ListItem>
                  ))}
                </Box>

                <PoolMatchesAndStandings poolId={pool.id} />
              </Box>
            ))}
          </Box>
        )}
      </List>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Pool</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Name"
            fullWidth
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="e.g. Pool A"
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
        <DialogTitle>Edit Pool</DialogTitle>
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

      <Dialog open={!!addTeamPoolId} onClose={() => setAddTeamPoolId(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Add team to pool</DialogTitle>
        <DialogContent>
          {registrationsLoading ? (
            <Typography>Loading…</Typography>
          ) : (
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {availableToAdd
                .filter((r) => !r.poolId)
                .map((reg) => (
                  <ListItem key={reg.id} disablePadding>
                    <ListItemText primary={reg.team?.name ?? reg.id} />
                    <Button
                      size="small"
                      onClick={() => addTeamPoolId && handleAddToPool(reg.id, addTeamPoolId)}
                    >
                      Add
                    </Button>
                  </ListItem>
                ))}
              {availableToAdd.filter((r) => !r.poolId).length === 0 && (
                <Typography color="text.secondary">No approved teams left to add (all are already in a pool).</Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddTeamPoolId(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

type PoolMatchesAndStandingsProps = {
  poolId: string;
};

const PoolMatchesAndStandings: React.FC<PoolMatchesAndStandingsProps> = ({ poolId }) => {
  const { open: openNotification } = useNotification();
  const [tab, setTab] = useState<"matches" | "standings">("matches");
  const [matches, setMatches] = useState<any[]>([]);
  const [standings, setStandings] = useState<any[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [loadingStandings, setLoadingStandings] = useState(false);
  const [scoreDialogOpen, setScoreDialogOpen] = useState(false);
  const [scoreMatch, setScoreMatch] = useState<any | null>(null);
  const [setScores, setSetScores] = useState<{ setNumber: number; teamAScore: string; teamBScore: string }[]>([
    { setNumber: 1, teamAScore: "", teamBScore: "" },
    { setNumber: 2, teamAScore: "", teamBScore: "" },
    { setNumber: 3, teamAScore: "", teamBScore: "" },
  ]);
  const [savingScores, setSavingScores] = useState(false);

  const loadMatches = () => {
    setLoadingMatches(true);
    fetch(apiUrl(`/pool-matches?poolId=${poolId}`))
      .then((res) => res.json())
      .then((data) => {
        setMatches(Array.isArray(data) ? data : []);
      })
      .catch(() => setMatches([]))
      .finally(() => setLoadingMatches(false));
  };

  const loadStandings = () => {
    setLoadingStandings(true);
    fetch(apiUrl(`/pools/${poolId}/standings`))
      .then((res) => res.json())
      .then((data) => {
        setStandings(Array.isArray(data) ? data : []);
      })
      .catch(() => setStandings([]))
      .finally(() => setLoadingStandings(false));
  };

  useEffect(() => {
    loadMatches();
    loadStandings();
  }, [poolId]);

  const handleGenerateMatches = async () => {
    try {
      const res = await fetch(apiUrl("/pool-matches"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poolId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? `Request failed: ${res.status}`);
      openNotification?.({ type: "success", message: "Matches generated." });
      loadMatches();
      loadStandings();
    } catch (e) {
      openNotification?.({
        type: "error",
        message: e instanceof Error ? e.message : "Failed to generate matches",
      });
    }
  };

  const openScoreDialog = (match: any) => {
    setScoreMatch(match);
    const existingSets = (match.sets ?? []).sort((a: any, b: any) => a.setNumber - b.setNumber);
    const initial: { setNumber: number; teamAScore: string; teamBScore: string }[] = [];
    for (let i = 1; i <= 3; i++) {
      const found = existingSets.find((s: any) => s.setNumber === i);
      initial.push({
        setNumber: i,
        teamAScore: found ? String(found.teamAScore) : "",
        teamBScore: found ? String(found.teamBScore) : "",
      });
    }
    setSetScores(initial);
    setScoreDialogOpen(true);
  };

  const handleSaveScores = async () => {
    if (!scoreMatch) return;

    const payloadSets = setScores
      .filter((s) => s.teamAScore !== "" || s.teamBScore !== "")
      .map((s) => ({
        setNumber: s.setNumber,
        teamAScore: Number(s.teamAScore) || 0,
        teamBScore: Number(s.teamBScore) || 0,
      }));

    for (const s of payloadSets) {
      if (s.teamAScore < 0 || s.teamBScore < 0) {
        openNotification?.({ type: "error", message: "Scores cannot be negative." });
        return;
      }
    }

    const whoWonSet = (setNumber: number, a: number, b: number): "A" | "B" | null => {
      if (a < 0 || b < 0) return null;
      const margin = Math.abs(a - b);
      if (setNumber <= 2) {
        if (margin >= 2) return a > b ? "A" : "B";
        return null;
      }
      if (setNumber === 3) {
        if ((a >= 8 || b >= 8) && margin >= 2) return a > b ? "A" : "B";
        return null;
      }
      return null;
    };

    const set1 = payloadSets.find((s) => s.setNumber === 1);
    const set2 = payloadSets.find((s) => s.setNumber === 2);
    const set3 = payloadSets.find((s) => s.setNumber === 3);
    const winner1 = set1 ? whoWonSet(1, set1.teamAScore, set1.teamBScore) : null;
    const winner2 = set2 ? whoWonSet(2, set2.teamAScore, set2.teamBScore) : null;
    if (winner1 && winner2 && winner1 === winner2 && set3 && (set3.teamAScore > 0 || set3.teamBScore > 0)) {
      openNotification?.({
        type: "error",
        message: "Set 3 cannot have scores when one team has already won Set 1 and Set 2.",
      });
      return;
    }

    setSavingScores(true);
    try {
      const res = await fetch(apiUrl(`/matches/${scoreMatch.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sets: payloadSets }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? `Request failed: ${res.status}`);
      openNotification?.({ type: "success", message: "Scores saved." });
      setScoreDialogOpen(false);
      setScoreMatch(null);
      loadMatches();
      loadStandings();
    } catch (e) {
      openNotification?.({
        type: "error",
        message: e instanceof Error ? e.message : "Failed to save scores",
      });
    } finally {
      setSavingScores(false);
    }
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        <Tab label="Matches" value="matches" />
        <Tab label="Standings" value="standings" />
      </Tabs>

      {tab === "matches" && (
        <Box sx={{ mt: 1 }}>
          <Button variant="outlined" size="small" onClick={handleGenerateMatches} disabled={loadingMatches}>
            Generate matches
          </Button>
          {loadingMatches ? (
            <Typography sx={{ mt: 1 }}>Loading matches…</Typography>
          ) : matches.length === 0 ? (
            <Typography sx={{ mt: 1 }}>No matches yet.</Typography>
          ) : (
            <Table size="small" sx={{ mt: 1 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Match</TableCell>
                  <TableCell>Team A</TableCell>
                  <TableCell>Team B</TableCell>
                  <TableCell>Sets</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {matches.map((m, index) => {
                  const setsSummary =
                    (m.sets ?? [])
                      .sort((a: any, b: any) => a.setNumber - b.setNumber)
                      .map((s: any) => `${s.teamAScore}-${s.teamBScore}`)
                      .join(", ") || "—";
                  return (
                    <TableRow key={m.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>{m.teamARegistration?.team?.name ?? "Team A"}</TableCell>
                      <TableCell>{m.teamBRegistration?.team?.name ?? "Team B"}</TableCell>
                      <TableCell>{setsSummary}</TableCell>
                      <TableCell align="right">
                        <Button size="small" onClick={() => openScoreDialog(m)}>
                          Edit scores
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Box>
      )}

      {tab === "standings" && (
        <Box sx={{ mt: 1 }}>
          {loadingStandings ? (
            <Typography>Loading standings…</Typography>
          ) : standings.length === 0 ? (
            <Typography>No standings yet.</Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell>
                  <TableCell>Team</TableCell>
                  <TableCell>W</TableCell>
                  <TableCell>L</TableCell>
                  <TableCell>D</TableCell>
                  <TableCell>Sets W-L</TableCell>
                  <TableCell>Pts W-L</TableCell>
                  <TableCell>Set %</TableCell>
                  <TableCell>Pts %</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {standings.map((row, idx) => (
                  <TableRow key={row.registrationId}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell>{row.teamName}</TableCell>
                    <TableCell>{row.wins}</TableCell>
                    <TableCell>{row.losses}</TableCell>
                    <TableCell>{row.draws}</TableCell>
                    <TableCell>
                      {row.setsWon}-{row.setsLost}
                    </TableCell>
                    <TableCell>
                      {row.pointsWon}-{row.pointsLost}
                    </TableCell>
                    <TableCell>{(row.setPct * 100).toFixed(1)}%</TableCell>
                    <TableCell>{(row.pointsPct * 100).toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Box>
      )}

      <Dialog open={scoreDialogOpen} onClose={() => setScoreDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Enter scores</DialogTitle>
        <DialogContent>
          {setScores.map((s, idx) => {
            const set1 = setScores.find((x) => x.setNumber === 1);
            const set2 = setScores.find((x) => x.setNumber === 2);
            const whoWon = (setNum: number, a: number, b: number): "A" | "B" | null => {
              if (a < 0 || b < 0) return null;
              const margin = Math.abs(a - b);
              if (setNum <= 2) return margin >= 2 ? (a > b ? "A" : "B") : null;
              if (setNum === 3) return (a >= 8 || b >= 8) && margin >= 2 ? (a > b ? "A" : "B") : null;
              return null;
            };
            const a1 = Number(set1?.teamAScore) || 0;
            const b1 = Number(set1?.teamBScore) || 0;
            const a2 = Number(set2?.teamAScore) || 0;
            const b2 = Number(set2?.teamBScore) || 0;
            const w1 = whoWon(1, a1, b1);
            const w2 = whoWon(2, a2, b2);
            const set3Disabled = !!w1 && !!w2 && w1 === w2;
            const isSet3 = s.setNumber === 3;
            const disabled = isSet3 && set3Disabled;
            return (
              <Box key={s.setNumber} sx={{ display: "flex", alignItems: "center", gap: 1, mt: idx === 0 ? 0 : 1 }}>
                <Typography sx={{ minWidth: 60 }}>Set {s.setNumber}</Typography>
                <TextField
                  size="small"
                  label="A"
                  type="number"
                  inputProps={{ min: 0 }}
                  value={s.teamAScore}
                  disabled={disabled}
                  onChange={(e) =>
                    setSetScores((prev) =>
                      prev.map((p) =>
                        p.setNumber === s.setNumber ? { ...p, teamAScore: e.target.value } : p
                      )
                    )
                  }
                  sx={{ width: 80 }}
                />
                <TextField
                  size="small"
                  label="B"
                  type="number"
                  inputProps={{ min: 0 }}
                  value={s.teamBScore}
                  disabled={disabled}
                  onChange={(e) =>
                    setSetScores((prev) =>
                      prev.map((p) =>
                        p.setNumber === s.setNumber ? { ...p, teamBScore: e.target.value } : p
                      )
                    )
                  }
                  sx={{ width: 80 }}
                />
              </Box>
            );
          })}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setScoreDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveScores} disabled={savingScores}>
            {savingScores ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

