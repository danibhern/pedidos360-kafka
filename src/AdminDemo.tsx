// src/AdminDemo.tsx
// Página de ejemplo protegida por <RequireRole role="Admin"/> en App.tsx.
// Solo se llega hasta acá si el access token de la API trae "Admin" en su
// claim roles — es decir, si un admin del tenant te asignó ese App Role en
// Entra ID. Con el tenant de este demo (sin App Roles creados todavía) vas a
// ver la pantalla de "Acceso restringido" del guard — es el comportamiento
// esperado, no un error.
export function AdminDemo() {
  return (
    <div className="card">
      <h2>Panel de Admin</h2>
      <p className="subtitle">
        Si ves esto, tu cuenta tiene el App Role <code>Admin</code> asignado
        en Entra ID para esta API.
      </p>
    </div>
  );
}
