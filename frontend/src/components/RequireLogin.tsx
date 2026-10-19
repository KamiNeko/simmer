import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/lib/auth";

export function RequireLogin() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <Outlet />;
}
