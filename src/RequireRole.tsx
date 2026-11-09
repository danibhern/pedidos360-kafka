import { Navigate, Outlet } from "react-router-dom";
import { useIsAuthenticated } from "@azure/msal-react";
import { useRoles, type AppRole } from "./useRoles";

type RequireRoleProps = {
  roles: AppRole[];
};

export function RequireRole({ roles }: RequireRoleProps) {
  const isAuthenticated = useIsAuthenticated();
  const { loading, roles: userRoles } = useRoles();

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  if (loading) {
    return <p className="loading-state">Cargando permisos…</p>;
  }

  const isAllowed = roles.some((role) => userRoles.includes(role));

  if (!isAllowed) {
    return <Navigate to="/sin-permiso" replace />;
  }

  return <Outlet />;
}