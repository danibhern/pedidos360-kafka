const express = require('express');
const cors = require('cors');

function iniciarHttp({
  obtenerEventos,
  port,
  origenFrontend,
  autorizar = (req, res, next) => next(),
}) {
  const app = express();

  app.use(cors({
    origin: origenFrontend,
    methods: ['GET', 'HEAD', 'OPTIONS'],
  }));
  app.use(autorizar);

  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.set('Allow', 'GET, HEAD, OPTIONS');

      return res.status(405).json({
        error: 'Method Not Allowed',
        mensaje: 'Este servicio es de solo lectura',
      });
    }

    next();
  });

  // Filtros sobre los eventos que audit tiene en memoria.
  app.get('/api/audit', (req, res) => {
    const filtros = {};

    for (const nombre of ['usuario', 'tipo', 'desde', 'hasta']) {
      const valor = req.query[nombre];

      if (valor !== undefined && typeof valor !== 'string') {
        return res.status(400).json({
          error: `El filtro ${nombre} debe ser un texto`,
        });
      }

      filtros[nombre] = valor?.trim() || '';
    }

    const desdeMs = filtros.desde
      ? Date.parse(filtros.desde)
      : null;

    const hastaMs = filtros.hasta
      ? Date.parse(filtros.hasta)
      : null;

    if (
      (desdeMs !== null && !Number.isFinite(desdeMs)) ||
      (hastaMs !== null && !Number.isFinite(hastaMs))
    ) {
      return res.status(400).json({
        error: 'desde y hasta deben ser fechas validas',
        ejemplo: '2026-10-29T00:00:00Z',
      });
    }

    if (
      desdeMs !== null &&
      hastaMs !== null &&
      desdeMs > hastaMs
    ) {
      return res.status(400).json({
        error: 'desde no puede ser posterior a hasta',
      });
    }

    const resultado = obtenerEventos()
      .filter(evento => {
        const fechaMs = Date.parse(evento.fecha);

        return (
          (!filtros.usuario ||
            evento.actor.usuario === filtros.usuario) &&
          (!filtros.tipo ||
            evento.tipo === filtros.tipo) &&
          (desdeMs === null || fechaMs >= desdeMs) &&
          (hastaMs === null || fechaMs <= hastaMs)
        );
      })
      .sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha));

    // Sin parámetro se conserva el contrato del ejercicio original.
    // La UI integrada pide una ventana acotada para las cargas de 50.000.
    const limit=req.query.limite===undefined?null:Number(req.query.limite);
    if(limit!==null && (!Number.isInteger(limit)||limit<1||limit>5000))
      return res.status(400).json({error:'limite debe ser entero entre 1 y 5000'});
    res.json(limit===null?resultado:resultado.slice(-limit));
  });

  // Timeline legible de un pedido.
  app.get('/api/audit/:pedidoId', (req, res) => {
    const resultado = obtenerEventos()
      .filter(evento => evento.pedidoId === req.params.pedidoId)
      .sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha))
      .map(evento => ({
        fecha: evento.fecha,
        tipo: evento.tipo,
        quien: [evento.actor.nombre,`${evento.actor.usuario} (${evento.actor.rol})`].filter(Boolean).join(" — "),
        desdeDonde: evento.origen,
      }));

    res.json(resultado);
  });

  app.use((req, res) => {
    res.status(404).json({
      error: 'Ruta no encontrada',
    });
  });

  const server = app.listen(port, process.env.HTTP_HOST || '127.0.0.1', () => {
    console.log(
      `[audit] HTTP disponible en http://localhost:${port}`
    );

    console.log(
      `[audit] Origen frontend permitido: ${origenFrontend}`
    );
  });

  server.on('error', error => {
    console.error(`[audit] error HTTP: ${error.message}`);
    process.exit(1);
  });

  return server;
}

module.exports = { iniciarHttp };
