import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { canAccessResource, getFirstAccessiblePath } from "../lib/authProvider";
import { getStoredAdmin } from "../lib/admin-auth";

const PATH_TO_RESOURCE: { path: string; resource: string }[] = [
  { path: "/tournaments", resource: "tournaments" },
  { path: "/teams", resource: "teams" },
  { path: "/events", resource: "calendar-events" },
  { path: "/members", resource: "members" },
  { path: "/payment-profiles", resource: "payment-profiles" },
  { path: "/payments", resource: "payments" },
  { path: "/credit-logs", resource: "credit-logs" },
  { path: "/admin-users", resource: "admin-users" },
  { path: "/maintenance", resource: "calendar-events" },
];

function getResourceForPath(pathname: string): string | null {
  for (const { path, resource } of PATH_TO_RESOURCE) {
    if (pathname === path || pathname.startsWith(path + "/")) return resource;
  }
  return null;
}

/** Allow editing own admin user record even if "Admin users" is hidden from nav. */
function isSelfAdminUserEditPath(pathname: string): boolean {
  const m = pathname.match(/^\/admin-users\/([^/]+)\/edit$/);
  if (!m) return false;
  const self = getStoredAdmin();
  return self?.role === "ADMIN" && m[1] === self.id;
}

function isAdminUsersCreatePath(pathname: string): boolean {
  return pathname === "/admin-users/create";
}

export function RequireResourceAccess({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const admin = getStoredAdmin();

  let allowed = true;
  if (isAdminUsersCreatePath(pathname)) {
    allowed = admin?.role === "ADMIN" || admin?.role === "SUPER_MANAGER";
  } else {
    const resource = getResourceForPath(pathname);
    allowed =
      resource === null ||
      isSelfAdminUserEditPath(pathname) ||
      (resource !== null && canAccessResource(resource));
  }

  useEffect(() => {
    if (!allowed) navigate(getFirstAccessiblePath(), { replace: true });
  }, [allowed, navigate]);
  if (!allowed) return null;
  return <>{children}</>;
}
