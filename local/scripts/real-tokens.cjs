// Recibidos exclusivamente por stdin desde el auxiliar local. No se fabrican JWTs.
let cache;
async function tokens() {
  if(!cache) cache=(async()=>{
    if(process.stdin.isTTY) throw new Error('Usa node local/scripts/lab.cjs; inicia sesión en Microsoft primero');
    let input='';
    for await(const chunk of process.stdin) {
      input+=chunk;
      if(input.length>200000) throw new Error('Entrada demasiado grande');
    }
    return JSON.parse(input);
  })();
  return cache;
}
async function token(role='admin') {
  const value=(await tokens())[role];
  if(typeof value!=='string' || !value) throw new Error(`Falta sesión real ${role}`);
  return value;
}
module.exports={token};
