import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadPublicData} from '../design/public-data.mjs';

export async function build({forceFallback=false,write=true}={}){
  const bundle=await loadPublicData({forceFallback});
  const read=name=>readFile(new URL('src/'+name,import.meta.url),'utf8');
  const [template,css,charts,app]=await Promise.all(['index.html','style.css','charts.mjs','app.js'].map(read));
  const script=charts.replace(/^export /gm,'')+'\n'+app;
  const json=JSON.stringify(bundle).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const html=template.replace('/* INLINE_CSS */',()=>css).replace('/* INLINE_DATA */',()=>json).replace('/* INLINE_JS */',()=>script);
  if(write)await writeFile(new URL('index.html',import.meta.url),html);
  return {html,bundle};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const {bundle}=await build();console.log(`Built site/index.html using ${bundle.source}; all data, styles and scripts inlined.`);
}
