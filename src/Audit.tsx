import { useState } from "react";
import { cargarEventos, cargarTimeline, useKafkaPolling } from "./api/kafkaApi";
import "./KafkaViews.css";
import { PaginacionKafka } from "./PaginacionKafka";

const tipos = ["PEDIDO_CREADO", "PEDIDO_ACEPTADO", "PEDIDO_EN_PREPARACION",
  "PEDIDO_DESPACHADO", "PEDIDO_ENTREGADO", "PEDIDO_CANCELADO"];
const fecha = (value: string) => new Date(value).toLocaleString("es-CL");
const iso = (value: string) => value ? new Date(value).toISOString() : "";

export function Audit() {
  const [pedido, setPedido] = useState("");
  const [pedidoBuscado, setPedidoBuscado] = useState("");
  const [usuario, setUsuario] = useState("");
  const [tipo, setTipo] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [query, setQuery] = useState("");
  const [formError, setFormError] = useState("");
  const [page, setPage] = useState(0);
  const timeline = useKafkaPolling(`pedido:${pedidoBuscado}`,
    (signal, token) => cargarTimeline(pedidoBuscado, signal, token), !!pedidoBuscado);
  const eventos = useKafkaPolling(`eventos:${query}`,
    (signal, token) => cargarEventos(query, signal, token));
  const safePage = Math.min(page, Math.max(0, Math.ceil((eventos.data?.length || 0) / 50) - 1));
  return (
    <section className="kv">
      <h1>Auditoría</h1>
      <p>Historial de pedidos recibido por Kafka. No incluye cambios de catálogo
        que tu backend no publique como eventos.</p>
      <article className="kv-panel">
        <h2>Buscar un pedido</h2>
        <form className="kv-form" onSubmit={event => {
          event.preventDefault(); setPedidoBuscado(pedido.trim());
        }}>
          <label>Identificador completo del pedido
            <input required value={pedido} onChange={event => setPedido(event.target.value)}
              placeholder="Pega el orderId completo, no solo sus 8 caracteres" /></label>
          <button className="btn" type="submit">Consultar pedido</button>
        </form>
        {timeline.error && <p role="alert" className="kv-error">{timeline.error}</p>}
        {pedidoBuscado && <p role="status">
          {timeline.updated ? `Última lectura: ${timeline.updated}.`
            : timeline.error ? "Esperando conexión." : "Consultando historial…"}
        </p>}
        {pedidoBuscado && timeline.data && <div className="kv-table-wrap"
          tabIndex={0} role="region" aria-label="Historial del pedido, tabla desplazable">
          <p className="kv-note kv-scroll-hint">Desliza la tabla para ver todas las columnas.</p>
          <table><thead><tr><th>Fecha</th><th>Evento</th><th>Quién</th><th>Origen</th></tr></thead>
            <tbody>{timeline.data.map((row, index) => <tr key={`${row.fecha}-${index}`}>
              <td>{fecha(row.fecha)}</td><td>{row.tipo}</td><td>{row.quien}</td><td>{row.desdeDonde}</td>
            </tr>)}</tbody></table>
          {!timeline.data.length && <p>Kafka aún no tiene eventos para ese pedido.</p>}
        </div>}
      </article>
      <article className="kv-panel">
        <h2>Filtrar eventos</h2>
        <p>Ventana de hasta 500 eventos recientes que coinciden con los filtros.
          Para consultar eventos anteriores, acota las fechas o busca el pedido completo arriba.</p>
        <form className="kv-form" onSubmit={event => {
          event.preventDefault(); setFormError("");
          if (desde && hasta && new Date(desde) > new Date(hasta)) {
            setFormError("Desde no puede ser posterior a Hasta."); return;
          }
          const params = new URLSearchParams();
          if (usuario.trim()) params.set("usuario", usuario.trim());
          if (tipo) params.set("tipo", tipo);
          if (desde) params.set("desde", iso(desde));
          if (hasta) params.set("hasta", iso(hasta));
          setPage(0); setQuery(params.toString());
        }}>
          <label>Usuario exacto
            <input value={usuario} onChange={event => setUsuario(event.target.value)} /></label>
          <label>Tipo de evento
            <select value={tipo} onChange={event => setTipo(event.target.value)}>
              <option value="">Todos</option>
              {tipos.map(value => <option key={value}>{value}</option>)}
            </select></label>
          <label>Desde (hora local)
            <input type="datetime-local" value={desde}
              onChange={event => setDesde(event.target.value)} /></label>
          <label>Hasta (hora local)
            <input type="datetime-local" value={hasta}
              onChange={event => setHasta(event.target.value)} /></label>
          <button className="btn" type="submit">Aplicar filtros</button>
        </form>
        {formError && <p role="alert" className="kv-error">{formError}</p>}
        {eventos.error && <p role="alert" className="kv-error">{eventos.error}</p>}
        <p role="status">{eventos.updated ? `Última lectura: ${eventos.updated}.`
          : eventos.error ? "Esperando conexión." : "Consultando eventos…"}</p>
        {eventos.data && <div className="kv-table-wrap"
          tabIndex={0} role="region" aria-label="Eventos filtrados, tabla desplazable">
          <p className="kv-note kv-scroll-hint">Desliza la tabla para ver todas las columnas.</p>
          <table><thead><tr><th>Pedido</th><th>Fecha</th><th>Evento</th><th>Usuario</th></tr></thead>
            <tbody>{eventos.data.slice(safePage * 50, (safePage + 1) * 50).map(row => <tr key={row.eventId}>
              <td>{row.pedidoId}</td><td>{fecha(row.fecha)}</td>
              <td>{row.tipo}</td>
              <td>{row.actor.nombre && (<><strong>{row.actor.nombre}</strong><br /></>)}
                {row.actor.usuario} ({row.actor.rol})
              </td>
            </tr>)}</tbody></table>
          {!eventos.data.length && <p>No hay eventos para estos filtros.</p>}
        </div>}
        {eventos.data && <PaginacionKafka page={safePage} total={eventos.data.length} size={50} onPage={setPage} />}
      </article>
    </section>
  );
}
