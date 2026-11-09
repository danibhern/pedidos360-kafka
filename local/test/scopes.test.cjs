const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseApiScopes}=require('../scopes.cjs');
const api='33333333-3333-3333-3333-333333333333';
test('Conserva cuatro scopes completos de la misma API, comillas y espacios',()=>{
  const names=['orders.read','orders.write','catalog.read','catalog.write'];
  const values=names.map(s=>`api://${api}/${s}`);
  assert.deepEqual(parseApiScopes(`" ${values.join('  ')} "`,api),
    {names,values,appIdUri:`api://${api}`});
});
test('Rechaza listas vacías, scopes sin URI y permisos de otra API',()=>{
  for(const value of ['', 'orders.read',`api://${api}/orders.read api://otra-api/catalog.write`])
    assert.throws(()=>parseApiScopes(value,api));
});
