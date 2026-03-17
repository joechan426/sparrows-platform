import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useNotification } from "@refinedev/core";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableBody from "@mui/material/TableBody";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import { apiUrl } from "../../lib/api-base";

type PreviewSeed = { seed: number; registrationId: string; teamName: string };
type PreviewPairing = {
  seedA: number;
  seedB: number;
  registrationIdA: string;
  registrationIdB: string;
  teamNameA: string;
  teamNameB: string;
};
type KnockoutMatch = {
  id: string;
  stage: string;
  seedA: number | null;
  seedB: number | null;
  courtName: string | null;
  scheduledAt: string | null;
  status: string;
  teamARegistration?: { id: string; team?: { name: string } };
  teamBRegistration?: { id: string; team?: { name: string } };
  dutyRegistration?: { id: string; team?: { name: string } | null } | null;
  sets?: { setNumber: number; teamAScore: number; teamBScore: number }[];
};
type RegistrationOption = { id: string; team?: { name: string }; divisionId?: string; division?: { id: string } };

export const TournamentDivisionKnockout = () => {
  const { id: tournamentId, divisionId } = useParams<{ id: string; divisionId: string }>();
  const { open: openNotification } = useNotification();
  const [preview, setPreview] = useState<{ seeds: PreviewSeed[]; pairings: PreviewPairing[]; unpaired: PreviewSeed | null } | null>(null);
  const [knockoutMatches, setKnockoutMatches] = useState<KnockoutMatch[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editMatchOpen, setEditMatchOpen] = useState(false);
  const [editMatch, setEditMatch] = useState<KnockoutMatch | null>(null);
  const [editCourt, setEditCourt] = useState("");
  const [editScheduledAt, setEditScheduledAt] = useState("");
  const [editDutyId, setEditDutyId] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [scoreDialogOpen, setScoreDialogOpen] = useState(false);
  const [scoreMatch, setScoreMatch] = useState<KnockoutMatch | null>(null);
  const [setScores, setSetScores] = useState<
    { setNumber: number; teamAScore: string; teamBScore: string }[]
  >([
    { setNumber: 1, teamAScore: "", teamBScore: "" },
    { setNumber: 2, teamAScore: "", teamBScore: "" },
    { setNumber: 3, teamAScore: "", teamBScore: "" },
  ]);
  const [savingScores, setSavingScores] = useState(false);
  const [dutyOptions, setDutyOptions] = useState<RegistrationOption[]>([]);

  const loadPreview = () => {
    if (!divisionId) return;
    setLoadingPreview(true);
    fetch(apiUrl(`/divisions/${divisionId}/knockout/preview`))
      .then((res) => res.json())
      .then((data) => {
        if (data.seeds != null) setPreview({ seeds: data.seeds, pairings: data.pairings ?? [], unpaired: data.unpaired ?? null });
        else setPreview(null);
      })
      .catch(() => setPreview(null))
      .finally(() => setLoadingPreview(false));
  };

  const loadKnockoutMatches = () => {
    if (!divisionId) return;
    setLoadingMatches(true);
    fetch(apiUrl(`/divisions/${divisionId}/knockout/matches`))
      .then((res) => res.json())
      .then((data) => setKnockoutMatches(Array.isArray(data) ? data : []))
      .catch(() => setKnockoutMatches([]))
      .finally(() => setLoadingMatches(false));
  };

  useEffect(() => {
    loadPreview();
    loadKnockoutMatches();
  }, [divisionId]);

  useEffect(() => {
    if (!tournamentId || !divisionId) return;
    fetch(apiUrl(`/tournament-registrations?tournamentId=${tournamentId}&_start=0&_end=200`))
      .then((res) => res.json())
      .then((data: RegistrationOption[]) => {
        const list = Array.isArray(data) ? data : [];
        setDutyOptions(list.filter((r) => (r.divisionId ?? r.division?.id) === divisionId));
      })
      .catch(() => setDutyOptions([]));
  }, [tournamentId, divisionId]);

  const handleGenerate = async () => {
    if (!divisionId) return;
    setGenerating(true);
    try {
      const res = await fetch(apiUrl(`/divisions/${divisionId}/knockout/generate`), { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? `Request failed: ${res.status}`);
      openNotification?.({ type: "success", message: data?.message ?? "Knockout generated." });
      loadPreview();
      loadKnockoutMatches();
    } catch (e) {
      openNotification?.({
        type: "error",
        message: e instanceof Error ? e.message : "Failed to generate knockout",
      });
    } finally {
      setGenerating(false);
    }
  };

  const openEditMatch = (m: KnockoutMatch) => {
    setEditMatch(m);
    setEditCourt(m.courtName ?? "");
    setEditScheduledAt(m.scheduledAt ? new Date(m.scheduledAt).toISOString().slice(0, 16) : "");
    setEditDutyId(m.dutyRegistration?.id ?? "");
    setEditMatchOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editMatch) return;
    setSavingEdit(true);
    try {
      const body: { courtName?: string | null; scheduledAt?: string | null; dutyRegistrationId?: string | null } = {};
      if (editCourt !== (editMatch.courtName ?? "")) body.courtName = editCourt || null;
      if (editScheduledAt !== (editMatch.scheduledAt ? new Date(editMatch.scheduledAt).toISOString().slice(0, 16) : ""))
        body.scheduledAt = editScheduledAt ? new Date(editScheduledAt).toISOString() : null;
      if (editDutyId !== (editMatch.dutyRegistration?.id ?? ""))
        body.dutyRegistrationId = editDutyId || null;
      const res = await fetch(apiUrl(`/matches/${editMatch.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? `Request failed: ${res.status}`);
      openNotification?.({ type: "success", message: "Match updated." });
      setEditMatchOpen(false);
      setEditMatch(null);
      loadKnockoutMatches();
    } catch (e) {
      openNotification?.({
        type: "error",
        message: e instanceof Error ? e.message : "Failed to update match",
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const openScoreDialog = (match: KnockoutMatch) => {
    setScoreMatch(match);
    const existingSets = (match.sets ?? []).sort((a, b) => a.setNumber - b.setNumber);
    const initial: { setNumber: number; teamAScore: string; teamBScore: string }[] = [];
    for (let i = 1; i <= 3; i++) {
      const found = existingSets.find((s) => s.setNumber === i);
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
      if (setNumber <= 2) return margin >= 2 ? (a > b ? "A" : "B") : null;
      if (setNumber === 3) return (a >= 8 || b >= 8) && margin >= 2 ? (a > b ? "A" : "B") : null;
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
      loadKnockoutMatches();
    } catch (e) {
      openNotification?.({
        type: "error",
        message: e instanceof Error ? e.message : "Failed to save scores",
      });
    } finally {
      setSavingScores(false);
    }
  };

  const hasKnockout = knockoutMatches.length > 0;

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="body2" color="text.secondary" component={Link} to={`/tournaments/${tournamentId}/divisions`} sx={{ textDecoration: "none" }}>
        ← Divisions
      </Typography>
      <Typography variant="h6" sx={{ mt: 1 }}>
        Division Knockout
      </Typography>

      {loadingPreview && !preview && <Typography sx={{ mt: 1 }}>Loading seed preview…</Typography>}
      {preview && !hasKnockout && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2">Seed order (from division standings)</Typography>
          <Table size="small" sx={{ mt: 0.5, maxWidth: 400 }}>
            <TableHead>
              <TableRow>
                <TableCell>Seed</TableCell>
                <TableCell>Team</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {preview.seeds.map((s) => (
                <TableRow key={s.registrationId}>
                  <TableCell>{s.seed}</TableCell>
                  <TableCell>{s.teamName}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {preview.unpaired && (
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
              Odd team out: {preview.unpaired.teamName} (seed {preview.unpaired.seed})
            </Typography>
          )}
          <Button
            variant="contained"
            onClick={handleGenerate}
            disabled={generating || preview.pairings.length === 0}
            sx={{ mt: 2 }}
          >
            {generating ? "Generating…" : "Generate Knockout"}
          </Button>
        </Box>
      )}

      {hasKnockout && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2">Knockout matches</Typography>
          <Table size="small" sx={{ mt: 0.5 }}>
            <TableHead>
              <TableRow>
                <TableCell>Match ID</TableCell>
                <TableCell>Team A</TableCell>
                <TableCell>Team B</TableCell>
                <TableCell>Stage</TableCell>
                <TableCell>Seed A</TableCell>
                <TableCell>Seed B</TableCell>
                <TableCell>Court</TableCell>
                <TableCell>Scheduled</TableCell>
                <TableCell>Duty team</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {knockoutMatches.map((m) => {
                const setsSummary =
                  (m.sets ?? [])
                    .sort((a, b) => a.setNumber - b.setNumber)
                    .map((s) => `${s.teamAScore}-${s.teamBScore}`)
                    .join(", ") || "—";
                return (
                  <TableRow key={m.id}>
                    <TableCell sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{m.id.slice(0, 8)}</TableCell>
                    <TableCell>{m.teamARegistration?.team?.name ?? "—"}</TableCell>
                    <TableCell>{m.teamBRegistration?.team?.name ?? "—"}</TableCell>
                    <TableCell>{m.stage}</TableCell>
                    <TableCell>{m.seedA ?? "—"}</TableCell>
                    <TableCell>{m.seedB ?? "—"}</TableCell>
                    <TableCell>{m.courtName ?? "—"}</TableCell>
                    <TableCell>
                      {m.scheduledAt ? new Date(m.scheduledAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </TableCell>
                    <TableCell>{m.dutyRegistration?.team?.name ?? "—"}</TableCell>
                    <TableCell>{m.status}</TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => openEditMatch(m)} sx={{ mr: 0.5 }}>
                        Edit
                      </Button>
                      <Button size="small" onClick={() => openScoreDialog(m)}>
                        Scores {setsSummary !== "—" ? `(${setsSummary})` : ""}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      )}

      {!loadingPreview && !preview && !hasKnockout && (
        <Typography color="text.secondary" sx={{ mt: 2 }}>
          No approved registrations in this division, or division not found.
        </Typography>
      )}

      <Dialog open={editMatchOpen} onClose={() => setEditMatchOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit match</DialogTitle>
        <DialogContent>
          <TextField
            margin="dense"
            label="Court"
            fullWidth
            value={editCourt}
            onChange={(e) => setEditCourt(e.target.value)}
          />
          <TextField
            margin="dense"
            label="Scheduled (date & time)"
            type="datetime-local"
            fullWidth
            value={editScheduledAt}
            onChange={(e) => setEditScheduledAt(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel>Duty team</InputLabel>
            <Select
              value={editDutyId}
              label="Duty team"
              onChange={(e) => setEditDutyId(e.target.value)}
            >
              <MenuItem value="">—</MenuItem>
              {dutyOptions.map((r) => (
                <MenuItem key={r.id} value={r.id}>
                  {r.team?.name ?? r.id}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditMatchOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveEdit} disabled={savingEdit}>
            {savingEdit ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

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
                      prev.map((p) => (p.setNumber === s.setNumber ? { ...p, teamAScore: e.target.value } : p))
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
                      prev.map((p) => (p.setNumber === s.setNumber ? { ...p, teamBScore: e.target.value } : p))
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
