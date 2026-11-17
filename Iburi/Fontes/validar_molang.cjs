/* Evaluate the actual player camera program, render gates and particle bounds.
 * This is a regression test using Blockbench's parser, not a Minecraft test.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),rp=path.join(root,'Integracao/RP');
const Molang=require(process.env.IBURI_MOLANG_MODULE||'/workspace/work/bb_app/blockbench-4.12.6/lib/molang.umd.js');
const parser=new Molang();let count=0;
const read=file=>JSON.parse(fs.readFileSync(path.join(rp,file),'utf8'));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(rp,file))).digest('hex');
const check=(condition,label)=>{if(!condition)throw Error(label);count++};
const player=read('entity/player.entity.json')['minecraft:client_entity'].description;
const rc=read('render_controllers/swbr_iburi_transformacoes.json').render_controllers;
const fx=read('animation_controllers/swbr_iburi_fumaca.json').animation_controllers[player.animations.swbr_iburi_fx];
const pre=player.scripts.pre_animation;
const native=pre.filter(s=>['v.swbr39_ui =','v.swbr_view_first_person =','v.swbr_view_map_face ='].some(prefix=>s.startsWith(prefix)));
check(native.length===3,'Indicadores de câmera nativos não encontrados');
const program=native.concat(pre.filter(s=>s.startsWith('v.swbr_iburi_'))).join('');
const playerGates=Object.fromEntries(player.render_controllers.filter(c=>typeof c==='object').flatMap(c=>Object.entries(c)).filter(([id])=>id.startsWith('controller.render.swbr.iburi')));
check(Object.keys(playerGates).length===21,'Passes de fumaça não pertencem ao jogador');
const evaluate=(expression,data,withProgram=false)=>typeof expression==='number'?expression:parser.parse((withProgram?program:'')+(withProgram?`return ${expression};`:expression),data);
const cases=[
 {name:'terceira_pessoa',distance:4},
 {name:'primeira_pessoa_contexto_item_zero',first:1,distance:1.62},
 {name:'primeira_pessoa_câmera_afastada_contexto_item_zero',first:1,distance:4},
 {name:'câmera_recolhida_por_parede',distance:1.62},
 {name:'consulta_distância_zero',distance:0},
 {name:'câmera_logo_acima_da_cabeça',distance:2.0},
 {name:'limite_proximidade',distance:2.8},
 {name:'início_transição',distance:2.9},
 {name:'meio_transição',distance:3.15},
 {name:'transição_completa',distance:3.5},
 {name:'inventário',ui:1,distance:4},
 {name:'paperdoll',paper:1,distance:4},
 {name:'ícone_mapa',map:1,distance:4},
 {name:'espectador',spectator:1,distance:4}
];
function inputs(c,head,contextFirst=0){return {
 'variable.is_first_person':c.first||0,'variable.is_paperdoll':c.paper||0,'variable.map_face_icon':c.map||0,
 'query.is_in_ui':c.ui||0,'query.is_spectator':c.spectator||0,'query.distance_from_camera':c.distance,
 'query.is_item_name_any':(slot,index,...ids)=>slot==='slot.armor.head'&&ids.includes(head)?1:0,
 'query.life_time':1.7,'context.is_first_person':contextFirst,'context.item_slot':"'head'"
};}
const cameraResults=[];
for(const c of cases)for(const head of ['nz:modo_iburi1','nz:modo_iburi2','nz:modo_iburi3','nenhum'])for(const contextFirst of [0,1]){
 const data=inputs(c,head,contextFirst);
 const stage=Number(head.slice(-1))||0;
 const allowed=Boolean(stage&&!c.first&&!c.ui&&!c.paper&&!c.map&&!c.spectator&&c.distance>2.8);
 let passes=0;
 for(const [id,gate] of Object.entries(playerGates)){
  const belongs=id.startsWith(`controller.render.swbr.iburi${stage}.`);
  const visible=Boolean(evaluate(gate,data,true));
  check(visible===(allowed&&belongs),`Câmera permite passe indevido: ${c.name}/${head}/${id}`);
  passes+=Number(visible);
 }
 check(passes===(allowed?7:0),'Número incorreto de passes da transformação');
 for(let i=1;i<=3;i++){
  const enter=fx.states.default.transitions[i-1][`fumaca${i}`];
  const exit=fx.states[`fumaca${i}`].transitions[0].default;
  check(Boolean(evaluate(enter,data,true))===(allowed&&stage===i),'Emissor ativo em primeira pessoa, UI ou modo incorreto');
  check(Boolean(evaluate(exit,data,true))===!(allowed&&stage===i),'Emissor não encerra ao sair do estado');
 }
 const fade=evaluate('v.swbr_iburi_fade',data,true);
 check(Number.isFinite(fade)&&Math.abs(fade-Math.max(0,Math.min(1,(c.distance-2.8)/.7)))<1e-9,'Transição de proximidade inválida');
 cameraResults.push({caso:c.name,modo:stage,contexto_item_primeira_pessoa:contextFirst,passes});
}
// Real expression from 18.11.66: it missed the player/item-context mismatch.
const legacy="context.item_slot != 'main_hand' && context.item_slot != 'off_hand' && (!context.is_first_person || query.is_in_ui)";
const regression=inputs({first:1,distance:4},'nz:modo_iburi3',0);
check(Boolean(evaluate(legacy,regression))&&!evaluate('v.swbr_iburi_draw3',regression,true),'Regressão não distingue a máscara anterior da câmera nativa');
const stages=[],files=['entity/player.entity.json','render_controllers/swbr_iburi_transformacoes.json','animation_controllers/swbr_iburi_fumaca.json'];
for(let stage=1;stage<=3;stage++){
 const geoFile={1:'models/entity/nz_modo_iburi1.json',2:'models/entity/nz_modo_iburi2.json',3:'models/entity/nz_modo_iburi3l.geo.json'}[stage];
 const animationFile=`animations/nz_modo_iburi${stage}.idle.json`,particleFile=`particles/swbr_iburi_transformacao_${stage}.json`;
 files.push(geoFile,animationFile,particleFile);
 const geometry=read(geoFile)['minecraft:geometry'][0],bones=Object.fromEntries(geometry.bones.map(b=>[b.name,b]));
 const a=read(animationFile).animations[`animation.nz_modo_iburi${stage}.idle`];
 let minY=Infinity,maxY=-Infinity,minAlpha=1,maxAlpha=0,maxRadius=0;
 for(let sample=0;sample<=120;sample++){
  const t=sample*a.animation_length/30,data={'query.life_time':t,'variable.swbr_iburi_fade':1};
  const core=evaluate(rc[`controller.render.swbr.iburi${stage}.core`].color.a,data);
  check(Number.isFinite(core)&&core>0&&core<=.78,'Alfa central fora do limite');
  for(let phase=0;phase<6;phase++){
   const value=evaluate(rc[`controller.render.swbr.iburi${stage}.p${phase}`].color.a,data);
   const cycle=(t/a.animation_length+Number((phase/6).toFixed(6)))%1;
   const expected=Math.min(Math.max(0,Math.min(1,cycle/.17)),Math.max(0,Math.min(1,(1-cycle)/.43)));
   check(Number.isFinite(value)&&value>=0&&value<=1&&Math.abs(value-expected)<1e-8,'Envelope de dissipação inválido');
   minAlpha=Math.min(minAlpha,value);maxAlpha=Math.max(maxAlpha,value);
  }
  for(const [name,channels] of Object.entries(a.bones)){
   const position=channels.position.map(v=>evaluate(v,data)),scale=channels.scale.map(v=>evaluate(v,data)),rotation=channels.rotation.map(v=>evaluate(v,data));
   check([...position,...scale,...rotation].every(Number.isFinite),'Transformação de nuvem não finita');
   check(scale.every(v=>v>.7&&v<1.4),'Escala de nuvem excessiva');
   const radius=Math.max(...bones[name].cubes.map(c=>Math.hypot(...c.size.map(v=>v/2))))*Math.max(...scale)+.5;
   const point=bones[name].pivot.map((v,i)=>v+position[i]);
   check(Math.abs(point[0])+radius<32&&Math.abs(point[2])+radius<32&&point[1]+radius<52&&point[1]-radius>-20,'Volume ultrapassa os limites visíveis');
   minY=Math.min(minY,point[1]-radius);maxY=Math.max(maxY,point[1]+radius);
   maxRadius=Math.max(maxRadius,Math.hypot(...point)+radius);
  }
 }
 check(minAlpha<.001&&maxAlpha>.99,'Fumaça não percorre expansão e recomposição');
 check(maxRadius/16<2.8,'Envelope de fumaça excede a distância de proteção da câmera');
 const p=read(particleFile).particle_effect.components,billboard=p['minecraft:particle_appearance_billboard'];
 let sizeMax=0;
 for(const lifetime of [0,.001,.3,.45])for(const age of [-.1,0,.001,.1,.3,.45,1]){
  const data={'variable.particle_age':age,'variable.particle_lifetime':lifetime};
  for(const expression of billboard.size){
   const value=evaluate(expression,data);check(Number.isFinite(value)&&value>=0&&value<=.221,'Billboard infinito, negativo ou grande demais');sizeMax=Math.max(sizeMax,value);
  }
  const alpha=evaluate(p['minecraft:particle_appearance_tinting'].color[3],data);
  check(Number.isFinite(alpha)&&alpha>=0&&alpha<=.6,'Alfa de partícula não finito ou excessivo');
 }
 const uv=billboard.uv,flip=uv.flipbook;
 check(flip.base_UV[1]+flip.step_UV[1]*flip.max_frame+flip.size_UV[1]<=uv.texture_height,'Flipbook pode ler fora da textura');
 stages.push({stage,ciclos_amostrados:4,amostras:121,alfa_dissipação:[minAlpha,maxAlpha],limite_y_modelo:[minY,maxY],raio_conservador_metros:maxRadius/16,meia_largura_max_partícula_metros:sizeMax});
}
const fontes_sha256=Object.fromEntries(files.map(file=>[file,sha(file)]));
const report={resultado:'APROVADO',minecraft_executado:false,parser:'Molang do Blockbench 4.12.6',avaliacoes:count,
 regressao:'Primeira pessoa nativa ativa com context.is_first_person=0: máscara 18.11.66 permitiria fumaça; controladores 18.11.67 ficam desativados.',
 camera:cameraResults,stages,fontes_sha256,limite:'Casos numéricos dos arquivos reais; não simulam o renderizador nem comprovam o funcionamento dentro do Minecraft.'};
fs.writeFileSync(path.join(root,'Validacao_Molang.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({resultado:report.resultado,avaliacoes:count,cenarios_camera:cameraResults.length,regressao:report.regressao,stages}));
