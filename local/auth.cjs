// La aplicación local NO emite tokens: solo acepta access tokens de Entra ID.
const profiles = ['cliente', 'operador', 'admin'];
function normalized(role) {
  const value = String(role).trim().toLowerCase();
  return ({client:'cliente',customer:'cliente',operator:'operador'})[value] || value;
}
function createAuth({tenant, audience, scope, tokenVersion='2', appIdUri, keySet, onVerified} = {}) {
  const guid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if(!guid.test(tenant||'') || !guid.test(audience||'') || !scope)
    throw new Error('Configura Entra real: ejecuta node local/scripts/configurar.cjs');
  if(!['1','2'].includes(tokenVersion)) throw new Error('ENTRA_TOKEN_VERSION debe ser 1 o 2');
  const acceptedScopes=String(scope).trim().split(/\s+/).filter(Boolean);
  const issuer=tokenVersion==='2'?`https://login.microsoftonline.com/${tenant}/v2.0`:
    `https://sts.windows.net/${tenant}/`;
  const expectedAudience=tokenVersion==='2'?audience:(appIdUri||`api://${audience}`);
  const library=import('jose').then(({createRemoteJWKSet,jwtVerify})=>({
    jwtVerify, keys:keySet || createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${tenant}/discovery/${tokenVersion==='2'?'v2.0/':''}keys`))
  }));
  async function verify(token) {
    const {jwtVerify,keys}=await library;
    const {payload}=await jwtVerify(token,keys,{
      issuer,audience:expectedAudience,algorithms:['RS256'],requiredClaims:['exp','iat','sub','tid'],
      clockTolerance:5,
    });
    if(payload.tid!==tenant || payload.ver!==`${tokenVersion}.0`) throw new Error('Tenant/versión incorrectos');
    if(!acceptedScopes.some(s=>String(payload.scp||'').split(/\s+/).includes(s)))
      throw Object.assign(new Error('Falta scope de la API'),{status:403});
    const roles=Array.isArray(payload.roles)?payload.roles.map(normalized).filter(x=>profiles.includes(x)):[];
    if(!roles.length) throw Object.assign(new Error('Sin rol de Pedidos360'),{status:403});
    return {...payload,roles};
  }
  function guard(roles=profiles, requiredScopes=[]) {
    return async(req,res,next)=>{
      const match=/^Bearer (\S+)$/i.exec(req.headers.authorization||'');
      if(!match) return res.status(401).json({message:'Falta access token de Microsoft'});
      let claims;
      try {claims=await verify(match[1]);}
      catch(e){return res.status(e.status===403?403:401).json({
        message:e.status===403?e.message:'Access token inválido, expirado o de otra API'});}
      if(!claims.roles.some(r=>roles.includes(r)))
        return res.status(403).json({message:'Rol no autorizado'});
      if(!requiredScopes.every(s=>acceptedScopes.includes(s) &&
        String(claims.scp||'').split(/\s+/).includes(s)))
        return res.status(403).json({message:'Falta scope para esta operación'});
      req.claims=claims;
      if(onVerified) onVerified(match[1],claims);
      next();
    };
  }
  return {guard,verify};
}
let live;
function guard(roles, requiredScopes) {
  const scopes=require('./scopes.cjs').parseApiScopes(
    process.env.ENTRA_SCOPE,process.env.ENTRA_API_CLIENT_ID);
  live ||= createAuth({
    tenant:process.env.ENTRA_TENANT_ID,audience:process.env.ENTRA_API_CLIENT_ID,
    scope:scopes.names.join(' '),
    tokenVersion:process.env.ENTRA_TOKEN_VERSION||'2',
    appIdUri:scopes.appIdUri,
    onVerified:(token,claims)=>require('./lab-control.cjs').remember(token,claims),
  });
  return live.guard(roles,requiredScopes);
}
module.exports={createAuth,guard,profiles,normalized};
