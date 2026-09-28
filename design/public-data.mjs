import {readFile} from 'node:fs/promises';
export const root = new URL('../',import.meta.url);
const load = async name => JSON.parse(await readFile(new URL('data/'+name,root),'utf8'));
// Publication filter: keep scientific content, remove identifiers and private references.
// Escapes keep the redaction dictionary itself out of the published vocabulary.
// The author's name is public on purpose (authorship and contact); only third-party people are omitted.
const people = /\b(?:\u0050rabowo\s+\u0053ubianto|\u004aoko\s+\u0057idodo)\b/gi;
const companies = /\b(?:\u0041nthropic|\u004fpenAI|\u0041libaba|\u004eVIDIA|\u0052unPod|\u0056ast(?:\.ai)?|\u004baggle|\u005a\.ai)\b/gi;
export function cleanString(value) {
  return value.replace(people,'[name omitted]').replace(companies,'[provider omitted]')
    .replace(/https?:\/\/[^\s<>"')]+/gi,'[external reference omitted]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[contact omitted]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,'[address omitted]')
    .replace(/\b[A-Z]:[\\/][^\s`"')]+/gi,'[private reference omitted]')
    .replace(/\b(?:[\w.-]+\/)+[\w.-]+\.(?:md|json|mjs|js|py|txt)(?:#[\w-]+)?/gi,m=>/^(?:flywheel|eval|studio|data|site|tools)\//.test(m)?m:'[internal document]')
    .replace(/\b(?:ruvnet\/ruvector)\b/g,'[repository reference omitted]');
}
function clean(value){
  if(typeof value==='string')return cleanString(value);
  if(Array.isArray(value))return value.map(clean);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['source','snapshotOf','_about'].includes(k)).map(([k,v])=>[k,clean(k==='model'&&typeof v==='string'?v.replace(/^[^:]+:(?=gpt-)/,''):v)]));
  return value;
}
export async function loadPublicData({forceFallback=false}={}){
  let main,source='migancore-public.id.json';
  if(!forceFallback){try{main=await load('migancore-public.en.json');source='migancore-public.en.json';}catch(e){if(e.code!=='ENOENT')throw e;}}
  main??=await load(source);
  const [lineage,timeline]=await Promise.all([load('lineage.en.json'),load('timeline.en.json')]);
  return {main:clean(main),lineage:clean(lineage),timeline:clean(timeline),source,language:source.includes('.en.')?'en':'id'};
}
