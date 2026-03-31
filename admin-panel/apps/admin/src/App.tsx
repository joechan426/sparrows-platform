import React, { useEffect, useState } from "react";
import {
  Refine,
  type AuthProvider,
  type AccessControlProvider,
  Authenticated,
} from "@refinedev/core";
import {
  ThemedLayout,
  ErrorComponent,
  RefineThemes,
  useNotificationProvider,
  RefineSnackbarProvider,
} from "@refinedev/mui";
import CssBaseline from "@mui/material/CssBaseline";
import GlobalStyles from "@mui/material/GlobalStyles";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import dataProvider from "@refinedev/simple-rest";
import { axiosWithAuth } from "./lib/axiosWithAuth";
import routerProvider, {
  UnsavedChangesNotifier,
  DocumentTitleHandler,
} from "@refinedev/react-router";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import Typography from "@mui/material/Typography";

// ✅ your pages
import { TournamentList } from "./pages/tournaments/list";
import { TournamentShow } from "./pages/tournaments/show";
import { TournamentOverview } from "./pages/tournaments/overview";
import { TournamentTeams } from "./pages/tournaments/teams";
import { TournamentMatches } from "./pages/tournaments/matches";
import { TournamentSchedule } from "./pages/tournaments/schedule";
import { TournamentCreate } from "./pages/tournaments/create";
import { TournamentEdit } from "./pages/tournaments/edit";
import { TournamentRegistrations } from "./pages/tournaments/registrations";
import { TournamentDivisions } from "./pages/tournaments/divisions";
import { TournamentDivisionPools } from "./pages/tournaments/division-pools";
import { TournamentDivisionKnockout } from "./pages/tournaments/division-knockout";
import { TeamList } from "./pages/teams/list";
import { TeamCreate } from "./pages/teams/create";
import { TeamEdit } from "./pages/teams/edit";
import { EventList } from "./pages/events/list";
import { EventShowPage } from "./pages/events/show";
import { EventRegistrationsPage } from "./pages/events/registrations";
import { EventCreatePage } from "./pages/events/create";
import { MemberList } from "./pages/members/list";
import { MemberShow } from "./pages/members/show";
import { AnnouncementListPage } from "./pages/announcements/list";
import { AdminUserList } from "./pages/admin-users/list";
import { AdminUserCreate } from "./pages/admin-users/create";
import { AdminUserEdit } from "./pages/admin-users/edit";
import { LoginPage } from "./pages/login";
import { NoAccessPage } from "./pages/no-access";
import { ProfilePage } from "./pages/profile";
import { PaymentProfilesPage } from "./pages/payment-profiles";
import { PaymentRevenueListPage } from "./pages/payments/list";
import { CleanupAwaitingPaymentsPage } from "./pages/maintenance/cleanup-awaiting-payments";

import { HeaderWithProfileLink } from "./components/HeaderWithProfileLink";
import { adminAuthProvider, canAccessResource } from "./lib/authProvider";
import { normalizeAccessControlResource } from "./lib/accessControlResource";
import { getApiBase } from "./lib/api-base";
import { getStoredAdmin } from "./lib/admin-auth";
import { AdminDefaultRedirect } from "./components/AdminDefaultRedirect";
import { RequireResourceAccess } from "./components/RequireResourceAccess";
import { AdminResponsiveSider } from "./components/AdminResponsiveSider";
import { AdminMobileBottomNav } from "./components/AdminMobileBottomNav";
import { AdminHomeLink } from "./components/AdminHomeLink";
import { PullToRefresh } from "./components/PullToRefresh";

const accessControlProvider: AccessControlProvider = {
  can: async ({ resource }) => {
    const admin = getStoredAdmin();
    if (!admin) return { can: false };
    const name = normalizeAccessControlResource(resource);
    const can = name ? canAccessResource(name) : false;
    return { can };
  },
};

const OfflineNotice: React.FC = () => {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOnline(navigator.onLine);

    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return (
    <Snackbar
      open={!isOnline}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert severity="warning" variant="filled" sx={{ maxWidth: 520 }}>
        You are offline. Some admin actions may fail.
      </Alert>
    </Snackbar>
  );
};

