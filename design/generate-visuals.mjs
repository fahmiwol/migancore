import {mkdir,writeFile} from 'node:fs/promises';
import {loadPublicData} from './public-data.mjs';
import {palette as P,states,statusColors,definitions,field,wrap,text,paragraph,rect,line,svgDocument,verdictCode,dateKey,ladderBody,lineageBody,lineageLayout} from '../site/src/charts.mjs';
const {main:d,lineage,timeline,source}=await loadPublicData();
const directory=new URL('../docs/img/infographics/',import.meta.url);await mkdir(directory,{recursive:true});
const mono='class="mono"';
async function save(name,title,desc,height,body,ref,footer=''){await writeFile(new URL(name+'.svg',directory),svgDocument(title,desc,height,body,ref,footer));console.log(name+'.svg');}
let b='';
b+=paragraph(56,148,'A closed research project on small models, Indonesian, and the boundary of knowledge.',95);
const tiles=[[d.counts.lineageEntries,'model variants'],[d.counts.preRegistrations,'pre-registered experiments'],[d.counts.findings,'findings'],[d.counts.laws,'laws']];
tiles.forEach(([n,label],i)=>{const x=56+i*276;b+=rect(x,190,260,160);b+=text(x+22,259,n,51,P.text,mono);b+=text(x+22,313,label,16,P.muted);});
b+=rect(56,374,1088,88);b+=text(80,409,'10 pass  ·  6 fail  ·  16 neutral  ·  7 never run',20,P.text,mono);b+=text(80,438,'Every outcome stays in the record.',16,P.muted);
b+=rect(56,486,530,193);b+=text(80,526,'INSTRUMENTS, UNDER SCRUTINY',12,P.muted,'letter-spacing="1.6"');b+=text(80,580,'20 defect classes',32);b+=text(80,623,'19 guarded by automated checks',20,P.pass);
b+=rect(610,486,534,193);b+=text(634,526,'STATE AT CLOSURE',12,P.muted,'letter-spacing="1.6"');b+=text(634,563,d.servedModel.tag+' · served',24,P.pass,mono);b+=text(634,599,'Since '+d.servedModel.since,17,P.muted,mono);b+=text(634,637,'Closed 2026-09-28 · nothing deleted',17,P.muted);
b+=text(56,737,'Two layers that worked without any training',27);
[['Boundary paragraph','28.9 % → 8.9 %','Out-of-scope fabrication','Over-refusal 3.3 % · p95 latency 1.04 s'],['Abstention gate','52.2 % → 33.9 %','Fabrication; fact accuracy not reduced','Over-refusal 1.6 %']].forEach(([t,v,s,n],i)=>{const x=56+i*556;b+=rect(x,768,532,202);b+=line(x+24,768,x+508,768,P.pass,'stroke-width="2"');b+=text(x+24,810,t,21);b+=text(x+24,866,v,34,P.pass,mono);b+=text(x+24,910,s,17,P.muted);b+=text(x+24,943,n,14,P.muted);});
b+=text(56,1023,'MAKSARA · the planned successor',20,P.muted);b+=text(1144,1023,'NOT BORN',24,P.pending,'text-anchor="end"');
await save('01-at-a-glance','MiganCore at a glance (May–Sep 2026)','Research counts, closure status, and two measured interventions that required no training.',1140,b,source+' → counts, servedModel, birth; BRIEF.md → at-a-glance');

b='';definitions.forEach((s,i)=>b+=text(56,154+i*30,s,17,P.muted));b+=text(56,267,'Means over valid rounds · petak-jujur2 (36 questions) · n = valid rounds',16,P.muted);b+=text(56,295,'Lower fabrication is only better if over-refusal stays low. Thin evidence: n ≤ 3.',16,P.muted);b+=text(56,325,'Bars: fabrication · diamonds: over-refusal · green: MiganCore · F-271 corrects the Thinking label.',14,P.muted);b+=ladderBody(d.fabricationLadder,{start:402});
await save('02-fabrication-ladder','How often does each model make things up?','All 15 models, sorted by fabrication. Diamonds show over-refusal. Light rows have at most three valid rounds.',1700,b,source+' → fabricationLadder; BRIEF.md → metric definitions / F-271');

