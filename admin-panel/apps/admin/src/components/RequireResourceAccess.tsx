import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { canAccessResource } from "../lib/authProvider";

const PATH_TO_RESOURCE: { path: string; resource: string }[] = [
  { path: "/tournaments", resource: "tournaments" },
  { path: "/teams", resource: "teams" },
  { path: "/events", resource: "calendar-events" },
  { path: "/members", resource: "members" },
  { path: "/admin-users", resource: "admin-users" },
];

function getResourceForPath(pathname: string): string | null {
  for (const { path, resource } of PATH_TO_RESOURCE) {
    if (pathname === path || pathname.startsWith(path + "/")) return resource;
  }
  return null;
}

export function RequireResourceAccess({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const resource = getResourceForPath(location.pathname);
  const allowed = resource === null || canAccessResource(resource);
  useEffect(() => {
    if (resource !== null && !allowed) navigate("/", { replace: true });
  }, [resource, allowed, navigate]);
  if (resource !== null && !allowed) return null;
  return <>{children}</>;
}
