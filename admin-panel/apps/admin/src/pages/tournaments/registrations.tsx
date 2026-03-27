import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useList, useNotification } from "@refinedev/core";
import { List } from "../../components/SaasRefineMui";
import { type GridColDef } from "@mui/x-data-grid";
import { SaasDataGrid } from "../../components/SaasDataGrid";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import { apiUrl } from "../../lib/api-base";

type RegistrationRow = {
  id: string;
  status: string;
  createdAt: string;
  tournamentId: string;
  teamId: string;
  divisionId?: string;
  division?: { id: string; name: string };
  pool?: { id: string; name: string } | null;
  poolId?: string | null;
  team?: { id: string; name: string; captainId: string | null; createdAt: string; orgId: string };
  tournament?: { id: string; name: string; type: string; location: string | null; notes: string | null; orgId: string; createdAt: string };
};

/**
 * Registrations tab. useList calls GET /api/tournament-registrations?_start=0&_end=10&tournamentId=<id>.
 * Backend returns a plain array [...]. Refine useList returns { result: { data, total }, query }.
 */
type TeamOption = { id: string; name: string };

export const TournamentRegistrations = () => {
  const { id: tournamentId } = useParams<{ id: string }>();
  const { open: openNotification } = useNotification();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>("");
  const [divisions, setDivisions] = useState<{ id: string; name: string }[]>([]);
  const [divisionsLoading, setDivisionsLoading] = useState(false);
  const [poolsByDivisionId, setPoolsByDivisionId] = useState<Record<string, { id: string; name: string }[]>>({});
  const [registering, setRegistering] = useState(false);
  const [updatingCellId, setUpdatingCellId] = useState<string | null>(null);

  const { result, query } = useList({
    resource: "tournament-registrations",
    filters: tournamentId ? [{ field: "tournamentId", operator: "eq", value: tournamentId }] : [],
    queryOptions: { enabled: !!tournamentId },
  });

  useEffect(() => {
    if (!registerDialogOpen || !tournamentId) return;
    setTeamsLoading(true);
    setDivisionsLoading(true);
    Promise.all([
      fetch(apiUrl("/teams?_start=0&_end=100")).then((res) => res.json()),
      fetch(apiUrl(`/divisions?tournamentId=${tournamentId}&_start=0&_end=100`)).then((res) => res.json()),
    ])
      .then(([teamsData, divisionsData]) => {
        const teamList = Array.isArray(teamsData) ? teamsData : [];
        const divisionList = Array.isArray(divisionsData) ? divisionsData : [];
        setTeams(teamList.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name ?? t.id })));
        setDivisions(divisionList.map((d: { id: string; name: string }) => ({ id: d.id, name: d.name ?? d.id })));
        setSelectedTeamId(teamList[0]?.id ?? "");
        setSelectedDivisionId(divisionList[0]?.id ?? "");
      })
      .catch(() => {
        setTeams([]);
        setDivisions([]);
      })
      .finally(() => {
        setTeamsLoading(false);
        setDivisionsLoading(false);
      });
  }, [registerDialogOpen, tournamentId]);

  useEffect(() => {
    if (!tournamentId) return;
    fetch(apiUrl(`/divisions?tournamentId=${tournamentId}&_start=0&_end=100`))
      .then((res) => res.json())
      .then((divisionList: { id: string; name: string }[]) => {
        const list = Array.isArray(divisionList) ? divisionList : [];
        setDivisions(list);
        return Promise.all([
          list,
          ...list.map((d: { id: string }) =>
            fetch(apiUrl(`/pools?divisionId=${d.id}&_start=0&_end=50`)).then((r) => r.json())
          ),
        ]);
      })
      .then(([list, ...poolArrays]) => {
        const byDivision: Record<string, { id: string; name: string }[]> = {};
        (list as { id: string }[]).forEach((d, i) => {
          const arr = Array.isArray(poolArrays[i]) ? poolArrays[i] : [];
          byDivision[d.id] = arr.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name ?? p.id }));
        });
        setPoolsByDivisionId(byDivision);
      })
      .catch(() => {});
  }, [tournamentId]);

  const rows: RegistrationRow[] = Array.isArray(result?.data) ? (result.data as RegistrationRow[]) : [];
  const isLoading = query.isLoading;

  const handleDivisionChange = async (registrationId: string, divisionId: string) => {
    setUpdatingCellId(registrationId);
    try {
      const res = await fetch(apiUrl(`/tournament-registrations/${registrationId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ divisionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? `Request failed: ${res.status}`);
      openNotification?.({ type: "success", message: "Division updated." });
      window.location.reload();
    } catch (e) {
      openNotification?.({ type: "error", message: e instanceof Error ? e.message : "Failed to update division" });
    } finally {
      setUpdatingCellId(null);
    }
  };

  const handlePoolChange = async (registrationId: string, poolId: string | null) => {
    setUpdatingCellId(registrationId);
    try {
      const res = await fetch(apiUrl(`/tournament-registrations/${registrationId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poolId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? `Request failed: ${res.status}`);
      openNotification?.({ type: "success", message: "Pool updated." });
      window.location.reload();
    } catch (e) {
      openNotification?.({ type: "error", message: e instanceof Error ? e.message : "Failed to update pool" });
    } finally {
      setUpdatingCellId(null);
    }
  };

  const handleStatusUpdate = async (registrationId: string, status: "APPROVED" | "REJECTED") => {
    setUpdatingId(registrationId);
    try {
      const res = await fetch(apiUrl(`/tournament-registrations/${registrationId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message ?? `Request failed: ${res.status}`);
      }
      openNotification?.({
        type: "success",
        message: `Registration ${status.toLowerCase()}.`,
      });
      window.location.reload();
    } catch (e) {
      openNotification?.({
        type: "error",
        message: e instanceof Error ? e.message : "Failed to update registration",
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRegisterTeam = async () => {
    if (!tournamentId || !selectedTeamId || !selectedDivisionId) return;
    setRegistering(true);
    try {
      const res = await fetch(apiUrl("/tournament-registrations"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId,
          teamId: selectedTeamId,
          divisionId: selectedDivisionId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message ?? `Request failed: ${res.status}`);
      }
      openNotification?.({ type: "success", message: "Team registered." });
      setRegisterDialogOpen(false);
      window.location.reload();
    } catch (e) {
      openNotification?.({
        type: "error",
        message: e instanceof Error ? e.message : "Failed to register team",
      });
    } finally {
      setRegistering(false);
    }
  };

  const columns = React.useMemo<GridColDef[]>(
    () => [
      {
        field: "team",
        headerName: "Team",
        flex: 1,
        minWidth: 140,
        valueGetter: (_, row: { team?: { name?: string } }) => row.team?.name ?? "—",
      },
      {
        field: "division",
        headerName: "Division",
        width: 160,
        renderCell: ({ row }: { row: RegistrationRow }) => {
          const divId = row.divisionId ?? row.division?.id ?? "";
          const isUpdating = updatingCellId === row.id;
          return (
            <Select
              size="small"
              value={divId}
              onChange={(e) => handleDivisionChange(row.id, e.target.value)}
              disabled={isUpdating}
              sx={{ minWidth: 120 }}
            >
              {divisions.map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.name}
                </MenuItem>
              ))}
            </Select>
          );
        },
      },
      {
        field: "pool",
        headerName: "Pool",
        width: 160,
        renderCell: ({ row }: { row: RegistrationRow }) => {
          const divId = row.divisionId ?? row.division?.id ?? "";
          const poolId = row.poolId ?? row.pool?.id ?? "";
          const pools = divId ? (poolsByDivisionId[divId] ?? []) : [];
          const isUpdating = updatingCellId === row.id;
          const canAssignPool = row.status === "APPROVED";
          return (
            <Select
              size="small"
              value={poolId || "__none__"}
              onChange={(e) => {
                const v = e.target.value;
                handlePoolChange(row.id, v === "__none__" ? null : v);
              }}
              disabled={isUpdating || !canAssignPool}
              sx={{ minWidth: 120 }}
            >
              <MenuItem value="__none__">—</MenuItem>
              {pools.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
            </Select>
          );
        },
      },
      {
        field: "status",
        headerName: "Status",
        width: 120,
        renderCell: ({ value }: { value?: string }) => {
          const status = value ?? "";
          const color =
            status === "PENDING"
              ? "warning.main"
              : status === "APPROVED"
                ? "success.main"
                : status === "REJECTED"
                  ? "error.main"
                  : "text.primary";
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
              <Typography variant="body2" fontWeight={700} sx={{ color }}>
                {status || "—"}
              </Typography>
            </Box>
          );
        },
      },
      {
        field: "createdAt",
        headerName: "Registered at",
        width: 180,
        valueGetter: (value: unknown) =>
          value != null && value !== "" ? new Date(value as string).toLocaleString() : "—",
      },
      {
        field: "actions",
        headerName: "Actions",
        width: 200,
        sortable: false,
        renderCell: ({ row }: { row: RegistrationRow }) => {
          const isUpdating = updatingId === row.id;
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
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  disabled={isUpdating}
                  onClick={() => handleStatusUpdate(row.id, "APPROVED")}
                >
                  Approve
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  color="error"
                  disabled={isUpdating}
                  onClick={() => handleStatusUpdate(row.id, "REJECTED")}
                >
                  Reject
                </Button>
              </Box>
            </Box>
          );
        },
      },
    ],
    [updatingId, updatingCellId, divisions, poolsByDivisionId]
  );

  return (
    <>
      <List
        title="Registrations"
        headerButtons={
          <Button
            variant="contained"
            onClick={() => setRegisterDialogOpen(true)}
            disabled={!tournamentId}
          >
            Register Team
          </Button>
        }
      >
        <SaasDataGrid
          rows={rows}
          columns={columns}
          autoHeight
          loading={isLoading}
          getRowId={(row: { id: string }) => row.id}
          disableRowSelectionOnClick
        />
      </List>

      <Dialog open={registerDialogOpen} onClose={() => setRegisterDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Register Team</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 1 }} disabled={teamsLoading}>
            <InputLabel id="register-team-label">Team</InputLabel>
            <Select
              labelId="register-team-label"
              value={selectedTeamId}
              label="Team"
              onChange={(e) => setSelectedTeamId(e.target.value)}
            >
              {teams.map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth sx={{ mt: 2 }} disabled={divisionsLoading}>
            <InputLabel id="register-division-label">Division</InputLabel>
            <Select
              labelId="register-division-label"
              value={selectedDivisionId}
              label="Division"
              onChange={(e) => setSelectedDivisionId(e.target.value)}
            >
              {divisions.map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.name}
                </MenuItem>
              ))}
            </Select>
            {!divisionsLoading && divisions.length === 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                Create at least one division in the Divisions tab first.
              </Typography>
            )}
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRegisterDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleRegisterTeam}
            disabled={!selectedTeamId || !selectedDivisionId || registering}
          >
            {registering ? "Registering…" : "Register"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
