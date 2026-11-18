/* Numeric regression checks on actual Aburame player programs and geometry.
 * Uses Blockbench's Molang parser. This does not execute Minecraft.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),rp=path.join(root,'Integracao/RP');
if(!process.env.ABURAME_MOLANG_MODULE)throw Error('Defina ABURAME_MOLANG_MODULE para lib/molang.umd.js do Blockbench 4.12.6.');
const Molang=require(process.env.ABURAME_MOLANG_MODULE);
const parser=new Molang();let count=0;
const read=p=>JSON.parse(fs.readFileSync(path.join(rp,p),'utf8'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(rp,p))).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'Integracao_Manifesto.json'))),modes=manifest.modes;
const check=(v,label)=>{if(!v)throw Error(label);count++};
const value=(expr,data)=>typeof expr==='number'?expr:parser.parse(expr,data);
const player=read('entity/player.entity.json')['minecraft:client_entity'].description;
const rc=read('render_controllers/swbr_aburame.json').render_controllers;
const controller=read('animation_controllers/swbr_aburame.json').animation_controllers[player.animations.swbr_aburame_fx];
const gates=Object.fromEntries(player.render_controllers.filter(c=>typeof c==='object').flatMap(c=>Object.entries(c)).filter(([id])=>id.startsWith('controller.render.swbr.aburame')));
const native=player.scripts.pre_animation.filter(s=>['v.swbr39_ui =','v.swbr_view_first_person =','v.swbr_view_map_face ='].some(p=>s.startsWith(p)));
check(native.length===3,'Indicadores nativos da câmera ausentes');
const program=native.concat(player.scripts.pre_animation.filter(s=>s.startsWith('v.swbr_aburame_'))).join('');
const evaluate=(expr,data)=>parser.parse(program+`return ${expr};`,data);
const cases=[{name:'terceira_pessoa',distance:4},{name:'primeira_pessoa_item_contexto_zero',first:1,distance:1.62},
 {name:'primeira_pessoa_câmera_afastada',first:1,distance:4},{name:'parede',distance:1.5},{name:'distância_ausente',distance:0},
 {name:'sobre_cabeça',distance:2.0},{name:'limite',distance:2.8},{name:'início_fade',distance:2.85},{name:'meio_fade',distance:2.9},{name:'fade_completo',distance:3.0},
 {name:'inventário',ui:1,distance:4},{name:'paperdoll',paper:1,distance:4},{name:'mapa',map:1,distance:4},{name:'espectador',spectator:1,distance:4}];
const camera=[];
for(const test of cases)for(const head of [...Object.values(modes).map(s=>s.id),'nenhum'])for(const contextFirst of [0,1]){
 const spec=Object.entries(modes).find(([i,s])=>s.id===head),mode=spec?Number(spec[0]):0;
 const allowed=Boolean(mode&&!test.first&&!test.ui&&!test.paper&&!test.map&&!test.spectator&&test.distance>2.8);
 const data={'variable.is_first_person':test.first||0,'variable.is_paperdoll':test.paper||0,'variable.map_face_icon':test.map||0,
  'query.is_in_ui':test.ui||0,'query.is_spectator':test.spectator||0,'query.distance_from_camera':test.distance,'context.is_first_person':contextFirst,
  'query.is_item_name_any':(slot,index,...ids)=>slot==='slot.armor.head'&&ids.includes(head)?1:0};
 let passes=0;
 for(const [id,gate] of Object.entries(gates)){
  const belongs=id.startsWith(`controller.render.swbr.aburame${mode}.`),active=Boolean(evaluate(gate,data));
  check(active===(allowed&&belongs),'Geometria indevida em '+test.name+'/'+head);passes+=Number(active);
 }
 check(passes===(allowed?manifest.modelos_novos[String(mode)].passes:0),'Número incorreto de camadas ativas');
 for(let i=1;i<=6;i++){
  check(Boolean(evaluate(controller.states.default.transitions[i-1][`modo${i}`],data))===(allowed&&mode===i),'Emissor ativado no item ou na câmera incorretos');
  check(Boolean(evaluate(controller.states[`modo${i}`].transitions[0].default,data))===!(allowed&&mode===i),'Emissor não encerra após troca/desequipamento');
 }
 camera.push({caso:test.name,modo:mode,contexto_item_primeira_pessoa:contextFirst,passes});
}

// Model-space affine transforms: each bone's bind rotation plus its own
// additive animation, then its parent. No fictitious walking poses are used.
const identity=[1,0,0,0,1,0,0,0,1];
const mul=(a,b)=>Array.from({length:9},(_,n)=>{const i=Math.floor(n/3),j=n%3;return a[i*3]*b[j]+a[i*3+1]*b[j+3]+a[i*3+2]*b[j+6]});
const mv=(a,v)=>[0,1,2].map(i=>a[i*3]*v[0]+a[i*3+1]*v[1]+a[i*3+2]*v[2]);
const plus=(a,b)=>a.map((v,i)=>v+b[i]);
function rotation(angles){
 const [x,y,z]=angles.map(v=>v*Math.PI/180),cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);
 return mul(mul([cz,-sz,0,sz,cz,0,0,0,1],[cy,0,sy,0,1,0,-sy,0,cy]),[1,0,0,0,cx,-sx,0,sx,cx]);
}
function transformGeometry(geometry,animation,time){
 const bones=Object.fromEntries(geometry.bones.map(b=>[b.name,b])),cache={};let furthest=0,minY=Infinity,maxY=-Infinity;
 const data={'query.life_time':time};
 function matrix(name){
  if(cache[name])return cache[name];const b=bones[name],a=animation.bones[name]||{};
  const p=(a.position||[0,0,0]).map(e=>value(e,data)),s=(a.scale||[1,1,1]).map(e=>value(e,data)),r=(a.rotation||[0,0,0]).map((e,i)=>value(e,data)+(b.rotation||[0,0,0])[i]);
  check([...p,...s,...r].every(Number.isFinite),'Transformação não finita: '+name);
  check(s.every(v=>v>.7&&v<1.3),'Escala pode criar um inseto gigante: '+name);
  let m=rotation(r).map((v,i)=>v*s[i%3]);const pivot=b.pivot||[0,0,0];let t=plus(plus(pivot,p),mv(m,pivot).map(v=>-v));
  if(b.parent){const parent=matrix(b.parent);t=plus(mv(parent.m,t),parent.t);m=mul(parent.m,m);}
  return cache[name]={m,t};
 }
 for(const b of geometry.bones){
  const m=matrix(b.name);
  for(const c of b.cubes||[]){
   const cr=rotation(c.rotation||[0,0,0]),cp=c.pivot||[0,0,0];
   for(let mask=0;mask<8;mask++){
    let point=c.origin.map((v,i)=>v+((mask>>i)&1)*c.size[i]);point=plus(mv(cr,point.map((v,i)=>v-cp[i])),cp);point=plus(mv(m.m,point),m.t);
    check(point.every(Number.isFinite),'Vértice não finito');furthest=Math.max(furthest,Math.hypot(...point));minY=Math.min(minY,point[1]);maxY=Math.max(maxY,point[1]);
   }
  }
 }
 return {furthest,minY,maxY};
}
const nativeRig=read('models/entity/swbr39/custom.geo.json')['minecraft:geometry'][0].bones;
const locators=Object.assign({},...nativeRig.map(b=>b.locators||{}));
const boxes=nativeRig.flatMap(b=>b.cubes||[]).map(c=>({min:c.origin.map(v=>v-(c.inflate||0)-.31),max:c.origin.map((v,i)=>v+c.size[i]+(c.inflate||0)+.31)}));
const files=['entity/player.entity.json','render_controllers/swbr_aburame.json','animation_controllers/swbr_aburame.json','models/entity/swbr_aburame_draw.geo.json','models/entity/swbr39/custom.geo.json'];
const results=[];
for(const [key,spec] of Object.entries(modes)){
 const mode=Number(key),animPath=`animations/swbr_aburame_${mode}.json`,particlePath=`particles/swbr_aburame_${mode}.json`;
 files.push(spec.path,animPath,particlePath);
 const geometry=read(spec.path)['minecraft:geometry'][0],animation=read(animPath).animations[`animation.swbr.aburame${mode}.idle`];
 let radius=0,minY=Infinity,maxY=-Infinity;
 for(let sample=0;sample<=90;sample++){
  const time=sample*animation.animation_length/22.5,result=transformGeometry(geometry,animation,time);
  radius=Math.max(radius,result.furthest/16);minY=Math.min(minY,result.minY);maxY=Math.max(maxY,result.maxY);
  for(const [id,entry] of Object.entries(rc)){
   if(!id.startsWith(`controller.render.swbr.aburame${mode}.`))continue;
   const alpha=value(entry.color.a,{'query.life_time':time,'variable.swbr_aburame_fade':1});check(Number.isFinite(alpha)&&alpha>=0&&alpha<=1,'Alfa de camada fora da faixa');
  }
 }
 check(radius<2.8,'Modelo invade o limite de proteção da câmera: '+mode+' '+radius);
 check(minY>-20&&maxY<52,'Volume excede a caixa de visibilidade');
 const p=read(particlePath).particle_effect.components;let sizeMax=0;
 for(const life of [0,.001,.18,.35,.45])for(const age of [-.1,0,.001,.1,.3,.6]){
  const data={'variable.particle_age':age,'variable.particle_lifetime':life};
  for(const expr of p['minecraft:particle_appearance_billboard'].size){const v=value(expr,data);check(Number.isFinite(v)&&v>=0&&v<=.05,'Partícula grande ou não finita');sizeMax=Math.max(sizeMax,v);}
  const a=value(p['minecraft:particle_appearance_tinting'].color[3],data);check(Number.isFinite(a)&&a>=0&&a<=1,'Alfa de partícula inválido');
 }
 let emitterRadius=0;
 for(const event of controller.states[`modo${mode}`].particle_effects){
  const point=locators[event.locator];check(Boolean(point),'Locator não encontrado');
  check(!boxes.some(box=>point.every((v,i)=>v>=box.min[i]&&v<=box.max[i])),'Emissor fica dentro da pele/revestimento');
  emitterRadius=Math.max(emitterRadius,Math.hypot(...point)/16+.035+Math.SQRT2*sizeMax+.035*.45+.5*.03*.45*.45);
 }
 check(emitterRadius<2.8,'Partículas podem atingir a câmera antes do corte');
 const uv=p['minecraft:particle_appearance_billboard'].uv,f=uv.flipbook;
 check(f.base_UV[1]+f.max_frame*f.step_UV[1]+f.size_UV[1]<=uv.texture_height,'Flipbook sai da textura');
 results.push({mode,amostras:91,ciclos:4,raio_modelo_metros:radius,limite_y_modelo:[minY,maxY],meio_tamanho_max_particula_metros:sizeMax,raio_emissores_metros:emitterRadius});
}

// Exercise the actual transition list, including the one-frame default state
// between different modes. Effects belong only to the currently active state.
const sequence=[1,3,5,0,2,4,6,0,1],swaps=[];let state='default';
for(const target of sequence){
 for(let frame=0;frame<2;frame++){
  const transition=controller.states[state].transitions.find(row=>Object.values(row).some(expr=>Boolean(parser.parse(expr,Object.fromEntries([1,2,3,4,5,6].map(i=>['variable.swbr_aburame_draw'+i,Number(i===target)]))))));
  if(transition)state=Object.keys(transition)[0];
 }
 check(state===(target?'modo'+target:'default'),'Troca de modo não encerra/inicia o estado esperado');swaps.push({target,state});
}
const fontes_sha256=Object.fromEntries(files.map(file=>[file,sha(file)]));
const report={resultado:'APROVADO',minecraft_executado:false,parser:'Molang do Blockbench 4.12.6',avaliacoes:count,camera,modelos:results,trocas:swaps,fontes_sha256,
 limites:'Transformações dos efeitos sobre o rig em pose base, projeções numéricas e condições de estado. Não é teste do renderizador, de multiplayer ou do desempenho no Minecraft.'};
fs.writeFileSync(path.join(root,'Validacao_Molang.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({resultado:report.resultado,avaliacoes:count,cenarios_camera:camera.length,modelos:results}));
