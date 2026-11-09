// Imprime el árbol de znodes desde una ruta (npm run arbol -- /pedidos360).
// ZooKeeper guarda los datos como un sistema de archivos: cada "znode" tiene una ruta,
// un dato pequeño (bytes) y puede tener hijos.
const { conectar, esEfimero, hex } = require('../shared/zk');

const raiz = process.argv[2] || '/';
const MAX_DATO = 60;

async function recorrer(zk, ruta, prefijo, esUltimo, esRaiz) {
  const { dato, stat } = await zk.leer(ruta);
  const { hijos } = await zk.hijos(ruta);
  const nombre = esRaiz ? ruta : ruta.split('/').pop();
  const tipo = esEfimero(stat) ? `[E sesión ${hex(stat.ephemeralOwner)}]` : '[P]';
  const vista = dato ? `  = ${dato.replace(/\s+/g, ' ').slice(0, MAX_DATO)}${dato.length > MAX_DATO ? '…' : ''}` : '';
  console.log(`${prefijo}${esRaiz ? '' : esUltimo ? '└─ ' : '├─ '}${nombre} ${tipo} v${stat.version}${vista}`);

  const siguiente = esRaiz ? '' : prefijo + (esUltimo ? '   ' : '│  ');
  for (let i = 0; i < hijos.length; i++) {
    const hijo = ruta === '/' ? `/${hijos[i]}` : `${ruta}/${hijos[i]}`;
    try {
      await recorrer(zk, hijo, siguiente, i === hijos.length - 1, false);
    } catch { /* el nodo desapareció mientras recorríamos (p. ej. un efímero) */ }
  }
}

(async () => {
  const zk = await conectar({ silencioso: true });
  console.log('[P] = persistente  ·  [E] = efímero (muere con la sesión que lo creó)  ·  vN = versión del dato\n');
  await recorrer(zk, raiz, '', true, true);
  zk.cerrar();
})().catch(e => { console.error(e.message); process.exit(1); });
