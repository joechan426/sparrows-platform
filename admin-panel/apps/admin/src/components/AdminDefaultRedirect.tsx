import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { canAccessResource } from "../lib/authProvider";

const DEFAULT_RESOURCE_PATHS: { resource: string; path: string }[] = [
  { resource: "tournaments", path: "/tournaments" },
  { resource: "teams", path: "/teams" },
  { resource: "calendar-events", path: "/events" },
  { resource: "members", path: "/members" },
  { resource: "admin-users", path: "/admin-users" },
];

export function AdminDefaultRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    const first = DEFAULT_RESOURCE_PATHS.find((r) => canAccessResource(r.resource));
    if (first) navigate(first.path, { replace: true });
    else navigate("/no-access", { replace: true });
  }, [navigate]);
  return null;
}
