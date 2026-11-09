import { useEffect, useState } from 'react';
import { environment } from './environment';
import './App.css';

const formatoNumero = new Intl.NumberFormat('es-CL');

const formatoDinero = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

async function consultar(url, signal) {
  const respuesta = await fetch(url, { signal });

  if (!respuesta.ok) {
    throw new Error(`HTTP ${respuesta.status}: ${url}`);
  }

  return respuesta.json();
}

function GraficoBarras({
  datos,
  etiqueta,
  valor,
  formato = numero => formatoNumero.format(numero),
}) {
  if (datos.length === 0) {
    return <p className="vacio">Todavía no hay datos.</p>;
  }

  const maximo = Math.max(
    1,
    ...datos.map(fila => Math.abs(Number(fila[valor]) || 0))
  );

  return (
    <div className="barras">
      {datos.map(fila => {
        const numero = Number(fila[valor]) || 0;

        return (
          <div className="fila-barra" key={fila[etiqueta]}>
            <div className="barra-cabecera">
              <span>{fila[etiqueta]}</span>
              <strong>{formato(numero)}</strong>
            </div>

            <div className="barra-fondo">
              <div
                className={`barra-relleno ${numero < 0 ? 'negativa' : ''}`}
                style={{
                  width: `${Math.abs(numero) / maximo * 100}%`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function fechaLegible(fecha) {
  return new Date(fecha).toLocaleString('es-CL');
}

export default function App() {
  const [pantalla, setPantalla] = useState('reportes');

  const [reporte, setReporte] = useState({
    ventas: [],
    leadTime: { promedioSeg: 0, pedidos: [] },
    productos: [],
    estados: [],
  });

  const [errorReport, setErrorReport] = useState('');
  const [actualizado, setActualizado] = useState('');

  const [pedidoId, setPedidoId] = useState('');
  const [timeline, setTimeline] = useState([]);
  const [timelineConsultado, setTimelineConsultado] = useState(false);
  const [cargandoTimeline, setCargandoTimeline] = useState(false);
  const [errorTimeline, setErrorTimeline] = useState('');

  const [filtros, setFiltros] = useState({
    usuario: '',
    tipo: '',
    desde: '',
    hasta: '',
  });

  const [eventos, setEventos] = useState([]);
  const [filtrosConsultados, setFiltrosConsultados] = useState(false);
  const [cargandoFiltros, setCargandoFiltros] = useState(false);
  const [errorFiltros, setErrorFiltros] = useState('');

  useEffect(() => {
    let activo = true;
    let temporizador;
    let controlador;

    async function actualizar() {
      controlador = new AbortController();

      try {
        const [ventas, leadTime, productos, estados] =
          await Promise.all([
            consultar(
              `${environment.reportApi}/ventas-por-hora`,
              controlador.signal
            ),
            consultar(
              `${environment.reportApi}/lead-time`,
              controlador.signal
            ),
            consultar(
              `${environment.reportApi}/top-productos`,
              controlador.signal
            ),
            consultar(
              `${environment.reportApi}/estados`,
              controlador.signal
            ),
          ]);

        if (!activo) return;

        setReporte({ ventas, leadTime, productos, estados });
        setErrorReport('');
        setActualizado(new Date().toLocaleTimeString('es-CL'));
      } catch (error) {
        if (activo && error.name !== 'AbortError') {
          setErrorReport(
            'No se pudo actualizar Reportes. ' +
            'Se conservan los últimos datos recibidos. ' +
            'Revisa el servicio report en el puerto 3001.'
          );
        }
      } finally {
        if (activo) {
          temporizador = setTimeout(actualizar, 5000);
        }
      }
    }

    actualizar();

    return () => {
      activo = false;
      clearTimeout(temporizador);
      controlador?.abort();
    };
  }, []);

  async function buscarPedido(event) {
    event.preventDefault();

    const id = pedidoId.trim();
    if (!id) return;

    setCargandoTimeline(true);
    setErrorTimeline('');
    setTimeline([]);
    setTimelineConsultado(false);

    try {
      const resultado = await consultar(
        `${environment.auditApi}/${encodeURIComponent(id)}`
      );

      setTimeline(resultado);
      setTimelineConsultado(true);
    } catch {
      setErrorTimeline(
        'No se pudo consultar el pedido. ' +
        'Revisa el servicio audit en el puerto 3002.'
      );
    } finally {
      setCargandoTimeline(false);
    }
  }

  async function buscarFiltros(event) {
    event.preventDefault();

    setCargandoFiltros(true);
    setErrorFiltros('');
    setEventos([]);
    setFiltrosConsultados(false);

    try {
      const parametros = new URLSearchParams();

      for (const nombre of ['usuario', 'tipo']) {
        if (filtros[nombre].trim()) {
          parametros.set(nombre, filtros[nombre].trim());
        }
      }

      for (const nombre of ['desde', 'hasta']) {
        if (filtros[nombre]) {
          parametros.set(
            nombre,
            new Date(filtros[nombre]).toISOString()
          );
        }
      }

      if (
        filtros.desde &&
        filtros.hasta &&
        new Date(filtros.desde) > new Date(filtros.hasta)
      ) {
        throw new Error(
          'La fecha Desde no puede ser posterior a Hasta.'
        );
      }

      const resultado = await consultar(
        `${environment.auditApi}?${parametros.toString()}`
      );

      setEventos(resultado);
      setFiltrosConsultados(true);
    } catch (error) {
      setErrorFiltros(
        `No se pudo completar la consulta. ${error.message}`
      );
    } finally {
      setCargandoFiltros(false);
    }
  }

  function cambiarFiltro(event) {
    const { name, value } = event.target;

    setFiltros(actuales => ({
      ...actuales,
      [name]: value,
    }));
  }

  const totalVentas = reporte.ventas.reduce(
    (suma, fila) => suma + fila.total,
    0
  );

  const totalActivos = reporte.estados.reduce(
    (suma, fila) => suma + fila.cantidad,
    0
  );

  return (
    <main className="contenedor">
      <header className="encabezado">
        <div>
          <p className="sobretitulo">EA3 · Kafka</p>
          <h1>Pedidos360</h1>
          <p>Reportes y auditoría de eventos</p>
        </div>

        <span className="insignia">Solo lectura</span>
      </header>

      <nav className="navegacion" aria-label="Secciones">
        <button
          className={pantalla === 'reportes' ? 'seleccionado' : ''}
          onClick={() => setPantalla('reportes')}
        >
          Reportes
        </button>

        <button
          className={pantalla === 'auditoria' ? 'seleccionado' : ''}
          onClick={() => setPantalla('auditoria')}
        >
          Auditoría
        </button>
      </nav>

      {pantalla === 'reportes' ? (
        <>
          <div className="titulo-seccion">
            <h2>Reportes</h2>
            <p>
              Consulta automática cada 5 segundos.
              {actualizado && ` Última respuesta: ${actualizado}`}
            </p>
          </div>

          {errorReport && (
            <p className="error" role="alert">{errorReport}</p>
          )}

          <section className="resumen">
            <article className="tarjeta indicador">
              <span>Ventas acumuladas en memoria</span>
              <strong>{formatoDinero.format(totalVentas)}</strong>
            </article>

            <article className="tarjeta indicador">
              <span>Lead time promedio</span>
              <strong>
                {Number(reporte.leadTime.promedioSeg).toFixed(2)} s
              </strong>
            </article>

            <article className="tarjeta indicador">
              <span>Pedidos activos</span>
              <strong>{totalActivos}</strong>
            </article>
          </section>

          <section className="cuadricula">
            <article className="tarjeta">
              <h3>Ventas por hora</h3>
              <p className="ayuda">Horas según la fecha UTC del evento.</p>
              <GraficoBarras
                datos={reporte.ventas}
                etiqueta="hora"
                valor="total"
                formato={numero => formatoDinero.format(numero)}
              />
            </article>

            <article className="tarjeta">
              <h3>Productos más vendidos</h3>
              <GraficoBarras
                datos={reporte.productos}
                etiqueta="productoId"
                valor="unidades"
              />
            </article>

            <article className="tarjeta">
              <h3>Pedidos activos por estado</h3>
              <GraficoBarras
                datos={reporte.estados}
                etiqueta="estado"
                valor="cantidad"
              />
            </article>

            <article className="tarjeta">
              <h3>Lead time por pedido entregado</h3>
              <GraficoBarras
                datos={reporte.leadTime.pedidos}
                etiqueta="pedidoId"
                valor="segundos"
                formato={numero => `${numero.toFixed(2)} s`}
              />
            </article>
          </section>
        </>
      ) : (
        <>
          <h2>Auditoría</h2>

          <section className="tarjeta">
            <h3>Timeline de un pedido</h3>

            <form className="busqueda" onSubmit={buscarPedido}>
              <label className="campo">
                Identificador completo del pedido
                <input
                  value={pedidoId}
                  onChange={event => setPedidoId(event.target.value)}
                  placeholder="P-1003-identificador..."
                  required
                />
              </label>

              <button type="submit" disabled={cargandoTimeline}>
                {cargandoTimeline ? 'Buscando...' : 'Buscar pedido'}
              </button>
            </form>

            {errorTimeline && (
              <p className="error" role="alert">{errorTimeline}</p>
            )}

            {timelineConsultado && timeline.length === 0 && (
              <p className="vacio">
                No hay eventos para ese pedido en la memoria de audit.
              </p>
            )}

            <ol className="timeline">
              {timeline.map((evento, indice) => (
                <li key={`${evento.fecha}-${evento.tipo}-${indice}`}>
                  <strong>{evento.tipo}</strong>
                  <span>{fechaLegible(evento.fecha)}</span>
                  <span>{evento.quien}</span>
                  <span>Origen: {evento.desdeDonde}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="tarjeta">
            <h3>Filtrar eventos</h3>

            <form className="filtros" onSubmit={buscarFiltros}>
              <label className="campo">
                Usuario
                <input
                  name="usuario"
                  value={filtros.usuario}
                  onChange={cambiarFiltro}
                  placeholder="op-ana"
                />
              </label>

              <label className="campo">
                Tipo
                <select
                  name="tipo"
                  value={filtros.tipo}
                  onChange={cambiarFiltro}
                >
                  <option value="">Todos</option>
                  {[
                    'PEDIDO_CREADO',
                    'PEDIDO_ACEPTADO',
                    'PEDIDO_EN_PREPARACION',
                    'PEDIDO_DESPACHADO',
                    'PEDIDO_ENTREGADO',
                    'PEDIDO_CANCELADO',
                  ].map(tipo => (
                    <option key={tipo} value={tipo}>{tipo}</option>
                  ))}
                </select>
              </label>

              <label className="campo">
                Desde — hora local
                <input
                  type="datetime-local"
                  name="desde"
                  value={filtros.desde}
                  onChange={cambiarFiltro}
                />
              </label>

              <label className="campo">
                Hasta — hora local
                <input
                  type="datetime-local"
                  name="hasta"
                  value={filtros.hasta}
                  onChange={cambiarFiltro}
                />
              </label>

              <button type="submit" disabled={cargandoFiltros}>
                {cargandoFiltros ? 'Consultando...' : 'Aplicar filtros'}
              </button>
            </form>

            {errorFiltros && (
              <p className="error" role="alert">{errorFiltros}</p>
            )}

            {filtrosConsultados && (
              <p>{eventos.length} evento(s) encontrado(s).</p>
            )}

            <div className="tabla-contenedor">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Pedido</th>
                    <th>Tipo</th>
                    <th>Usuario</th>
                    <th>Origen</th>
                  </tr>
                </thead>
                <tbody>
                  {eventos.map(evento => (
                    <tr key={evento.eventId}>
                      <td>{fechaLegible(evento.fecha)}</td>
                      <td>{evento.pedidoId}</td>
                      <td>{evento.tipo}</td>
                      <td>
                        {evento.actor.usuario} ({evento.actor.rol})
                      </td>
                      <td>{evento.origen}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <footer>
        Datos de los servicios report y audit.
        Reiniciarlos vacía su estado en memoria.
      </footer>
    </main>
  );
}