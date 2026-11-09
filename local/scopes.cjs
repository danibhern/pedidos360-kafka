// Una lista de permisos delegados debe pertenecer a la misma API.
function parseApiScopes(raw, apiClientId) {
  const text=String(raw||'').trim().replace(/^(['"])(.*)\1$/s,'$2');
  const values=[...new Set(text.split(/\s+/).filter(Boolean))];
  if(!values.length) throw new Error('Faltan los scopes completos de la API');
  const expected=`api://${String(apiClientId).toLowerCase()}`;
  for(const value of values) {
    const match=/^(api:\/\/[^/\s]+)\/([^/\s]+)$/.exec(value);
    if(!match || match[1].toLowerCase()!==expected)
      throw new Error('Todos los scopes deben pertenecer al ID de aplicación API indicado');
  }
  return {
    values,
    names:values.map(value=>value.slice(value.lastIndexOf('/')+1)),
    appIdUri:values[0].slice(0,values[0].lastIndexOf('/')),
  };
}
module.exports={parseApiScopes};