const App: React.FC = () => {
  const theme = createTheme(RefineThemes.Blue, {
    palette: {
      primary: {
        main: "#064e3b", // deep green
      },
    },
  });

  return (
    <BrowserRouter>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <GlobalStyles
          styles={(theme) => ({
            html: { WebkitFontSmoothing: "auto" },
            /* Mobile / tablet (≤1024px): match sparrowsweb app-like usability */
            "@media (max-width: 1024px)": {
              main: {
                /* Comfortable tap targets */
                "& .MuiButton-root:not(.MuiIconButton-root)": {
                  minHeight: 44,
                },
                "& .MuiIconButton-root": {
                  padding: theme.spacing(1.25),
                },
                /* Data grids: allow horizontal scroll instead of squishing */
                "& .MuiDataGrid-root": {
                  minWidth: 520,
                },
                "& .MuiCard-root": {
                  overflow: "hidden",
                },
                "& .MuiCardContent-root": {
                  overflowX: "auto",
                  WebkitOverflowScrolling: "touch",
                },
                "& .MuiDialogActions-root": {
                  flexWrap: "wrap",
                  gap: theme.spacing(1),
                  justifyContent: "flex-end",
                },
              },
            },
          })}
        />

        <RefineSnackbarProvider>
          <PullToRefresh />
          <OfflineNotice />
          <Refine
            authProvider={adminAuthProvider}
            accessControlProvider={accessControlProvider}
            dataProvider={dataProvider(getApiBase(), axiosWithAuth)}
            routerProvider={routerProvider}
            notificationProvider={useNotificationProvider}
            resources={[
              {
                name: "tournaments",
                list: "/tournaments",
                create: "/tournaments/create",
                show: "/tournaments/:id",
                edit: "/tournaments/:id/edit",
                meta: { label: "Tournaments" },
              },
              { name: "tournament-registrations", meta: { parent: "tournaments" } },
              { name: "divisions", meta: { parent: "tournaments" } },
              { name: "pools", meta: { parent: "tournaments" } },
              {
                name: "teams",
                list: "/teams",
                create: "/teams/create",
                edit: "/teams/:id/edit",
                meta: { label: "Teams" },
              },
              {
                name: "calendar-events",
                list: "/events",
                show: "/events/:id",
                create: "/events/create",
                meta: { label: "Events" },
              },
              { name: "event-registrations", meta: { parent: "calendar-events" } },
              {
                name: "members",
                list: "/members",
                show: "/members/:id",
                meta: { label: "Members" },
              },
              {
                name: "announcements",
                list: "/announcements",
                meta: { label: "Announcements" },
              },
              {
                name: "payment-profiles",
                list: "/payment-profiles",
                meta: { label: "Payment profiles" },
              },
              {
                name: "payments",
                list: "/payments",
                meta: { label: "Payments" },
              },
              {
                name: "admin-users",
                list: "/admin-users",
                create: "/admin-users/create",
                edit: "/admin-users/:id/edit",
                meta: { label: "Admin users" },
              },
            ]}
          >
            <Routes>
              {/* default entry */}
              <Route index element={<AdminDefaultRedirect />} />

              {/* auth pages */}
              <Route
                element={
                  <Authenticated key="auth-pages" fallback={<Outlet />}>
                    <AdminDefaultRedirect />
                  </Authenticated>
                }
              >
                <Route
                  path="/login"
                  element={
                    <LoginPage
                      title={
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <img
                            src="/asset/img/Sparrow_FullLogo.png"
                            alt="Sparrows"
                            style={{ height: 36, width: "auto", objectFit: "contain" }}
                          />
                          <Typography variant="h6" fontWeight={700} color="text.primary">
                            Sparrows Admin Panel
                          </Typography>
                        </div>
                      }
                    />
                  }
                />
              </Route>

              {/* protected app pages */}
              <Route
                element={
                  <Authenticated key="protected-routes">
                    <ThemedLayout
                      Header={() => <HeaderWithProfileLink />}
                      Sider={(siderProps) => <AdminResponsiveSider {...siderProps} />}
                      Footer={() => <AdminMobileBottomNav />}
                      childrenBoxProps={{
                        sx: {
                          maxWidth: "1600px",
                          mx: "auto",
                          width: "100%",
                          px: { xs: 1, md: 2 },
                          py: 1,
                          "& > *": {
                            borderRadius: 2,
                          },
                          "@media (max-width: 1024px)": {
                            /* Taller bottom tab bar (2× control size) + safe area */
                            paddingBottom: "calc(144px + env(safe-area-inset-bottom, 0px))",
                          },
                        },
                      }}
                      Title={() => <AdminHomeLink />}
                    >
                      <RequireResourceAccess>
                        <Outlet />
                      </RequireResourceAccess>
                    </ThemedLayout>
                  </Authenticated>
                }
              >
                <Route path="/tournaments" element={<TournamentList />} />
                <Route path="/tournaments/create" element={<TournamentCreate />} />
                <Route path="/teams" element={<TeamList />} />
                <Route path="/teams/create" element={<TeamCreate />} />
                <Route path="/teams/:id/edit" element={<TeamEdit />} />
                <Route path="/events" element={<EventList />} />
                <Route path="/events/create" element={<EventCreatePage />} />
                <Route path="/events/:id" element={<EventShowPage />} />
                <Route
                  path="/events/:id/registrations"
                  element={<EventRegistrationsPage />}
                />
                <Route path="/members" element={<MemberList />} />
                <Route path="/members/:id" element={<MemberShow />} />
                <Route path="/announcements" element={<AnnouncementListPage />} />
                <Route path="/payment-profiles" element={<PaymentProfilesPage />} />
                <Route path="/payments" element={<PaymentRevenueListPage />} />
                <Route path="/admin-users" element={<AdminUserList />} />
                <Route path="/admin-users/create" element={<AdminUserCreate />} />
                <Route path="/admin-users/:id/edit" element={<AdminUserEdit />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route
                  path="/maintenance/cleanup-awaiting-payments"
                  element={<CleanupAwaitingPaymentsPage />}
                />
                <Route path="/no-access" element={<NoAccessPage />} />

                <Route path="/tournaments/:id" element={<TournamentShow />}>
                  <Route index element={<TournamentOverview />} />
                  <Route path="teams" element={<TournamentTeams />} />
                  <Route path="divisions" element={<TournamentDivisions />} />
                  <Route path="divisions/:divisionId/pools" element={<TournamentDivisionPools />} />
                  <Route path="divisions/:divisionId/knockout" element={<TournamentDivisionKnockout />} />
                  <Route path="matches" element={<TournamentMatches />} />
                  <Route path="schedule" element={<TournamentSchedule />} />
                  <Route path="registrations" element={<TournamentRegistrations />} />
                </Route>
                <Route path="/tournaments/:id/edit" element={<TournamentEdit />} />

                <Route path="*" element={<ErrorComponent />} />
              </Route>
            </Routes>

            <UnsavedChangesNotifier />
            <DocumentTitleHandler
              handler={({ autoGeneratedTitle }) => {
                const base = autoGeneratedTitle.replace(/\s*\|\s*Refine\s*$/i, "").trim();
                return base ? `${base} | Sparrows Admin` : "Sparrows Admin";
              }}
            />
          </Refine>
        </RefineSnackbarProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
};

export default App;
