export const NS = 'http://www.w3.org/2000/svg';
export const palette = {bg:'#050d0a',panel:'#0d1f1a',text:'#edf7f2',muted:'#a8bbb2',faint:'#71877d',pass:'#2fe39a',fail:'#ff8f85',neutral:'#d9bd59',pending:'#b58aff',cyan:'#4fc3cf',line:'#47d69933'};
export const states = {lulus:['Pass','pass'],gagal:['Fail','fail'],netral:['Neutral','neutral'],belum:['Not run / not judged','pending']};
export const statusColors = {'served':palette.pass,'former-default':'#7ef0bd','superseded':palette.muted,'rolled-back':palette.fail,'not-promoted':palette.fail,'component':palette.cyan,'never-born':palette.pending,'not-judged':palette.pending,'archived':palette.neutral};
export const definitions = [
  'Fabrication rate: the share of must-abstain questions on which the model asserted made-up content.',
  'Over-refusal: the share of answerable, factual questions the model declined to answer.',
  'Fact accuracy: the share of factual questions answered correctly.'
];
export const esc = x => String(x ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export const field = (x,k) => x[k] ?? x[k+'_id'] ?? '';
export function modelName(name) {
  return name.replace(/^qwen3:4b(?= ·)/,'qwen3:4b (Thinking-2507)')
    .replace(/^codex:bawaan-config/,'codex (default config)')
    .replace(/^(kimi|\u006fpenai):/,'')
    .replace(/\+ ?(?:sistem gerbang|gate system) retrieval/,'+ gate system + retrieval')
    .replace(/\+ ?sistem gerbang/,'+ gate system')
    .replace(/\bpolos\b/,'plain');
}
export function wrap(value, max=70) {
  const out=[]; let line='';
  for(const word of String(value).split(/\s+/)) { if(line && (line+' '+word).length>max){out.push(line);line=word;}else line+=(line?' ':'')+word; }
  if(line)out.push(line); return out;
}
export function text(x,y,value,size=18,color=palette.text,extra='') {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" ${extra}>${esc(value)}</text>`;
}
export function paragraph(x,y,value,max=75,size=18,color=palette.muted,leading=27) {
  return wrap(value,max).map((s,i)=>text(x,y+i*leading,s,size,color)).join('');
}
export function rect(x,y,w,h,fill=palette.panel,extra='') {return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${fill}" ${extra}/>`;}
export function line(x1,y1,x2,y2,color=palette.line,extra=''){return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" ${extra}/>`;}
export function svgDocument(title,desc,height,body,source,footer='') {
  return `<svg xmlns="${NS}" width="1200" height="${height}" viewBox="0 0 1200 ${height}" role="img" aria-labelledby="title desc"><title id="title">${esc(title)}</title><desc id="desc">${esc(desc)}</desc><style>text{font-family:Inter,"Segoe UI",system-ui,-apple-system,sans-serif} .mono{font-family:"JetBrains Mono",ui-monospace,Consolas,monospace}</style><rect x="0" y="0" width="1200" height="${height}" fill="${palette.bg}"/>${text(56,49,'MIGANCORE / OPEN LAB NOTEBOOK',13,palette.pass,'letter-spacing="2"')}${text(56,104,title,34)}${body}${line(56,height-72,1144,height-72)}${footer?text(56,height-93,footer,16,palette.text):''}${text(56,height-38,'MiganCore open release · source: '+source,12,palette.muted)}</svg>`;
}
export function verdictCode(row) {
  const v=field(row,'verdict');
  // Kode vonis ditampilkan dalam bahasa Inggris: glos di dalam kurung sesudah kode pertama (data EN), kalau ada.
  const glos=v.match(/^[A-Z][A-Z_0-9]*(?: [A-Z][A-Z_0-9]*)*\s*\(([A-Z][A-Z_0-9' ]*[A-Z])/);
  if(glos) return glos[1].trim();
  return v.match(/^[A-Z][A-Z_0-9]*(?: [A-Z][A-Z_0-9]*)*/)?.[0].trim() || states[row.state][0];
}
export function dateKey(row) {return row.date || (typeof row.locked==='string'?row.locked.slice(0,10):'9999');}
export function ladderBody(rows,{start=370,interactive=false}={}) {
  const x=570,w=360,step=80,sorted=[...rows].sort((a,b)=>a.fabricationPct-b.fabricationPct);
  let out=text(x,start-40,'FABRICATION % / OVER-REFUSAL %',12,palette.muted);
  for(const tick of [0,20,40,60]) {const tx=x+w*tick/60;out+=line(tx,start-16,tx,start+sorted.length*step-16);out+=text(tx,start-18,tick,12,palette.muted,'text-anchor="middle" class="mono"');}
  sorted.forEach((r,i)=>{
    const y=start+i*step,thin=r.validRounds<=3,ours=r.model.startsWith('migancore:'),name=modelName(r.model);
    const label=`${name}; Fabrication rate ${r.fabricationPct}%; Over-refusal ${r.overRefusalPct}%; Fact accuracy ${r.factAccuracy}; n=${r.validRounds}${thin?'; thin evidence':''}`;
    out+=`<g class="ladder-row${thin?' thin':''}" ${interactive?`tabindex="0" role="img" aria-label="${esc(label)}"`:''}><title>${esc(label)}</title>`;
    if(ours)out+=rect(46,y-7,1108,70,palette.panel);
    out+=text(60,y+18,name.split(' · ')[0],17,thin?palette.muted:palette.text,'class="mono"');
    out+=text(60,y+43,(name.split(' · ')[1]||'plain')+(thin?' · thin evidence':''),14,palette.muted);
    const barWidth=w*r.fabricationPct/60,dx=x+w*r.overRefusalPct/60;
    out+=rect(x,y+6,barWidth,17,ours?palette.pass:palette.muted,`opacity="${thin?0.4:0.85}"`);
    out+=`<path d="M ${dx} ${y+30} l 5 6 l -5 6 l -5 -6 Z" fill="${palette.neutral}"/>`;
    out+=text(x+barWidth+8,y+20,r.fabricationPct+'%',14,palette.text,'class="mono"');
    out+=text(1138,y+18,`fact acc ${r.factAccuracy} · n=${r.validRounds}`,14,palette.muted,'text-anchor="end" class="mono"');
    out+=text(1138,y+43,`over-refusal ${r.overRefusalPct}%`,13,palette.muted,'text-anchor="end" class="mono"');
    out+='</g>';
  });
  return out;
}
// Period bins preserve source precision; position within a bin is not a date estimate.
export function period(entry) {
  const s=entry.date;
  if(/early 2026/.test(s))return 0;
  if(/never produced|not recorded/.test(s))return 6;
  if(/May/.test(s))return 1;
  if(/June|-06-/.test(s))return 2;
  if(/-07-/.test(s))return 3;
  if(/-08-/.test(s))return 4;
  if(/-09-/.test(s))return 5;
  return 6;
}
export const periods=['Early 2026','May','June','July','August','September','Undated'];
export function lineageLayout(entries) {
  const order=['small','qwen25-7b','qwen3-4b','component','qwen3-8b'];let top=315;const lanes=[];
  for(const family of order){
    const members=entries.filter(e=>e.family===family).sort((a,b)=>period(a)-period(b)||(a.date.match(/2026-\d\d-\d\d/)?.[0]||'').localeCompare(b.date.match(/2026-\d\d-\d\d/)?.[0]||''));
    if(!members.length)continue;
    const slots=Array(7).fill(0),nodes=[];
    for(const e of members){const p=period(e),row=slots[p]++;nodes.push({entry:e,x:62+p*155,y:top+88+row*112});}
    const h=110+Math.max(...slots)*112;lanes.push({family,top,height:h,nodes});top+=h+16;
  }
  return {lanes,height:top+106};
}
export function lineageBody(lineage,{interactive=false}={}) {
  const layout=lineageLayout(lineage.entries);let out='';
  periods.forEach((p,i)=>out+=text(62+i*155,290,p,14,palette.muted));
  for(const lane of layout.lanes){
    out+=rect(46,lane.top,1108,lane.height,palette.panel);
    out+=text(62,lane.top+31,lineage.families[lane.family],17,palette.text);
    for(const node of lane.nodes){const{entry:e,x,y}=node,c=statusColors[e.status];
      out+=`<g ${interactive?`tabindex="0" role="button" data-entry="${esc(e.no)}" aria-label="${esc(e.name+', '+e.status+', '+e.date)}"`:''}><title>${esc(e.name+' · '+e.status+' · '+e.date)}</title>`;
      if(e.name==='migancore:0.14')out+=rect(x-9,y-17,150,103,'#17372b',`stroke="${palette.pass}"`);
      out+=`<circle cx="${x+5}" cy="${y}" r="6" fill="${e.status==='never-born'?'none':c}" stroke="${c}" stroke-width="2"/>`;
      out+=text(x+19,y+4,e.status,10,c);
      // Wrap at separators, then hard-wrap long model identifiers without shortening them.
      const parts=e.name.match(/.{1,19}(?:\s|$)|.{1,19}/g)||[e.name];
      parts.forEach((s,i)=>out+=text(x,y+25+i*14,s.trim(),11,e.name==='migancore:0.14'?palette.pass:palette.text,'class="mono"'));
      out+='</g>';
    }
  }
  return out;
}
