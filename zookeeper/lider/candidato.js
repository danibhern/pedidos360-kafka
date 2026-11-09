// ELECCIÓN DE LÍDER (npm run candidato -- A)
// Problema: hay varias réplicas del "cierre de caja diario" de Pedidos360, pero el cierre
// debe ejecutarlo UNA sola a la vez. ZooKeeper elige quién.
//
// Receta clásica de ZooKeeper:
//   1. Cada candidato crea un nodo EFÍMERO + SECUENCIAL en /pedidos360/eleccion
//   2. El que tiene el número MÁS BAJO es el líder.
//   3. Los demás vigilan SOLO al nodo inmediatamente anterior al suyo (no al líder):
//      así, cuando alguien cae, se despierta un solo candidato y no todos
//      (se evita el "efecto manada" / herd effect).
//   4. Si el nodo vigilado desaparece, se vuelve al paso 2.
const { conectar, CreateMode } = require('../shared/zk');

const BASE = '/pedidos360/eleccion';
const nombre = process.argv[2] || `cand-${process.pid}`;

(async () => {
  const zk = await conectar();
  await zk.asegurar(BASE);

  const miRuta = await zk.crear(`${BASE}/c-`, nombre, CreateMode.EPHEMERAL_SEQUENTIAL);
  const miNodo = miRuta.split('/').pop();
  console.log(`[${nombre}] me postulé como ${miNodo} (pid ${process.pid})`);

  let tareaLider = null;

  async function evaluar() {
    const { hijos } = await zk.hijos(BASE);      // ya vienen ordenados
    const pos = hijos.indexOf(miNodo);
    console.log(`[${nombre}] fila de candidatos: ${hijos.join(' < ')}`);

    if (pos === 0) {
      console.log(`[${nombre}] 👑 SOY EL LÍDER`);
      tareaLider = setInterval(() => console.log(`[${nombre}] 👑 ejecutando cierre de caja... ${new Date().toLocaleTimeString()}`), 3000);
      return;
    }

    const anterior = hijos[pos - 1];
    // exists + watch: nos avisa cuando ese nodo se borre.
    const stat = await zk.existe(`${BASE}/${anterior}`, (evento) => {
      console.log(`[${nombre}] 🔔 ${evento.getName()} en ${anterior}: ¡el de adelante cayó! Re-evalúo...`);
      evaluar().catch(e => console.error(e.message));
    });
    if (!stat) return evaluar(); // desapareció justo entre getChildren y exists
    const { dato } = await zk.leer(`${BASE}/${hijos[0]}`).catch(() => ({ dato: '?' }));
    console.log(`[${nombre}] soy seguidor. Líder actual: ${dato} (${hijos[0]}). Vigilo solo a ${anterior}.`);
  }

  await evaluar();

  process.on('SIGINT', () => {
    clearInterval(tareaLider);
    console.log(`\n[${nombre}] renuncio (cierro sesión, mi nodo efímero desaparece)`);
    zk.cerrar(); setTimeout(() => process.exit(0), 300);
  });
})().catch(e => { console.error(e.message); process.exit(1); });
