const express = require('express');
const cors = require('cors');

function iniciarHttp({ kpis, port, origenFrontend, autorizar = (req, res, next) => next() }) {
  const app = express();

  app.use(cors({
    origin: origenFrontend,
    methods: ['GET', 'HEAD', 'OPTIONS'],
  }));
  app.use(autorizar);

  // OPTIONS lo atiende cors antes de llegar a este bloqueo.
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

  app.get('/api/report/ventas-por-hora', (req, res) => {
    res.json(kpis.obtener().ventasPorHora);
  });

  app.get('/api/report/lead-time', (req, res) => {
    res.json(kpis.obtener().leadTime);
  });

  app.get('/api/report/top-productos', (req, res) => {
    res.json(kpis.obtener().topProductos);
  });

  app.get('/api/report/estados', (req, res) => {
    res.json(kpis.obtener().pedidosPorEstado);
  });

  app.use((req, res) => {
    res.status(404).json({
      error: 'Ruta no encontrada',
    });
  });

  const server = app.listen(port, process.env.HTTP_HOST || '127.0.0.1', () => {
    console.log(
      `[report] HTTP disponible en http://localhost:${port}`
    );

    console.log(
      `[report] Origen frontend permitido: ${origenFrontend}`
    );
  });

  server.on('error', error => {
    console.error(`[report] error HTTP: ${error.message}`);
    process.exit(1);
  });

  return server;
}

module.exports = { iniciarHttp };
