import { Outlet, useParams, Link, useLocation } from "react-router-dom";
import { Box, Tabs, Tab, Typography, Stack, Divider } from "@mui/material";
import { Show } from "../../components/SaasRefineMui";
import { useShow } from "@refinedev/core";

export const TournamentShow = () => {
  const { id } = useParams();
  const location = useLocation();

  const showResult: any = useShow({
    resource: "tournaments",
    id: id ?? "",
    queryOptions: {
      enabled: !!id,
      retry: false,
    },
  });

  if (!id) {
    return (
      <Show title="Tournament" isLoading={false}>
        <Typography color="error">Missing tournament id in URL.</Typography>
      </Show>
    );
  }

  const queryResult =
    showResult?.queryResult ?? showResult?.query ?? showResult ?? {};
  const { data, isLoading = false, isError = false, error } = queryResult;
  // Support both { data: record } and raw record from simple-rest / API
  const raw = data?.data ?? data;
  const record = (typeof raw?.data !== "undefined" ? raw.data : raw) as
    | {
        id: string;
        name?: string;
        type?: string;
        location?: string;
        notes?: string;
        createdAt?: string;
      }
    | undefined;

  const base = `/tournaments/${id}`;
  const current = location.pathname.startsWith(`${base}/teams`)
    ? "teams"
    : location.pathname.startsWith(`${base}/divisions`)
      ? "divisions"
      : location.pathname.startsWith(`${base}/matches`)
        ? "matches"
        : location.pathname.startsWith(`${base}/schedule`)
          ? "schedule"
          : location.pathname.startsWith(`${base}/registrations`)
            ? "registrations"
            : "overview";

  const title = record?.name ? String(record.name) : id ?? "";

  const displayType = record?.type != null ? String(record.type) : "-";
  const displayLocation =
    record?.location != null && record.location !== ""
      ? String(record.location)
      : "-";
  const displayNotes =
    record?.notes != null && record.notes !== ""
      ? String(record.notes)
      : "-";

  return (
    <Show isLoading={isLoading} title={title}>
      <Box>
        <Stack spacing={1} sx={{ mb: 2 }}>
          <Typography variant="h5">{title}</Typography>

          {isError ? (
            <Typography color="error">
              Failed to load tournament. {String((error as any)?.message ?? "")}
            </Typography>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary">
                Type: {displayType}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Location: {displayLocation}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Notes: {displayNotes}
              </Typography>
            </>
          )}
        </Stack>

        <Divider sx={{ mb: 2 }} />

        <Tabs
          value={current}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{ mb: 2 }}
        >
          <Tab label="Overview" value="overview" component={Link} to={base} />
          <Tab label="Teams" value="teams" component={Link} to={`${base}/teams`} />
          <Tab label="Divisions" value="divisions" component={Link} to={`${base}/divisions`} />
          <Tab
            label="Matches"
            value="matches"
            component={Link}
            to={`${base}/matches`}
          />
          <Tab
            label="Schedule"
            value="schedule"
            component={Link}
            to={`${base}/schedule`}
          />
          <Tab
            label="Registrations"
            value="registrations"
            component={Link}
            to={`${base}/registrations`}
          /> 
        </Tabs>

        <Outlet />
      </Box>
    </Show>
  );
};
