import { useEffect, useRef, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { acquireApiToken } from "./client";

export type Venta = { hora: string; total: number };
export type LeadTime = {
  promedioSeg: number;
  pedidos: { pedidoId: string; segundos: number }[];
};
export type ProductoTop = { productoId: string; unidades: number };
export type Estado = { estado: string; cantidad: number };
export type EventoAudit = {
  eventId: string; pedidoId: string; fecha: string; tipo: string;
  actor: {
  usuario: string;
  rol: string;
  nombre?: string;
};
origen: string;
};
export type Timeline = {
  fecha: string; tipo: string; quien: string; desdeDonde: string;
};
export type Reporte = {
  ventas: Venta[]; leadTime: LeadTime; productos: ProductoTop[]; estados: Estado[];
};

const reportBase = (import.meta.env.VITE_REPORT_API || "").replace(/\/$/, "");
const auditBase = (import.meta.env.VITE_AUDIT_API || "").replace(/\/$/, "");

async function get<T>(url: string, signal: AbortSignal, token?: string): Promise<T> {
  const parsed = new URL(url);
  const localAllowed = import.meta.env.MODE === "lab" &&
    parsed.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsed.hostname);
  if (!token || (!url.startsWith("https://") && !localAllowed)) {
    throw new Error("Se requiere endpoint seguro y access token.");
  }
  const response = await fetch(url, {
    signal, credentials: "omit", headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`El servicio respondió HTTP ${response.status}.`);
  return response.json() as Promise<T>;
}

export async function cargarReporte(signal: AbortSignal, token?: string): Promise<Reporte> {
  const [ventas, leadTime, productos, estados] = await Promise.all([
    get<Venta[]>(`${reportBase}/ventas-por-hora`, signal, token),
    get<LeadTime>(`${reportBase}/lead-time`, signal, token),
    get<ProductoTop[]>(`${reportBase}/top-productos`, signal, token),
    get<Estado[]>(`${reportBase}/estados`, signal, token),
  ]);
  return { ventas, leadTime, productos, estados };
}

export function cargarTimeline(pedidoId: string, signal: AbortSignal, token?: string) {
  return get<Timeline[]>(`${auditBase}/${encodeURIComponent(pedidoId)}`, signal, token);
}

export function cargarEventos(query: string, signal: AbortSignal, token?: string) {
  const params=new URLSearchParams(query);params.set("limite","500");
  return get<EventoAudit[]>(`${auditBase}?${params}`, signal, token);
}

export function useKafkaPolling<T>(
  key: string, loader: (signal: AbortSignal, token?: string) => Promise<T>, enabled = true,
) {
  const { instance, accounts } = useMsal();
  const account = instance.getActiveAccount() || accounts[0];
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState("");
  const loaderRef = useRef(loader);
  useEffect(() => { loaderRef.current = loader; }, [loader]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController;
    setData(null);
    setError("");
    setUpdated("");
    const poll = async () => {
      controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), 8000);
      try {
        if (!account) throw new Error("Inicia sesión de nuevo.");
        const token = await acquireApiToken(instance, account);
        const result = await loaderRef.current(controller.signal, token);
        if (active) {
          setData(result);
          setError("");
          setUpdated(new Date().toLocaleTimeString("es-CL"));
        }
      } catch {
        if (active) setError(
          "No se pudo consultar la API protegida. Revisa sesión, permisos y servicios. " +
          "Si hay cifras anteriores, no se han actualizado.",
        );
      } finally {
        clearTimeout(deadline);
        if (active) timer = setTimeout(poll, 5000);
      }
    };
    void poll();
    return () => { active = false; clearTimeout(timer); controller?.abort(); };
  }, [key, enabled, instance, account]);
  return { data, error, updated };
}
