// CONFIGURACIÓN CENTRALIZADA (npm run config -- report)
// Un servicio lee su configuración desde /pedidos360/config y se entera AL INSTANTE
// cuando alguien la cambia, sin reiniciarse ni consultar cada X segundos (polling).
//
// Abre 2 o 3 terminales con este script y luego, en otra:
//   npm run config:set -- '{"descuento":15,"modoMantencion":false}'
const { conectar } = require('../shared/zk');

const RUTA = '/pedidos360/config';
const nombre = process.argv[2] || `servicio-${process.pid}`;
const INICIAL = { descuento: 0, modoMantencion: false, maxItemsPorPedido: 20 };

let config = {};

async function main() {
  const zk = await conectar({ silencioso: true });

  // Si la config aún no existe, la crea con valores por defecto.
  if (!(await zk.existe(RUTA))) {
    await zk.asegurar('/pedidos360');
    try { await zk.crear(RUTA, JSON.stringify(INICIAL)); } catch { /* otro servicio la creó primero */ }
  }

  // Patrón clave: leer + registrar watch. Cuando el watch se dispara, se vuelve a leer
  // (y con esa lectura se registra el siguiente watch, porque son de un solo uso).
  async function leerYVigilar() {
    const { dato, stat } = await zk.leer(RUTA, (evento) => {
      console.log(`[${nombre}] 🔔 ${evento.getName()}: la configuración cambió, la vuelvo a leer...`);
      leerYVigilar().catch(e => console.error(e.message));
    });
    config = JSON.parse(dato);
    console.log(`[${nombre}] config v${stat.version}:`, config);
  }

  await leerYVigilar();
  console.log(`[${nombre}] escuchando cambios en ${RUTA} (Ctrl+C para salir)\n`);

  // El "trabajo" del servicio usa siempre la config vigente.
  setInterval(() => {
    if (config.modoMantencion) return console.log(`[${nombre}] 🚧 en mantención: no proceso pedidos`);
    const total = 10000;
    console.log(`[${nombre}] proceso pedido de $${total} con ${config.descuento}% de descuento -> $${total * (1 - config.descuento / 100)}`);
  }, 5000);
}

main().catch(e => { console.error(e.message); process.exit(1); });
