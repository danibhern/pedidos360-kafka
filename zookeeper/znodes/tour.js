// Recorrido guiado por los tipos de znode y sus operaciones (npm run znodes).
// Cada paso imprime qué hace y qué responde ZooKeeper.
const { conectar, CreateMode, describirStat, esperar } = require('../shared/zk');

const BASE = '/pedidos360/demo';
const paso = (n, t) => console.log(`\n── Paso ${n}: ${t} ${'─'.repeat(Math.max(0, 60 - t.length))}`);

(async () => {
  const zk = await conectar();
  console.log(`Conectado. Mi sesión es ${zk.sesion()}`);

  // Limpieza de una ejecución anterior
  try { for (const h of (await zk.hijos(BASE)).hijos) await zk.borrar(`${BASE}/${h}`); await zk.borrar(BASE); } catch {}
  await zk.asegurar('/pedidos360');

  paso(1, 'znode PERSISTENTE');
  await zk.crear(BASE, 'nodo de prueba', CreateMode.PERSISTENT);
  console.log(`create ${BASE} -> sobrevive aunque este programa termine`);
  console.log(describirStat((await zk.leer(BASE)).stat));

  paso(2, 'crear un nodo que ya existe');
  try { await zk.crear(BASE, 'otra vez'); }
  catch (e) { console.log(`Error esperado: ${e.name} -> las rutas son únicas (base para locks y elección de líder)`); }

  paso(3, 'escribir y la VERSIÓN del dato');
  await zk.escribir(`${BASE}`, 'stock=10');
  let { dato, stat } = await zk.leer(BASE);
  console.log(`dato="${dato}"  version=${stat.version}  (cada setData suma 1)`);

  paso(4, 'escritura CONDICIONAL (concurrencia optimista)');
  const versionLeida = stat.version;
  console.log(`Cliente A leyó version=${versionLeida}. Mientras tanto, cliente B escribe...`);
  await zk.escribir(BASE, 'stock=9');                         // "cliente B"
  try { await zk.escribir(BASE, 'stock=7', versionLeida); }   // "cliente A" con versión vieja
  catch (e) { console.log(`Cliente A recibe ${e.name}: su versión quedó obsoleta, debe releer y reintentar.`); }
  console.log(`dato final = "${(await zk.leer(BASE)).dato}"  -> no se perdió la actualización de B`);

  paso(5, 'znode EFÍMERO');
  await zk.crear(`${BASE}/yo-estoy-vivo`, 'pid ' + process.pid, CreateMode.EPHEMERAL);
  console.log(describirStat((await zk.leer(`${BASE}/yo-estoy-vivo`)).stat));
  console.log('Vive mientras viva MI sesión (fíjate que el dueño es mi sesión). Regla: un efímero NO puede tener hijos.');

  paso(6, 'znodes SECUENCIALES');
  for (let i = 0; i < 3; i++) {
    const ruta = await zk.crear(`${BASE}/turno-`, '', CreateMode.EPHEMERAL_SEQUENTIAL);
    console.log(`pedí "${BASE}/turno-"  ->  ZooKeeper creó "${ruta}"`);
  }
  console.log('El sufijo de 10 dígitos lo asigna el servidor: es un contador ordenado y único (como un "número de atención").');

  paso(7, 'WATCH: avisos de cambios');
  await zk.leer(BASE, (evento) => console.log(`  🔔 watch disparado: ${evento.getName()} en ${evento.getPath()}`));
  console.log('Registré un watch en el dato. Ahora lo modifico dos veces:');
  await zk.escribir(BASE, 'stock=8'); await esperar(300);
  await zk.escribir(BASE, 'stock=6'); await esperar(300);
  console.log('Solo hubo UN aviso: los watches son de un solo uso; hay que volver a registrarlos.');

  paso(8, 'el árbol ahora');
  console.log((await zk.hijos(BASE)).hijos.map(h => `${BASE}/${h}`).join('\n'));

  console.log(`\nMe quedo vivo 30 s. Corre en otra terminal:  npm run arbol -- ${BASE}`);
  console.log('Después de que yo termine, vuelve a correrlo: los nodos efímeros ya no estarán.');
  await esperar(Number(process.env.ESPERA ?? 30000));
  zk.cerrar();
})().catch(e => { console.error(e); process.exit(1); });

