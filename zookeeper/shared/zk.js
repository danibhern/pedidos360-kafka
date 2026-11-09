// Cliente ZooKeeper compartido + versiones con Promesas de las operaciones básicas.
// La librería node-zookeeper-client usa callbacks; aquí las envolvemos para usar async/await.
const zookeeper = require('node-zookeeper-client');
const { CreateMode, Exception } = zookeeper;

// El cliente recibe TODOS los nodos del ensamble: si uno cae, se reconecta a otro
// manteniendo la MISMA sesión (los nodos efímeros no se pierden).
const CONEXION = process.env.ZK_CONNECT || 'localhost:2181,localhost:2182,localhost:2183';

// Si el servidor no sabe nada del cliente durante este tiempo, la sesión EXPIRA
// y ZooKeeper borra sus nodos efímeros.
const SESSION_TIMEOUT = Number(process.env.ZK_SESSION_TIMEOUT || 6000);

function conectar({ silencioso = false } = {}) {
  const client = zookeeper.createClient(CONEXION, {
    sessionTimeout: SESSION_TIMEOUT,
    spinDelay: 1000,
    retries: 3,
  });

  client.on('state', (estado) => {
    if (silencioso) return;
    console.log(`[zk] estado de la sesión: ${estado.name} (sesión ${hex(client.getSessionId())})`);
    if (estado === zookeeper.State.EXPIRED) {
      console.log('[zk] ¡Sesión expirada! Todos mis nodos efímeros fueron borrados. Saliendo.');
      process.exit(1);
    }
  });

  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`No se pudo conectar a ${CONEXION}. ¿Corriste "docker compose up -d"?`)), 15000);
    client.once('connected', () => { clearTimeout(t); resolve(crearApi(client)); });
    client.connect();
  });
}

// Convierte "client.op(args..., callback)" en una Promesa.
const p = (fn) => new Promise((res, rej) => fn((err, ...r) => (err ? rej(err) : res(r))));

function crearApi(client) {
  return {
    client,
    sesion: () => hex(client.getSessionId()),

    // modo: CreateMode.PERSISTENT | EPHEMERAL | PERSISTENT_SEQUENTIAL | EPHEMERAL_SEQUENTIAL
    crear: async (ruta, dato = '', modo = CreateMode.PERSISTENT) =>
      (await p(cb => client.create(ruta, Buffer.from(String(dato)), modo, cb)))[0],

    // Crea la ruta completa (como mkdir -p). No falla si ya existe.
    asegurar: async (ruta) => { await p(cb => client.mkdirp(ruta, cb)); },

    // watcher (opcional): función que ZooKeeper llamará UNA vez cuando el nodo cambie.
    leer: async (ruta, watcher) => {
      const [data, stat] = await p(cb => watcher ? client.getData(ruta, watcher, cb) : client.getData(ruta, cb));
      return { dato: data ? data.toString() : '', stat };
    },

    hijos: async (ruta, watcher) => {
      const [hijos, stat] = await p(cb => watcher ? client.getChildren(ruta, watcher, cb) : client.getChildren(ruta, cb));
      return { hijos: hijos.sort(), stat };
    },

    existe: async (ruta, watcher) =>
      (await p(cb => watcher ? client.exists(ruta, watcher, cb) : client.exists(ruta, cb)))[0] || null,

    // version = -1 significa "cualquier versión". Con una versión concreta, la escritura
    // solo se aplica si nadie modificó el nodo antes (control de concurrencia optimista).
    escribir: async (ruta, dato, version = -1) =>
      (await p(cb => client.setData(ruta, Buffer.from(String(dato)), version, cb)))[0],

    borrar: async (ruta, version = -1) => { await p(cb => client.remove(ruta, version, cb)); },

    cerrar: () => client.close(),
  };
}

// --- Utilidades para mostrar el "Stat" de un znode ---
const hex = (buf) => '0x' + Buffer.from(buf).toString('hex').replace(/^0+(?=.)/, '');
const esEfimero = (stat) => !Buffer.from(stat.ephemeralOwner).equals(Buffer.alloc(8));
const fecha = (buf) => new Date(Number(Buffer.from(buf).readBigInt64BE())).toLocaleTimeString();

function describirStat(stat) {
  return {
    tipo: esEfimero(stat) ? `EFÍMERO (dueño: sesión ${hex(stat.ephemeralOwner)})` : 'PERSISTENTE',
    version: stat.version,             // cuántas veces se ha modificado el dato
    cversion: stat.cversion,           // cuántas veces cambiaron sus hijos
    hijos: stat.numChildren,
    czxid: hex(stat.czxid),            // id de la transacción que lo creó
    mzxid: hex(stat.mzxid),            // id de la última transacción que lo modificó
    creado: fecha(stat.ctime),
  };
}

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = { conectar, CreateMode, Exception, describirStat, esEfimero, hex, esperar, CONEXION };
