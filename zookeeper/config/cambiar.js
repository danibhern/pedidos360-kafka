// Cambia la configuración centralizada (npm run config:set -- '{"descuento":15}').
// Hace un MERGE con la config actual y escribe usando la versión leída:
// si otro admin la cambió entre medio, ZooKeeper rechaza la escritura (BAD_VERSION) y reintentamos.
const { conectar, Exception } = require('../shared/zk');

const RUTA = '/pedidos360/config';

(async () => {
  const cambios = JSON.parse(process.argv[2] || '{}');
  const zk = await conectar({ silencioso: true });

  for (let intento = 1; intento <= 5; intento++) {
    const { dato, stat } = await zk.leer(RUTA);
    const nueva = { ...JSON.parse(dato), ...cambios };
    try {
      const s = await zk.escribir(RUTA, JSON.stringify(nueva), stat.version);
      console.log(`Config actualizada: v${stat.version} -> v${s.version}`, nueva);
      break;
    } catch (e) {
      if (e.getCode && e.getCode() === Exception.BAD_VERSION) { console.log('Otro la modificó primero, reintento...'); continue; }
      throw e;
    }
  }
  zk.cerrar();
})().catch(e => { console.error(e.message); process.exit(1); });