b=text(56,151,'A verdict is a decision under locked criteria, including a decision not to claim.',18,P.muted);
Object.entries(states).forEach(([key,[name,color]],i)=>{const x=56+i*275;b+=rect(x,180,10,10,P[color]);b+=text(x+22,190,`${d.counts.verdictStates[key]} ${name}`,16,P.muted);});
const experiments=[...d.preRegistrations].sort((a,c)=>dateKey(a).localeCompare(dateKey(c))||a.id.localeCompare(c.id));
experiments.forEach((e,i)=>{const x=56+(i%4)*276,y=231+Math.floor(i/4)*146,c=P[states[e.state][1]];b+=rect(x,y,260,130,P.panel,`stroke="${c}" stroke-opacity="0.45"`);b+=rect(x,y,4,130,c);b+=paragraph(x+15,y+27,e.id,25,14,P.text,19);b+=paragraph(x+15,y+74,verdictCode(e),27,12,c,16);b+=text(x+15,y+113,e.date||(typeof e.locked==='string'?e.locked.slice(0,10)+' · lock':'Undated'),11,P.muted,mono);});
b+=text(56,1736,'Date order; lock date used when no verdict date is given. Undated entries appear last.',15,P.muted);
await save('03-verdict-mosaic','39 pre-registered experiments and their verdicts','Tiles ordered by available date. Each tile shows its source verdict code and date.',1890,b,source+' → preRegistrations, counts.verdictStates','Neutral includes void instruments and experiments stopped before they were run.');

const summaries=[
'Honesty and contrast paths installed; the early promotion of 0.15-tool revoked after regression failure.',
'V16-JUJUR did not win; MO-GRPO adapters remained unmeasured and the RLVR merge lost its budget.',
'A canonical architecture and public instrument; a dedicated machine became the measurement authority.',
'GERBANG-JEBAKAN: A1 passed, A3 failed, A3b passed. The trap gate entered the serving path.',
'Retrieval failed; one prompt test had impossible criteria; its replacement did not win. H4-KAMUS accepted.',
'A3 completed; its base was later identified as Thinking, not Instruct. H-RAGU remained inconclusive.',
'The predecessor closed; the model lineage was reconstructed and Studio drew from canonical sources.',
'GERBANG-ON passed with fact accuracy preserved; C61 tied gate benefit to base fabrication.',
'The boundary paragraph reduced out-of-scope fabrication. The model failed the latency criterion.',
'The base fabricated less, but the anti-evasion guard failed: no honesty claim is made. SB1 kept the base.',
'Own-model generative training stopped. Gerbang-S1 became the remaining bet; D1 paused, H-ALUR stopped.',
'Gerbang-S1 stopped before lock under the probability rule. The project closed; nothing was deleted.'
];
b=text(56,152,'Decisions changed when evidence changed. The record preserves both.',18,P.muted);b+=line(248,215,248,2017,P.line,'stroke-width="2"');
timeline.events.forEach((e,i)=>{const y=224+i*159,last=i===timeline.events.length-1;if(last)b+=rect(276,y-29,868,144,P.panel,`stroke="${P.pending}"`);b+=`<circle cx="248" cy="${y}" r="${last?8:5}" fill="${last?P.pending:P.neutral}"/>`;b+=paragraph(56,y+5,e.date,20,14,P.muted,21);b+=paragraph(300,y+6,last?'Stopped before lock → project closed':e.title,62,22,last?P.pending:P.text,29);b+=paragraph(300,y+65,summaries[i],87,17,P.muted,25);});
await save('04-timeline','One month, 12 decisions (29 Aug – 28 Sep 2026)','Twelve dated decisions; the final decision stopped the remaining experiment before lock.',2210,b,'timeline.en.json → events');

