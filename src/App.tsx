import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { RequireAuth } from "./RequireAuth";
import { RequireRole } from "./RequireRole";
import { useRoles } from "./useRoles";
import { Landing } from "./Landing";
import { Dashboard } from "./Dashboard";
import { AdminDemo } from "./AdminDemo";
import { Catalog } from "./Catalog";
import { Orders } from "./Orders";
import { Reports } from "./Reports";
import { Audit } from "./Audit";
import "./App.css";

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: "Admin",
    operador: "Operador",
    cliente: "Cliente",
  };

  return labels[role] ?? role;
}

function Nav() {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const { loading: rolesLoading, roles } = useRoles();

  const activeAccount = accounts[0] ?? instance.getActiveAccount();

  const isAdmin = roles.includes("admin");
  const isOperador = roles.includes("operador");
  const isCliente = roles.includes("cliente");

  const handleLogout = () => {
    if (inProgress === InteractionStatus.None) {
      instance
        .logoutRedirect({
          account: activeAccount ?? undefined,
          postLogoutRedirectUri: window.location.origin,
        })
        .catch((error) => console.error("Error al cerrar sesión:", error));
    }
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? "nav-link active" : "nav-link";

  return (
    <header className="navbar">
      <div className="logo">
        ⚡ <span>Pedidos360</span>
      </div>

      {isAuthenticated && (
        <nav className="nav-links">
          <NavLink to="/dashboard" className={linkClass}>
            Dashboard
          </NavLink>

          {!rolesLoading && (isAdmin || isOperador) && (
            <NavLink to="/catalog" className={linkClass}>
              Catálogo
            </NavLink>
          )}

          {!rolesLoading && (
            <NavLink to="/orders" className={linkClass}>
              {isCliente ? "Mis pedidos" : "Pedidos"}
            </NavLink>
          )}

          {!rolesLoading && isAdmin && (
            <>
              <NavLink to="/admin" className={linkClass}>
                Administración
              </NavLink>

              <NavLink to="/reports" className={linkClass}>
                Reportes
              </NavLink>

              <NavLink to="/audit" className={linkClass}>
                Auditoría
              </NavLink>
            </>
          )}
        </nav>
      )}

      <div className="nav-account">
        {isAuthenticated && activeAccount && (
          <span className="account-name">
            {!rolesLoading && roles.length > 0
              ? `Bienvenido/a, ${roles.map(roleLabel).join(", ")}`
              : `Bienvenido/a, ${activeAccount.name ?? activeAccount.username}`}
          </span>
        )}

        {isAuthenticated && (
          <button
            type="button"
            className="btn btn-logout"
            onClick={handleLogout}
            disabled={inProgress !== InteractionStatus.None}
          >
            Cerrar sesión
          </button>
        )}
      </div>
    </header>
  );
}

function AccessDenied() {
  return (
    <section className="card">
      <h1>Acceso no autorizado</h1>
      <p>No tienes el rol necesario para acceder a esta sección.</p>
      <p>Vuelve al Dashboard para continuar.</p>
    </section>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="layout">
        <Nav />

        <main className="container">
          <Routes>
            <Route path="/" element={<Landing />} />

            <Route element={<RequireAuth />}>
              <Route path="/dashboard" element={<Dashboard />} />

              <Route element={<RequireRole roles={["admin", "operador"]} />}>
                <Route path="/catalog" element={<Catalog />} />
              </Route>

              <Route
                element={
                  <RequireRole roles={["admin", "operador", "cliente"]} />
                }
              >
                <Route path="/orders" element={<Orders />} />
              </Route>

              <Route element={<RequireRole roles={["admin"]} />}>
                <Route path="/admin" element={<AdminDemo />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/audit" element={<Audit />} />
              </Route>

              <Route path="/sin-permiso" element={<AccessDenied />} />
            </Route>

            <Route path="*" element={<Landing />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}