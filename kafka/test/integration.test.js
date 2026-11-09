const { test } = require('node:test');
const assert = require('node:assert/strict');
const { leerMensaje, procesarOrdenado } = require('../bridge/orden');
const { validar } = require('../shared/dto');
const kpis = require('../report/kpis');
const { iniciarHttp: reportHttp } = require('../report/http');
const { iniciarHttp: auditHttp } = require('../audit/http');

const evento = (revision, tipo, extra = {}) => ({
  eventId: `test-${revision}`, version: 2, revision, tipo,
  pedidoId: 'PRUEBA-LOCAL-NO-COMPRA', clienteId: 'cliente-test',
  total: 30000, fecha: new Date(Date.UTC(2026, 10, 2, 12, 0, revision)).toISOString(),
  items: [{ productoId: 'ELECTRONICO-PRUEBA', cantidad: 2, precio: 15000 }],
  actor: { usuario: 'usuario-test', rol: revision ? 'OPERADOR' : 'CLIENTE' },
  origen: 'test-local', ...extra,
});
const tipos = ['PEDIDO_CREADO', 'PEDIDO_ACEPTADO', 'PEDIDO_EN_PREPARACION',
  'PEDIDO_DESPACHADO', 'PEDIDO_ENTREGADO'];

test('DTO original, mensajes SNS y revisión obligatoria', () => {
  const e = evento(0, tipos[0]);
  assert.deepEqual(validar(e), []);
  assert.equal(leerMensaje(JSON.stringify(e)).pedidoId, e.pedidoId);
  assert.equal(leerMensaje(JSON.stringify({
    Type: 'Notification', Message: JSON.stringify(e),
  })).eventId, e.eventId);
  assert.throws(() => leerMensaje(JSON.stringify({ ...e, revision: undefined })), /revision/);
  assert.throws(() => leerMensaje(JSON.stringify({ ...e, total: 1 })), /total/);
});

test('SQS fuera de orden: no confirma saltos, duplica de forma segura y no avanza si falla Kafka/disco', async () => {
  const estado = Object.create(null);
  const publicados = [];
  let disco;
  const publicar = async e => { publicados.push(e); };
  const guardar = async next => { disco = JSON.parse(JSON.stringify(next)); };
  const procesar = e => procesarOrdenado({ evento: e, estado, publicar, guardar });
  assert.equal(await procesar(evento(1, tipos[1])), false);
  assert.equal(publicados.length, 0);
  assert.equal(await procesar(evento(0, tipos[0])), true);
  assert.equal(await procesar(evento(0, tipos[0])), true);
  assert.equal(publicados.length, 1);
  assert.equal(await procesar(evento(1, tipos[1])), true);
  assert.equal(disco['PRUEBA-LOCAL-NO-COMPRA'].revision, 1);
  await assert.rejects(procesarOrdenado({
    evento: evento(2, tipos[2]), estado,
    publicar: async () => { throw new Error('Kafka caído'); }, guardar,
  }), /Kafka/);
  assert.equal(estado['PRUEBA-LOCAL-NO-COMPRA'].revision, 1);
  await assert.rejects(procesarOrdenado({
    evento: evento(2, tipos[2]), estado, publicar,
    guardar: async () => { throw new Error('Disco lleno'); },
  }), /Disco/);
  assert.equal(estado['PRUEBA-LOCAL-NO-COMPRA'].revision, 1);
  await assert.rejects(procesar(evento(1, tipos[1], { eventId: 'conflicto' })), /otro eventId/);
  const recuperado = Object.assign(Object.create(null), disco);
  assert.equal(await procesarOrdenado({
    evento: evento(1, tipos[1]), estado: recuperado,
    publicar: async () => assert.fail('No debe republicar'), guardar,
  }), true);
});

test('Seis API reales entregadas, CORS, 405, filtros e idempotencia del KPI', async () => {
  const eventos = tipos.map((tipo, i) => evento(i, tipo));
  for (const e of eventos) kpis.aplicar(e);
  assert.equal(kpis.aplicar(eventos[0]), false);
  const origenFrontend = 'http://localhost:5173';
  const report = reportHttp({ kpis, port: 0, origenFrontend });
  const audit = auditHttp({ obtenerEventos: () => eventos, port: 0, origenFrontend });
  await Promise.all([report, audit].map(server =>
    new Promise(resolve => server.listening ? resolve() : server.on('listening', resolve))));
  const r = `http://127.0.0.1:${report.address().port}/api/report`;
  const a = `http://127.0.0.1:${audit.address().port}/api/audit`;
  try {
    const ventas = await fetch(`${r}/ventas-por-hora`, {
      headers: { Origin: origenFrontend },
    });
    assert.equal(ventas.headers.get('access-control-allow-origin'), origenFrontend);
    assert.equal((await ventas.json())[0].total, 30000);
    assert.equal((await (await fetch(`${r}/lead-time`)).json()).promedioSeg, 4);
    assert.equal((await (await fetch(`${r}/top-productos`)).json())[0].unidades, 2);
    assert.ok((await (await fetch(`${r}/estados`)).json()).every(e => e.cantidad === 0));
    assert.equal((await (await fetch(`${a}/PRUEBA-LOCAL-NO-COMPRA`)).json()).length, 5);
    assert.equal((await (await fetch(`${a}?tipo=PEDIDO_ENTREGADO`)).json()).length, 1);
    assert.equal((await (await fetch(a)).json()).length, 5);
    const ventana = await (await fetch(`${a}?limite=2`)).json();
    assert.deepEqual(ventana.map(e => e.tipo), tipos.slice(-2));
    for (const limite of ['0', '5001', 'no-numero']) {
      assert.equal((await fetch(`${a}?limite=${limite}`)).status, 400);
    }
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.equal((await fetch(`${r}/estados`, { method })).status, 405);
      assert.equal((await fetch(a, { method })).status, 405);
    }
    assert.equal((await fetch(`${a}?desde=fecha-invalida`)).status, 400);
    assert.equal((await fetch(`${a}?desde=2026-11-03&hasta=2026-11-01`)).status, 400);
    assert.equal((await fetch(`${a}?usuario=usuario-test`)).status, 200);
  } finally {
    await Promise.all([report, audit].map(server => new Promise(resolve => server.close(resolve))));
  }
});
