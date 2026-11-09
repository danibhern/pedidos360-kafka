import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig(({mode})=>{
  const env={...loadEnv(mode,import.meta.dirname,''),...process.env};
  for(const key of ['ENTRA_TENANT_ID','ENTRA_CLIENT_ID','ENTRA_SCOPE'])
    if(!env[key]) throw new Error(`Falta ${key}: ejecuta node local/scripts/configurar.cjs`);
  return {
    root:path.resolve(import.meta.dirname,'ui'),
    publicDir:path.resolve(import.meta.dirname,'../public'),
    plugins:[react(),{
      name:'fuentes-locales',
      transform(code,id){
        if(id.endsWith('/src/App.css')) return code.replace(/^@import url\("https:\/\/fonts\.googleapis\.com[^\n]+\n/m,'');
      },
    }],
    define:{
      'import.meta.env.MODE':JSON.stringify('lab'),
      'import.meta.env.VITE_API_BASE_URL':JSON.stringify('http://127.0.0.1:3100'),
      'import.meta.env.VITE_REPORT_API':JSON.stringify('http://127.0.0.1:3001/api/report'),
      'import.meta.env.VITE_AUDIT_API':JSON.stringify('http://127.0.0.1:3002/api/audit'),
      'import.meta.env.VITE_AZURE_CLIENT_ID':JSON.stringify(env.ENTRA_CLIENT_ID),
      'import.meta.env.VITE_AZURE_TENANT_ID':JSON.stringify(env.ENTRA_TENANT_ID),
      'import.meta.env.VITE_AZURE_REDIRECT_URI':JSON.stringify('http://localhost:5173'),
      'import.meta.env.VITE_API_SCOPE':JSON.stringify(env.ENTRA_SCOPE),
    },
    server:{host:'0.0.0.0',port:5173,strictPort:true,fs:{allow:[path.resolve(import.meta.dirname,'..')]}},
    build:{outDir:path.resolve(import.meta.dirname,'dist'),emptyOutDir:true},
  };
});
