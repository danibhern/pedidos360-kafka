// EL CONTROLADOR DE KAFKA EN ZOOKEEPER (npm run controlador)
// Requiere: docker compose --profile kafka up -d   (o npm run up:kafka)
//
// En un clúster Kafka (modo ZooKeeper), UN broker es el "controlador": decide qué broker
// es líder de cada partición y reacciona cuando un broker cae. ¿Cómo se elige?
//   - Todos los brokers intentan crear el znode EFÍMERO /controller.
//   - El primero que lo logra es el controlador; los demás reciben NODE_EXISTS y lo vigilan.
//   - Si el controlador muere, su sesión termina, /controller se borra y los otros compiten de nuevo.
//   - /controller_epoch sube en cada cambio: así se ignoran órdenes de un controlador "zombi".
//
// Este script vigila esos znodes y también /brokers/ids (cada broker vivo = un nodo efímero).
// (Desde Kafka 3.3 existe KRaft, que reemplaza a ZooKeeper por un quórum Raft interno de Kafka;
//  la idea de "un controlador elegido + epoch" es la misma.)
const { conectar, describirStat } = require('../shared/zk');

(async () => {
  const zk = await conectar({ silencioso: true });

  // Cada watch vive en su propio ciclo "leer + vigilar" y al dispararse solo
  // se re-registra a sí mismo. Luego pide redibujar (agrupando avisos seguidos).
  let pendiente = null;
  const redibujar = () => { clearTimeout(pendiente); pendiente = setTimeout(() => mostrar().catch(console.error), 300); };

  async function vigilarBrokers() {
    try {
      await zk.hijos('/brokers/ids', (ev) => { console.log(`🔔 ${ev.getName()} en /brokers/ids`); vigilarBrokers(); redibujar(); });
    } catch { setTimeout(vigilarBrokers, 2000); } // /brokers/ids aún no existe
  }

  async function vigilarController() {
    await zk.existe('/controller', (ev) => { console.log(`🔔 ${ev.getName()} en /controller`); vigilarController(); redibujar(); });
  }

  async function mostrar() {
    console.log(`\n── ${new Date().toLocaleTimeString()} ─────────────────────────────`);
    const ids = await zk.hijos('/brokers/ids').then(r => r.hijos).catch(() => []);
    const lista = [];
    for (const id of ids) {
      try { lista.push({ id, endpoints: JSON.parse((await zk.leer(`/brokers/ids/${id}`)).dato).endpoints.join(' ') }); } catch {}
    }
    console.log('Brokers vivos (/brokers/ids, nodos efímeros):');
    lista.length ? console.table(lista) : console.log('  (ninguno: ¿levantaste el perfil kafka?)');

    const actual = await zk.leer('/controller').catch(() => null);
    if (!actual) return console.log('⚠️  /controller no existe: no hay controlador (elección en curso o no hay brokers)');
    const epoch = await zk.leer('/controller_epoch').then(r => r.dato).catch(() => '?');
    const { brokerid } = JSON.parse(actual.dato);
    console.log(`👑 Controlador: broker ${brokerid}   ·   controller_epoch = ${epoch}`);
    console.log('   /controller ->', describirStat(actual.stat).tipo);
    console.log(`   Integración local: servicio kafka${brokerid}. Usa compose.yaml de local/, no inicies otro clúster.`);
  }

  if(process.env.ZK_ONCE!=='1'){
    await vigilarBrokers();
    await vigilarController();
  }
  await mostrar();
  if(process.env.ZK_ONCE==='1') zk.cerrar();
  else console.log('\nVigilando /controller y /brokers/ids (Ctrl+C para salir)...');
})().catch(e => { console.error(e.message); process.exit(1); });
