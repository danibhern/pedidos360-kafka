import { cargarReporte, useKafkaPolling } from "./api/kafkaApi";
import "./KafkaViews.css";
import { useState } from "react";
import { PaginacionKafka } from "./PaginacionKafka";

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency", currency: "CLP", maximumFractionDigits: 0,
});
const numero = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 });
const nombreEstado = (estado: string) => estado.replace(/^PEDIDO_/, "").replaceAll("_", " ");

function Barras({ rows, money = false }: {
  rows: { label: string; value: number }[]; money?: boolean;
}) {
  if (!rows.length) return <p>Todavía no hay datos recibidos por Kafka.</p>;
  const max = Math.max(1, ...rows.map(row => Math.abs(row.value)));
  return <div className="kv-bars">{rows.map(row => (
    <div key={row.label}>
      <div className="kv-bar-label"><span>{row.label}</span>
        <strong>{money ? clp.format(row.value) : numero.format(row.value)}</strong></div>
      <div className="kv-bar-track"><div className="kv-bar-value"
        style={{ width: `${Math.abs(row.value) / max * 100}%` }} /></div>
    </div>
  ))}</div>;
}

export function Reports() {
  const { data, error, updated } = useKafkaPolling("report", cargarReporte);
  const [page, setPage] = useState(0);
  const safePage = Math.min(page, Math.max(0, Math.ceil((data?.leadTime.pedidos.length || 0) / 20) - 1));
  return (
    <section className="kv">
      <h1>Reportes</h1>
      <p>Productos electrónicos: indicadores calculados desde los eventos de pedidos en Kafka.</p>
      {error && <p role="alert" className="kv-error">{error}</p>}
      <p role="status">{updated ? `Última lectura: ${updated}. Consulta cada 5 segundos.`
        : error ? "Esperando conexión." : "Consultando indicadores…"}</p>
      {data && <div className="kv-grid">
        <article className="kv-panel">
          <h2>Ventas por hora</h2>
          <Barras money rows={data.ventas.map(row => ({ label: row.hora, value: row.total }))} />
        </article>
        <article className="kv-panel">
          <h2>Tiempo hasta la entrega</h2>
          <p className="kv-metric">{numero.format(data.leadTime.promedioSeg)} segundos</p>
          <p>Promedio de {data.leadTime.pedidos.length} pedidos entregados.</p>
          <Barras rows={data.leadTime.pedidos.slice(safePage * 20, (safePage + 1) * 20).map(row => ({
            label: row.pedidoId, value: row.segundos,
          }))} />
          <PaginacionKafka page={safePage} total={data.leadTime.pedidos.length} size={20} onPage={setPage} />
        </article>
        <article className="kv-panel">
          <h2>Productos más solicitados</h2>
          <p>Identificador del catálogo y unidades solicitadas, según tu KPI actual.</p>
          <Barras rows={data.productos.map(row => ({ label: row.productoId, value: row.unidades }))} />
        </article>
        <article className="kv-panel">
          <h2>Pedidos activos por estado</h2>
          <Barras rows={data.estados.map(row => ({
            label: nombreEstado(row.estado), value: row.cantidad,
          }))} />
        </article>
      </div>}
    </section>
  );
}
