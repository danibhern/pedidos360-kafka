// Muestra el estado de cada nodo del ensamble cada 2 s (npm run estado).
// Usa el comando de diagnóstico "srvr" (four-letter word) por TCP, igual que
//   docker exec zk-zoo1 zkServer.sh status
//
// Prueba: detén el líder (docker stop zk-zooX) y mira cómo los otros eligen uno nuevo.
const net = require('net');

const NODOS = (process.env.ZK_CONNECT || 'localhost:2181,localhost:2182,localhost:2183')
  .split(',').map((address,i)=>({
    nombre:`zoo${i+1}`,host:address.split(':')[0],puerto:Number(address.split(':')[1]),
    contenedor:`zoo${i+1} (servicio Compose)`,
  }));

function srvr(host,puerto) {
  return new Promise((resolve) => {
    let salida = '';
    const s = net.connect({ host, port: puerto }, () => s.write('srvr'));
    s.setTimeout(1500, () => { s.destroy(); resolve(null); });
    s.on('data', d => { salida += d; });
    s.on('end', () => resolve(salida));
    s.on('error', () => resolve(null));
  });
}

function parsear(texto) {
  if (!texto) return { modo: 'CAÍDO / sin respuesta' };
  if (texto.includes('not currently serving')) return { modo: 'SIN QUÓRUM (no atiende clientes)' };
  const campo = (k) => (texto.match(new RegExp(`${k}: (.*)`)) || [])[1];
  return {
    modo: (campo('Mode') || '?').toUpperCase(),   // LEADER / FOLLOWER
    zxid: campo('Zxid'),                          // última transacción aplicada (epoch + contador)
    znodes: campo('Node count'),
    conexiones: campo('Connections'),
  };
}

async function ciclo() {
  const filas = await Promise.all(NODOS.map(async n => ({ nodo: n.nombre, contenedor: n.contenedor, ...parsear(await srvr(n.host,n.puerto)) })));
  const vivos = filas.filter(f => f.modo === 'LEADER' || f.modo === 'FOLLOWER').length;
  console.clear();
  console.log(`Ensamble ZooKeeper  ·  ${new Date().toLocaleTimeString()}`);
  console.table(filas);
  console.log(`Nodos sirviendo: ${vivos}/3  ·  quórum necesario: 2  ·  ${vivos >= 2 ? '✅ HAY QUÓRUM' : '❌ SIN QUÓRUM: nadie puede leer ni escribir'}`);
  console.log('\nzxid = 0x<epoch><contador>: el epoch (primeros dígitos) sube cada vez que se elige un líder nuevo.');
  console.log('Prueba:  docker stop <contenedor del LEADER>   ...y luego   docker start <el mismo>');
}

ciclo();
if(process.env.ZK_ONCE!=='1') setInterval(ciclo, 2000);
