// Reutilizar los scripts entregados por el profesor, apuntando al mismo clúster.
const path=require('node:path');
process.env.ZK_CONNECT ||= '127.0.0.1:12181,127.0.0.1:12182,127.0.0.1:12183';
const files={estado:'ensamble/estado.js',controlador:'kafka/controlador.js',arbol:'znodes/arbol.js'};
const action=process.argv[2] || 'controlador';
// En la guía se ejecutan comandos consecutivos; evitar un watch infinito.
process.env.ZK_ONCE ||= '1';
if(!files[action]) throw new Error('Usa estado, controlador o arbol [ruta]');
process.argv=[process.argv[0],files[action],...process.argv.slice(3)];
require(path.resolve(__dirname,'../../zookeeper',files[action]));
