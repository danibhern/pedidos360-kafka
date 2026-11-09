import { useMsal } from "@azure/msal-react";
import { InteractionRequiredAuthError, BrowserAuthError } from "@azure/msal-browser";
import { apiRequest } from "./authConfig";

export function useApi() {
  const { instance, accounts } = useMsal();

  const fetchWithToken = async (path: string, init: RequestInit = {}) => {
    const account = accounts[0] || instance.getActiveAccount();
    if (!account) throw new Error("No hay una cuenta activa");

    let token: string;
    try {
      const r = await instance.acquireTokenSilent({ ...apiRequest, account });
      token = r.accessToken;
    } catch (e) {
      // interaction_required / consent_required  -> falta consentimiento o MFA
      // timed_out / monitor_window_timeout       -> el iframe silencioso no completa
      //   (Chrome bloquea cookies de terceros para login.microsoftonline.com)
      const needsInteraction =
        e instanceof InteractionRequiredAuthError ||
        (e instanceof BrowserAuthError &&
         ["timed_out", "monitor_window_timeout"].includes(e.errorCode));
      if (needsInteraction) {
        await instance.acquireTokenRedirect({ ...apiRequest, account }); // navega y vuelve
      }
      throw e;
    }

    return fetch(`${import.meta.env.VITE_API_BASE_URL}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
  };

  return { fetchWithToken };
}