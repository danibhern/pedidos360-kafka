// DESCUBRIMIENTO DE SERVICIOS (npm run descubrir -- report)
// Un "cliente" (ej. un API Gateway) vigila los hijos de /pedidos360/servicios/<nombre>
// y mantiene al día la lista de instancias vivas, repartiendo pedidos entre ellas (round-robin).
const { conectar } = require('../shared/zk');

const servicio = process.argv[2] || 'report';
const BASE = `/pedidos360/servicios/${servicio}`;
let instancias = [];
let turno = 0;

(async () => {
  const zk = await conectar({ silencioso: true });
  await zk.asegurar(BASE);

  // getChildren + watch: avisa cuando se AGREGA o se QUITA un hijo (no cuando cambia su dato).
  async function vigilar() {
    const { hijos } = await zk.hijos(BASE, (evento) => {
      console.log(`🔔 ${evento.getName()}: cambió el conjunto de instancias`);
      vigilar().catch(e => console.error(e.message));
    });
    instancias = [];
    for (const h of hijos) {
      try { instancias.push({ nodo: h, ...JSON.parse((await zk.leer(`${BASE}/${h}`)).dato) }); } catch {}
    }
    console.log(`Instancias vivas de "${servicio}": ${instancias.length}`);
    if (instancias.length) console.table(instancias.map(({ nodo, puerto, pid }) => ({ nodo, puerto, pid })));
  }

  await vigilar();

  setInterval(() => {
    if (!instancias.length) return console.log('⚠️  no hay instancias vivas: el pedido queda en espera');
    const destino = instancias[turno++ % instancias.length];
    console.log(`→ pedido enviado a ${destino.nodo} (localhost:${destino.puerto})`);
  }, 3000);
})().catch(e => { console.error(e.message); process.exit(1); });
