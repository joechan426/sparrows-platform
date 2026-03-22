import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getFirstAccessiblePath } from "../lib/authProvider";

export function AdminDefaultRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(getFirstAccessiblePath(), { replace: true });
  }, [navigate]);
  return null;
}
