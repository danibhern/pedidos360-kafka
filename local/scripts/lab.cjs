// Ejecutar desde cualquier carpeta. Requiere Node >= 20 y Docker Compose v2.
const { spawnSync }=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..'),envFile=path.join(root,'local/.env');
if(!fs.existsSync(envFile)) {
  console.error('Primero configura Entra real: node local/scripts/configurar.cjs');
  process.exit(1);
}
const action=process.argv[2] || 'up';
const args=['compose','--project-name','pedidos360-local','--env-file',envFile,
  '-f',path.join(root,'local/compose.yaml')];
let extra;
switch(action){
  case 'up': {
    // api, report, audit y frontend comparten una imagen: se construye una sola vez
    // para evitar el error "image already exists" de Docker Desktop.
    const build=spawnSync('docker',[...args,'build','api'],{cwd:root,stdio:'inherit'});
    if(build.status!==0) process.exit(build.status ?? 1);
    extra=['up','-d','--wait','--wait-timeout','300'];break;
  }
  case 'down':extra=['down'];break; // Nunca elimina volúmenes.
  case 'ps':extra=['ps'];break;
  case 'logs':extra=['logs','--tail','100',...(process.argv[3]?[process.argv[3]]:[])];break;
  case 'sesiones': case 'olvidar-sesiones': case 'e2e': case 'carga': case 'flujo':
    extra=['exec','-T','api','node','local/scripts/run.cjs',action,...process.argv.slice(3)];break;
  case 'restart-projections':extra=['restart','report','audit'];break;
  case 'zk':extra=['exec','-T','api','node','local/scripts/zk.cjs',...process.argv.slice(3)];break;
  case 'mq':extra=['exec','-T','localstack','awslocal',
    ...(process.argv[3]==='topics'?['sns','list-topics']:['sqs','list-queues'])];break;
  case 'unit':extra=['exec','-T','api','npm','run','unit','--prefix','local'];break;
  case 'persistencia':extra=['exec','-T','api','node','local/scripts/run.cjs',action,...process.argv.slice(3)];break;
  default:throw new Error('Acciones: up, down, ps, logs, sesiones, olvidar-sesiones, e2e, carga, flujo, persistencia, restart-projections, unit, mq, zk');
}
const result=spawnSync('docker',[...args,...extra],{cwd:root,stdio:'inherit'});
if(result.error) console.error('No se pudo ejecutar Docker. Abre Docker Desktop y comprueba docker compose version.');
process.exitCode=result.status ?? 1;
