import {
  useEffect,
  useState
} from "react";
import { useMsal } from "@azure/msal-react";
import { acquireApiToken } from "./api/client";
import { decodeJwt } from "./lib/jwt";

export type AppRole =
  | "admin"
  | "operador"
  | "cliente";

type RolesState = {
  loading: boolean;
  roles: AppRole[];
};

function normalizeRole(
  value: string
): string {
  const role = value
    .trim()
    .toLowerCase();

  // El access token del Cliente trae "client".
  // Dentro de React usamos "cliente".
  if (role === "client") {
    return "cliente";
  }

  if (role === "operator") {
    return "operador";
}

  return role;
}

function isAppRole(
  value: string
): value is AppRole {
  return (
    value === "admin" ||
    value === "operador" ||
    value === "cliente"
  );
}

export function useRoles(): RolesState {
  const {
    instance,
    accounts
  } = useMsal();

  const [state, setState] =
    useState<RolesState>({
      loading: true,
      roles: []
    });

  useEffect(() => {
    const account =
      instance.getActiveAccount() ??
      accounts[0];

    if (!account) {
      setState({
        loading: false,
        roles: []
      });

      return;
    }

    let cancelled = false;

    const loadRoles = async () => {
      try {
        const accessToken =
          await acquireApiToken(
            instance,
            account
          );

        if (cancelled) {
          return;
        }

        const tokenRoles =
          decodeJwt(accessToken)
            ?.roles ?? [];

        const roles = tokenRoles
          .filter(
            (
              role
            ): role is string =>
              typeof role ===
              "string"
          )
          .map(normalizeRole)
          .filter(isAppRole);

        setState({
          loading: false,
          roles
        });
      } catch (error) {
        console.error(
          "No fue posible obtener los roles:",
          error
        );

        if (!cancelled) {
          setState({
            loading: false,
            roles: []
          });
        }
      }
    };

    void loadRoles();

    return () => {
      cancelled = true;
    };
  }, [accounts, instance]);

  return state;
}