b=text(56,151,'A research system whose verdicts return to the same source as its hypotheses.',18,P.muted);
const layers=[
['LENS','MiganCore Studio','2D and 3D worlds over one data snapshot, generated from a registry of canonical sources. Facts older than 7 days are marked stale.'],
['PRE-REGISTRATION LOOP','Lock the decision before the data','Hypothesis with two ways to be wrong → thresholds checked for win-ability → probabilistic forecasts → git lock → adversarial review (amendments may only tighten) → run on the measurement machine → verdict tool reads the thresholds from the file → verdict written back into the same file.'],
['MEASUREMENT','Measure the model and the instrument','petak-jujur2 (36 questions), petak-40, A3 anchor. At least 5 rounds; 95 % CIs; paired fabrication, over-refusal and fact accuracy. Models pinned by fingerprint, not tag name. Mutation-tested verdict tools and automated guards.'],
['PATH LAYER','What worked without training','Abstention gate (probe / NLI entailment), boundary paragraph in the persona, retrieval per intent, routing. Planned but stopped: Gerbang-S1, a small decision encoder in front of any LLM.'],
['SERVING','Sovereign inference','Ollama on CPU and an MCP server (ask / compare / status). No routing to external models while serving.'],
['TRAINING','Adapters, merges, model artifacts','LoRA SFT / DPO and TIES merges on rented GPUs → GGUF (Q4) → Ollama tags. From 18 Sep every training row carries its teacher of origin.'],
['BASE WEIGHTS','Qwen3-4B-Instruct-2507','Apache-2.0. Earlier: a Qwen2.5-7B line and Qwen3-8B experiments.']
];
let ly=200;const heights=[175,285,240,225,170,200,150];
layers.forEach(([label,title,body],i)=>{const h=heights[i];b+=rect(264,ly,672,h);b+=text(288,ly+31,label,12,i===3?P.pass:P.muted,'letter-spacing="1.5"');b+=text(288,ly+67,title,24);b+=paragraph(288,ly+101,body,66,17,P.muted,25);if(i<layers.length-1){b+=line(600,ly+h,600,ly+h+24,P.pass);b+=`<path d="M595 ${ly+h+18} l5 6 l5 -6" fill="none" stroke="${P.pass}"/>`;}ly+=h+24;});
b+=rect(56,200,184,ly-224);b+=text(76,237,'POLICY',14,P.neutral,'letter-spacing="2"');b+=paragraph(76,278,'Teacher policy',16,20,P.text,27);b+=paragraph(76,354,'From 18 Sep: only teachers whose terms allow distillation (e.g. DeepSeek) or permissive open models. Outputs of services whose terms forbid it are never training data.',16,16,P.muted,25);b+=line(76,654,220,654);b+=paragraph(76,699,'Data never leaves. Teachers offline only.',16,17,P.text,27);
b+=rect(960,200,184,ly-224);b+=text(980,237,'MACHINES',14,P.neutral,'letter-spacing="2"');b+=paragraph(980,290,'Laptop',15,20,P.text);b+=paragraph(980,327,'Work and canonical repo',15,16,P.muted,25);b+=paragraph(980,475,'Measurement machine',15,20,P.text,28);b+=paragraph(980,550,'CPU Ollama and model store',15,16,P.muted,25);b+=text(980,700,'VPS',20);b+=paragraph(980,738,'Live serving',15,16,P.muted,25);
await save('05-architecture','How MiganCore was built','Seven layers, with policy and machines as side rails. Planned and stopped work is labeled explicitly.',ly+110,b,'BRIEF.md → architecture');

b=text(56,150,'Time runs left to right by period. Rows within a period are ordered by the available source date.',16,P.muted);b+=text(56,177,'Approximate dates remain approximate; no ancestry is implied. Hollow rings: never born.',16,P.muted);
Object.entries(statusColors).forEach(([s,c],i)=>{const x=56+(i%5)*221,y=216+Math.floor(i/5)*27;b+=`<circle cx="${x+4}" cy="${y-5}" r="4" fill="${s==='never-born'?'none':c}" stroke="${c}"/>`;b+=text(x+15,y,s,13,P.muted);});b+=lineageBody(lineage);
await save('06-lineage','41 variants, one served model','All model variants grouped by family and source period. Components share the served model’s August period. 0.14k is a served alias.',lineageLayout(lineage.entries).height,b,'lineage.en.json → entries, families, statuses');

b=text(56,151,'Successes and failures are evidence under their stated conditions.',18,P.muted);b+=text(56,215,'What held (measured)',27,P.pass);b+=text(620,215,'What did not hold (measured)',27,P.fail);
const held=[['Boundary paragraph','28.9 → 8.9 %','Out-of-scope fabrication; p95 latency 1.04 s. Over-refusal 3.3 %.'],['Abstention gate','52.2 → 33.9 %','Fabrication; over-refusal 1.6 %. Fact accuracy not reduced.'],['Law C61','r = +0.942','The gate helps in proportion to base fabrication.'],['Pre-registration discipline','39 experiments','Locked before data: the research method, including its recorded exceptions.'],['Instrument self-audit','20 found · 19 guarded','Defect classes found in our own instruments; automated guards for 19.']];
const refuted=[['Training to be more honest','60.0 % vs ≤ 50 %','V16-JUJUR did not meet its win threshold.'],['Hesitation as a knowledge signal','H-RAGU · inconclusive','Hesitation was not established as a knowledge signal.',P.neutral],['Latency for game characters','p95 6.73 s','E1 failed its model latency criterion.'],['Fine-tune versus base','A3I-ULANG','on A3I-ULANG 0.14 fabricated 53.7 % vs 14.7 % for the base, but the anti-evasion guard failed, so no honesty claim is made.',P.neutral],['The final bet','P(win) ≈ 0.20–0.35','Gerbang-S1 stopped before lock, below the owner’s 0.80 rule.',P.neutral]];
for(const[arr,x,color]of [[held,56,P.pass],[refuted,620,P.fail]])arr.forEach(([title,value,body,tone=color],i)=>{const y=248+i*229;b+=rect(x,y,524,207);b+=line(x+24,y,x+500,y,tone,'stroke-width="2"');b+=text(x+24,y+37,title,20);b+=text(x+24,y+85,value,28,tone,mono);b+=paragraph(x+24,y+121,body,51,17,P.muted,25);});
await save('07-held-vs-refuted','What held. What did not hold.','Measured outcomes side by side. The failed anti-evasion guard prevents an honesty claim.',1540,b,'BRIEF.md → held-vs-refuted; '+source+' → counts, preRegistrations','The register includes unlocked and never-run entries; 39 is the register total.');

