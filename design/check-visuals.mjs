import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Script,createContext} from 'node:vm';
import {build} from '../site/build.mjs';
import {NS,field,modelName,period,dateKey,lineageLayout} from '../site/src/charts.mjs';
const base=new URL('../',import.meta.url);
const read=p=>readFile(new URL(p,base),'utf8');
let checks=0;function check(value,message){assert.ok(value,message);checks++;}

// Small, strict parser for the XML subset used by these SVGs. It does not load DTDs,
// execute code, resolve entities or consult a DOM. Attributes and text are parsed separately.
function parseXML(xml){
  let at=0;const roots=[],stack=[];
  const validEntities=s=>check(!/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/.test(s),'Invalid XML entity');
  while(at<xml.length){
    if(xml[at]!=='<'){const next=xml.indexOf('<',at),end=next<0?xml.length:next,s=xml.slice(at,end);validEntities(s);check(!s.includes(']]>'),'Invalid text terminator');if(stack.length)stack.at(-1).text+=s;else check(!s.trim(),'Text outside root');at=end;continue;}
    const close=xml.slice(at).match(/^<\/([A-Za-z_][\w:.-]*)\s*>/);
    if(close){check(stack.length>0&&stack.at(-1).name===close[1],'Mismatched closing tag: '+close[1]);stack.pop();at+=close[0].length;continue;}
    const open=xml.slice(at).match(/^<([A-Za-z_][\w:.-]*)/);check(open,'Invalid opening tag');at+=open[0].length;
    const node={name:open[1],attrs:{},children:[],text:''};let self=false;
    while(true){const whitespace=xml.slice(at).match(/^\s*/)[0];at+=whitespace.length;if(xml.startsWith('/>',at)){self=true;at+=2;break;}if(xml[at]==='>'){at++;break;}check(whitespace.length>0,'Missing attribute separator');const a=xml.slice(at).match(/^([A-Za-z_][\w:.-]*)\s*=\s*(["'])([\s\S]*?)\2/);check(a,'Malformed XML attribute');check(!(a[1] in node.attrs),'Duplicate attribute');check(!a[3].includes('<'),'Unescaped attribute');validEntities(a[3]);node.attrs[a[1]]=a[3];at+=a[0].length;}
    if(stack.length)stack.at(-1).children.push(node);else roots.push(node);if(!self)stack.push(node);
  }
  check(stack.length===0,'Unclosed XML tags');check(roots.length===1&&roots[0].name==='svg','Expected exactly one SVG root');return roots[0];
}
function balance(xml){const stack=[];for(const m of xml.matchAll(/<(\/?)([A-Za-z_][\w:.-]*)\b[^>]*?(\/?)>/g)){if(m[1])check(stack.pop()===m[2],'Simple tag balance mismatch');else if(!m[3])stack.push(m[2]);}check(stack.length===0,'Simple tag balance incomplete');}
function* descendants(n){yield n;for(const c of n.children)yield*descendants(c);}
function noRemote(s,label){check(!/https?:\/\//i.test(s.split(NS).join('')),label+': prohibited network URL');check(!/(?:src|href)\s*=\s*["']\/\//i.test(s),label+': protocol-relative resource');}
const expected=['01-at-a-glance','02-fabrication-ladder','03-verdict-mosaic','04-timeline','05-architecture','06-lineage','07-held-vs-refuted','08-preregistration-loop','09-instruments-failed-first'];
const names=(await readdir(new URL('docs/img/infographics/',base))).filter(n=>n.endsWith('.svg')).sort();
check(JSON.stringify(names)===JSON.stringify(expected.map(n=>n+'.svg')),'Expected exactly the nine named SVGs');
for(const name of names){const xml=await read('docs/img/infographics/'+name);check(Buffer.byteLength(xml)<250000,name+': too large');noRemote(xml,name);balance(xml);const tree=parseXML(xml),nodes=[...descendants(tree)];check(tree.attrs.width==='1200',name+': width');check(nodes.some(n=>n.name==='title'&&n.text.trim()),name+': accessible title');check(nodes.some(n=>n.name==='desc'&&n.text.trim()),name+': accessible description');check(tree.children.some(n=>n.name==='rect'&&n.attrs.x==='0'&&n.attrs.y==='0'&&n.attrs.width==='1200'&&n.attrs.height===tree.attrs.height&&/^#[\da-f]{6}$/i.test(n.attrs.fill)),name+': solid full background');check(!nodes.some(n=>['script','image','foreignObject'].includes(n.name)),name+': external or executable content');check(xml.includes('MiganCore open release · source:'),name+': source footer');
  for(const n of nodes.filter(n=>n.name==='text')){check(+n.attrs.x>=0&&+n.attrs.x<=1200,name+': text x out of bounds');check(+n.attrs.y>=0&&+n.attrs.y<+tree.attrs.height,name+': text y out of bounds');}
  console.log(`PASS ${name} (${Buffer.byteLength(xml)} bytes)`);
}
async function scan(dir){for(const entry of await readdir(new URL(dir,base),{withFileTypes:true})){const p=dir+entry.name;if(entry.isDirectory())await scan(p+'/');else noRemote(await read(p),p);}}
await scan('site/');
const {html,bundle}=await build();check(await read('site/index.html')===html,'Build output differs');
const match=html.match(/<script type="application\/json" id="research-data">([\s\S]*?)<\/script>/);check(match,'Inlined JSON missing');check(JSON.stringify(JSON.parse(match[1]))===JSON.stringify(bundle),'Bundled data mismatch');check(!html.includes('/* INLINE_'),'Unresolved template marker');check(!/<(?:script|link|img)\b[^>]*(?:src|href)\s*=/i.test(html),'External resource attribute');
const {main:d,lineage,timeline}=bundle;
check(d.preRegistrations.length===39&&d.counts.preRegistrations===39,'Experiment count');check(d.fabricationLadder.length===15,'Ladder count');check(lineage.entries.length===41&&d.counts.lineageEntries===41,'Lineage count');check(timeline.events.length===12,'Timeline count');check(d.lessons.length===34,'Lesson count');
for(const[state,count]of Object.entries(d.counts.verdictStates))check(d.preRegistrations.filter(e=>e.state===state).length===count,'Verdict state count '+state);
const ladder=await read('docs/img/infographics/02-fabrication-ladder.svg');for(const row of d.fabricationLadder){check(ladder.includes('fact acc '+row.factAccuracy+' · n='+row.validRounds),'Missing ladder metric');check(ladder.includes(row.fabricationPct+'%'),'Missing fabrication');check(ladder.includes('over-refusal '+row.overRefusalPct+'%'),'Missing over-refusal');}
check(modelName('qwen3:4b · polos')==='qwen3:4b (Thinking-2507) · plain','Thinking label correction');
for(const lane of lineageLayout(lineage.entries).lanes){let last=-1;for(const {entry}of lane.nodes){check(period(entry)>=last,'Lineage time order');last=period(entry);}}
const fallback=await build({forceFallback:true,write:false});check(fallback.bundle.source==='migancore-public.id.json','Fallback source');check(fallback.bundle.main.preRegistrations.length===39,'Fallback data completeness');check(fallback.html.includes('title_id'),'Fallback language fields');

// Exercise the emitted application in an isolated, minimal DOM fixture. This is a
// behavior check, not a browser layout claim. Both datasets run through the same UI.
function exercise(html,bundle){
  class Element{constructor(id){this.id=id;this.value='';this.checked=false;this.hidden=false;this.attrs={};this.dataset={};this.events={};this.innerHTML='';this.textContent='';}addEventListener(type,fn){(this.events[type]??=[]).push(fn);}setAttribute(k,v){this.attrs[k]=v;}focus(){this.focused=true;}showModal(){this.open=true;}close(){this.open=false;}fire(type,event={}){for(const fn of this.events[type]||[])fn(event);}}
  const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
  get('research-data').textContent=JSON.stringify(bundle);for(const[k,v]of Object.entries({'experiment-state':'all','experiment-order':'asc','family-filter':'all','status-filter':'all'}))get(k).value=v;
  const tabs=['overview','experiments','fabrication','lineage','timeline','lessons'].map(name=>{const t=get('tab-'+name);t.dataset.tab=name;return t;});
  const document={getElementById:get,querySelectorAll:()=>tabs,documentElement:{dataset:{}}};
  const location={hash:''},window={addEventListener(){}};
  const context=createContext({document,location,window,localStorage:{getItem(){throw Error('storage blocked');},setItem(){throw Error('storage blocked');}}});
  const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];new Script(script).runInContext(context);
  check(get('experiment-list').innerHTML.match(/<details>/g).length===39,'Render all experiments');
  get('experiment-state').value='gagal';get('experiment-state').fire('input');check(get('experiment-list').innerHTML.match(/<details>/g).length===6,'State filter');
  get('experiment-search').value='V16-JUJUR';get('experiment-search').fire('input');check(get('experiment-list').innerHTML.match(/<details>/g).length===1,'Combined search filter');
  get('experiment-search').value='unmatched-query';get('experiment-search').fire('input');check(get('experiment-list').innerHTML.includes('No records match'),'Empty experiment state');
  get('experiment-search').value='';get('experiment-state').value='all';get('experiment-order').value='desc';get('experiment-order').fire('input');check(get('experiment-list').innerHTML.indexOf('GERBANG-S1')<get('experiment-list').innerHTML.indexOf('V15'),'Descending dates');
  get('hide-thin').checked=true;get('hide-thin').fire('change');const thick=bundle.main.fabricationLadder.filter(r=>r.validRounds>3).length;check(get('ladder-chart').innerHTML.match(/class="ladder-row/g).length===thick,'Thin-evidence filter');
  get('family-filter').value='component';get('family-filter').fire('change');check(get('lineage-chart').innerHTML.match(/data-entry=/g).length===bundle.lineage.entries.filter(e=>e.family==='component').length,'Family filter');
  get('status-filter').value='served';get('status-filter').fire('change');check(get('lineage-chart').innerHTML.includes('No model records match'),'Empty lineage state');
  get('lineage-chart').fire('keydown',{target:{closest:()=>({dataset:{entry:'25'}})},key:'Enter',preventDefault(){}});check(get('model-dialog').open&&get('model-detail').innerHTML.includes('Measurements'),'Accessible model record and long fields');get('close-dialog').fire('click');check(!get('model-dialog').open,'Dialog close');
  tabs[0].fire('keydown',{key:'ArrowRight',preventDefault(){}});check(tabs[1].attrs['aria-selected']==='true'&&!get('experiments').hidden&&get('overview').hidden,'Keyboard tab navigation');
  get('theme').fire('click');check(document.documentElement.dataset.theme==='light','Theme toggle without storage');
  check(get('lessons').innerHTML.match(/class="lesson-number"/g).length===34,'All lesson cards');check(get('timeline').innerHTML.match(/<li>/g).length===12,'All timeline events');
}
exercise(html,bundle);exercise(fallback.html,fallback.bundle);
// Fail closed if publication filtering regresses, without printing source identifiers.
// The author's name is public on purpose; third-party people and provider companies must stay redacted.
const privatePattern=/\b(?:\u0050rabowo\s+\u0053ubianto|\u004aoko\s+\u0057idodo|\u0041nthropic|\u004fpenAI|\u0041libaba|\u004eVIDIA|\u0052unPod|\u0056ast(?:\.ai)?|\u004baggle|\u005a\.ai)\b/i;
check(!privatePattern.test(html),'Unredacted personal/provider identifier');check(!/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(html),'IP-like address');
console.log(`PASS ${checks} checks; strict XML, size, backgrounds, accessibility metadata, offline files, data counts, English build, Indonesian fallback and UI behavior.`);
