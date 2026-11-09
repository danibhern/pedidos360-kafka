// src/Landing.tsx
// Página PÚBLICA (no está detrás de RequireAuth). Solo ofrece login;
// el contenido protegido vive en /dashboard, detrás del guard.
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { loginRequest } from "./authConfig";

export function Landing() {
  const { instance, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const navigate = useNavigate();


  useEffect(() => {
    if (isAuthenticated && inProgress === InteractionStatus.None) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, inProgress, navigate]);

  const handleLogin = () => {
    if (inProgress === InteractionStatus.None) {
      instance.loginRedirect(loginRequest).catch((e) => console.error(e));
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-brand-icon">⚡</span>
          <span className="login-brand-name">Pedidos360</span>
        </div>

        <h1 className="login-title">Iniciar sesión</h1>
        <p className="login-subtitle">
          Plataforma de gestión de productos electrónicos.
        </p>

        <button
          className="btn btn-microsoft"
          onClick={handleLogin}
          disabled={inProgress !== InteractionStatus.None}
        >
          <svg
            className="ms-icon"
            viewBox="0 0 23 23"
            width="24"
            height="24"
            aria-hidden="true"
          >
            <rect x="1" y="1" width="10" height="10" fill="#f25022" />
            <rect x="12" y="1" width="10" height="10" fill="#7fba00" />
            <rect x="1" y="12" width="10" height="10" fill="#00a4ef" />
            <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
          </svg>
          {inProgress !== InteractionStatus.None
            ? "Redirigiendo…"
            : "Continuar con Microsoft"}
        </button>

        <p className="login-hint">
          Se abrirá la ventana de inicio de sesión de Microsoft para que
          ingreses con tu cuenta corporativa.
        </p>

        <div className="login-footer">
          <span>¿Problemas para ingresar?</span>{" "}
          <a href="mailto:soporte@pedidos360.com">Contactar a soporte</a>
        </div>
      </div>
    </div>
  );
}