b=text(56,151,'Decide what evidence would matter before seeing the result.',18,P.muted);
const steps=[['Hypothesis','Two ways to be wrong'],['Thresholds','Win-ability check'],['Forecasts','Probabilistic'],['Git lock','Before the run'],['Adversarial review','Stricter only'],['Run','≥ 5 rounds; paired metrics'],['Verdict tool','Read locked thresholds'],['Verdict written back','Into the same file'],['Studio regenerates','From canonical sources'],['Finding / law / skill','Feed the next question']];
const cx=600,cy=800,rx=450,ry=510;
steps.forEach(([title,sub],i)=>{const a=-Math.PI/2+i*2*Math.PI/steps.length,n=-Math.PI/2+(i+1)*2*Math.PI/steps.length;const x=cx+rx*Math.cos(a),y=cy+ry*Math.sin(a),nx=cx+rx*Math.cos(n),ny=cy+ry*Math.sin(n);const dx=nx-x,dy=ny-y,t=Math.min(116/Math.abs(dx),47/Math.abs(dy));const sx=x+dx*t,sy=y+dy*t,ex=nx-dx*t,ey=ny-dy*t;const mid=(a+n)/2;b+=`<path d="M${sx} ${sy} Q${(sx+ex)/2+18*Math.cos(mid)} ${(sy+ey)/2+18*Math.sin(mid)} ${ex} ${ey}" fill="none" stroke="${P.muted}" stroke-width="2" marker-end="url(#arrow)"/>`;b+=rect(x-110,y-41,220,82,P.panel);b+=text(x,y-9,title,18,P.text,'text-anchor="middle"');b+=text(x,y+23,sub,13,P.muted,'text-anchor="middle"');});
b='<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="'+P.pass+'"/></marker></defs>'+b;
b+=text(600,759,'Ask what would change',27,P.text,'text-anchor="middle"');b+=text(600,800,'your decision,',27,P.text,'text-anchor="middle"');b+=text(600,849,'then lock it.',31,P.pass,'text-anchor="middle"');
await save('08-preregistration-loop','The pre-registration loop','A clockwise ten-step cycle. Hypotheses and criteria are locked before a run; verdicts return to the canonical source.',1510,b,'BRIEF.md → preregistration-loop');

b=text(56,151,'The measurement system was itself a research subject.',18,P.muted);
const failures=[['C22 / DENOMINATOR','16/14 = 114 %','A ratio inflated every historical rate.','A valid-looking percentage can still have the wrong denominator.'],['F-219 / VERDICT GATE','p = 1.0000','PASS and ROLLBACK for statistically identical models.','A gate gave opposing verdicts to two indistinguishable models.'],['C56 / TIMEOUT','300 seconds','Eleven “model” diagnoses were really a client timeout.','The HTTP client ended the request before the model could finish.'],['HEALTH BADGE / TARGET','The wrong machine','A health badge checked the wrong machine for months.','The indicator was measuring a different machine from the one it described.']];
failures.forEach(([label,value,title,body],i)=>{const x=56+(i%2)*556,y=213+Math.floor(i/2)*342;b+=rect(x,y,532,310);b+=text(x+26,y+39,label,12,P.fail,'letter-spacing="1"');b+=text(x+26,y+104,value,35,P.text,mono);b+=paragraph(x+26,y+157,title,40,22,P.text,30);b+=paragraph(x+26,y+247,body,50,16,P.muted,24);});
await save('09-instruments-failed-first','Our own instruments failed before the models did','Four instrument failures: denominator, verdict gate, client timeout, and health-check target.',1050,b,'BRIEF.md → instruments-failed-first','Rule: check the instrument before the model.');
