/* Numeric checks using the same Molang parser bundled with Blockbench. */
const fs=require('fs');const path=require('path');
const root=path.resolve(__dirname,'..');
const modulePath=process.env.IBURI_MOLANG_MODULE||'/workspace/work/bb_app/blockbench-4.12.6/lib/molang.umd.js';
const Molang=require(modulePath);const m=new Molang();let count=0;
const load=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const rc=load(path.join(root,'Integracao/RP/render_controllers/swbr_iburi_transformacoes.json')).render_controllers;
const check=(v,label)=>{if(!v)throw Error(label);count++};
const parse=(e,t)=>typeof e==='number'?e:m.parse(e,{'query.life_time':t});
const stages=[];
for(const stage of [1,2,3]){
 const animations=load(path.join(root,`Integracao/RP/animations/nz_modo_iburi${stage}.idle.json`)).animations;
 const a=animations[`animation.nz_modo_iburi${stage}.idle`];
 const geometryNames={1:'nz_modo_iburi1.json',2:'nz_modo_iburi2.json',3:'nz_modo_iburi3l.geo.json'};
 const geometry=load(path.join(root,'Integracao/RP/models/entity',geometryNames[stage]))['minecraft:geometry'][0];
 const bones=Object.fromEntries(geometry.bones.map(b=>[b.name,b]));
 let minY=Infinity,maxY=-Infinity,rangeMin=1,rangeMax=0;
 for(let sample=0;sample<121;sample++){
  const t=sample*a.animation_length/30;
  for(let phase=0;phase<6;phase++){
   const value=parse(rc[`controller.render.swbr.iburi${stage}.p${phase}`].color.a,t);
   const cycle=(t/a.animation_length+Number((phase/6).toFixed(6)))%1;
   const expected=Math.min(Math.max(0,Math.min(1,cycle/.17)),Math.max(0,Math.min(1,(1-cycle)/.43)));
   check(Number.isFinite(value)&&value>=0&&value<=1&&Math.abs(expected-value)<1e-8,'Envelope de alfa inválido');
   rangeMin=Math.min(rangeMin,value);rangeMax=Math.max(rangeMax,value);
  }
  for(const [name,channels] of Object.entries(a.bones)){
   const position=channels.position.map(v=>parse(v,t));const scale=channels.scale.map(v=>parse(v,t));const rotation=channels.rotation.map(v=>parse(v,t));
   check([...position,...scale,...rotation].every(Number.isFinite),'Expressão não finita: '+name);
   check(scale.every(s=>s>.7&&s<1.4),'Expansão fora dos limites');
   const radius=Math.max(...bones[name].cubes.map(c=>Math.hypot(c.size[0]/2,c.size[1]/2,.5)))*Math.max(...scale)+.5;
   const p=bones[name].pivot.map((v,i)=>v+position[i]);
   check(Math.abs(p[0])+radius<32&&Math.abs(p[2])+radius<32&&p[1]+radius<52&&p[1]-radius>-20,'Nuvem ultrapassa os limites visíveis');
   minY=Math.min(minY,p[1]-radius);maxY=Math.max(maxY,p[1]+radius);
  }
 }
 check(rangeMin<.001&&rangeMax>.99,'Fumaça não percorre desaparecimento e recomposição');
 stages.push({stage,ciclos_amostrados:4,amostras:121,alfa_min:rangeMin,alfa_max:rangeMax,limite_y_conservador:[minY,maxY]});
}
const scripts=load(path.join(root,'Integracao/RP/entity/player.entity.json'))['minecraft:client_entity'].description.scripts.pre_animation.slice(-3).join('');
for(const item of ['nz:modo_iburi1','nz:modo_iburi2','nz:modo_iburi3','nz:modo_outro']){
 for(const initial of [0,1]){
  const value=m.parse(scripts+'return v.swbr_v18733_full_body;',{
   'query.is_item_name_any':(slot,index,...ids)=>ids.includes(item)?1:0,
   'variable.swbr_v18733_full_body':initial,'variable.swbr_v18733_hair':initial
  });
  check(value===(item==='nz:modo_iburi3'?1:initial),'Ocultação afetou um modo diferente');
 }
}
const report={resultado:'APROVADO',parser:'Molang do Blockbench 4.12.6',avaliacoes:count,stages,controle_visual:'Somente modo 3 ativa a ocultação; os demais preservam o valor original.'};
fs.writeFileSync(path.join(root,'Validacao_Molang.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
