// REGISTRO DE SERVICIOS (npm run servicio -- report 4001)
// Cada instancia se anota como znode EFÍMERO + SECUENCIAL en /pedidos360/servicios/<nombre>.
// Mientras el proceso esté vivo (y su sesión también), el nodo existe.
// Si el proceso muere, ZooKeeper borra el nodo: los clientes dejan de enviarle tráfico.
//
//   Ctrl+C       -> cierre ordenado: la sesión se cierra y el nodo desaparece al instante.
//   kill -9 <pid> -> muerte súbita: el nodo desaparece cuando EXPIRA la sesión (~6 s).
const { conectar, CreateMode } = require('../shared/zk');

const servicio = process.argv[2] || 'report';
const puerto = process.argv[3] || String(4000 + Math.floor(Math.random() * 1000));
const BASE = `/pedidos360/servicios/${servicio}`;

(async () => {
  const zk = await conectar();
  await zk.asegurar(BASE);

  const datos = JSON.stringify({ host: 'localhost', puerto, pid: process.pid, desde: new Date().toISOString() });
  const ruta = await zk.crear(`${BASE}/instancia-`, datos, CreateMode.EPHEMERAL_SEQUENTIAL);

  console.log(`✅ ${servicio} registrado en ${ruta}`);
  console.log(`   pid=${process.pid}  puerto=${puerto}  sesión=${zk.sesion()}`);
  console.log(`   Prueba: Ctrl+C (cierre limpio)  o  kill -9 ${process.pid} (muerte súbita)\n`);

  process.on('SIGINT', () => { console.log('\nCerrando sesión ordenadamente...'); zk.cerrar(); setTimeout(() => process.exit(0), 300); });
  setInterval(() => {}, 1 << 30); // mantener vivo el proceso
})().catch(e => { console.error(e.message); process.exit(1); });
