import ReactDOM from "react-dom/client";
import App from "./App";

import {
  PublicClientApplication,
  EventType,
} from "@azure/msal-browser";
import type { AuthenticationResult } from "@azure/msal-browser"; 
import { MsalProvider } from "@azure/msal-react";
import { msalConfig } from "./authConfig";

const msalInstance = new PublicClientApplication(msalConfig);

msalInstance.addEventCallback((event) => {
  if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
    const payload = event.payload as AuthenticationResult;
    if (payload.account) {
      msalInstance.setActiveAccount(payload.account);
    }
  }
});

msalInstance.initialize().then(() => {
  if (
    !msalInstance.getActiveAccount() &&
    msalInstance.getAllAccounts().length > 0
  ) {
    msalInstance.setActiveAccount(msalInstance.getAllAccounts()[0]);
  }

  const rootElement = document.getElementById("root");
  if (rootElement) {
    ReactDOM.createRoot(rootElement).render(
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    );
  }
});
