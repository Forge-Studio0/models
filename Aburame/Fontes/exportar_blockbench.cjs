/* Import, export and reopen the six native Bedrock projects. No screenshots. */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),rp=path.join(root,'Integracao/RP');
const modes=JSON.parse(fs.readFileSync(path.join(root,'Integracao_Manifesto.json'))).modes;
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function comparable(a,b){
 if(typeof a==='number'&&typeof b==='number')return Math.abs(a-b)<1e-5;
 if(Array.isArray(a))return Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>comparable(v,b[i]));
 if(a&&typeof a==='object')return b&&Object.keys(a).sort().join('|')===Object.keys(b).sort().join('|')&&Object.keys(a).every(k=>comparable(a[k],b[k]));
 return a===b;
}
// Bedrock accepts both uniform scalar scales and equivalent XYZ vectors.
function canonicalAnimation(animations){
 const result=JSON.parse(JSON.stringify(animations));
 for(const animation of Object.values(result))for(const channels of Object.values(animation.bones||{})){
  if(typeof channels.scale==='number'||typeof channels.scale==='string')channels.scale=[channels.scale,channels.scale,channels.scale];
 }
 return result;
}
function canonicalGeometry(bones){
 const result=JSON.parse(JSON.stringify(bones));
 for(const bone of Object.values(result))for(const cube of bone.cubes||[]){
  // A zero rotation has no effect around any pivot; the editor omits both.
  if(cube.rotation&&cube.rotation.every(n=>n===0))delete cube.rotation;
  if(!cube.rotation)delete cube.pivot;
 }
 return result;
}
(async()=>{
 const options={headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']};
 if(fs.existsSync('/usr/bin/chromium'))options.executablePath='/usr/bin/chromium';
 const browser=await chromium.launch(options),page=await browser.newPage();
 await page.route('https://**/*',r=>r.abort());
 await page.goto(process.env.ABURAME_BLOCKBENCH_URL||'http://127.0.0.1:8876/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof Blockbench!=='undefined'&&Blockbench.setup_successful);
 const results=[];fs.mkdirSync(path.join(root,'Modelos_Blockbench'),{recursive:true});
 const scratch=process.env.ABURAME_CHECK_DIR||path.join(require('os').tmpdir(),'swbr-aburame-checks');fs.mkdirSync(scratch,{recursive:true});
 for(const [key,spec] of Object.entries(modes)){
  const mode=Number(key),geometry=JSON.parse(fs.readFileSync(path.join(rp,spec.path)));
  const animPath=path.join(rp,`animations/swbr_aburame_${mode}.json`),animation=JSON.parse(fs.readFileSync(animPath));
  const texPath=path.join(rp,`textures/entity/swbr/aburame/modo_${mode}.png`),texture='data:image/png;base64,'+fs.readFileSync(texPath).toString('base64');
  const baseline=await page.evaluate(()=>ErrorLog.length);
  await page.evaluate(({geometry,animation,texture,name})=>{
   Codecs.bedrock.load(geometry,{path:name+'.geo.json'});Project.name=name;
   const tex=new Texture({name:name+'.png',keep_size:true}).fromDataURL(texture).add(false);
   for(const cube of Cube.all)for(const face of Object.values(cube.faces))if(face.texture!==null)face.texture=tex.uuid;
   Animator.loadFile({path:name+'.animation.json',json:animation});
  },{geometry,animation,texture,name:spec.name});
  await page.waitForFunction(()=>Texture.all.length===1&&Texture.all[0].img.complete&&Texture.all[0].img.naturalWidth===512);
  const state=await page.evaluate(()=>({version:Blockbench.version,format:Format.id,cubes:Cube.all.length,bones:Group.all.length,
   animations:Animation.all.map(a=>({name:a.name,length:a.length,animators:Object.keys(a.animators).length})),texture_error:Texture.all[0].error,
   project:Codecs.project.compile({raw:true,bitmaps:true}),geometry:Codecs.bedrock.compile({raw:true}),animation:Animator.buildFile()}));
  const imported=Object.fromEntries(geometry['minecraft:geometry'][0].bones.map(b=>[b.name,b]));
  // Raw codec objects contain optional undefined fields, omitted in real JSON.
  const exported=Object.fromEntries(JSON.parse(JSON.stringify(state.geometry))['minecraft:geometry'][0].bones.map(b=>[b.name,b]));
  if(!comparable(canonicalGeometry(imported),canonicalGeometry(exported))){
   fs.writeFileSync(path.join(scratch,`roundtrip_${mode}.json`),JSON.stringify({imported,exported},null,2));
   throw Error('Geometry/UV/rig changed during editor roundtrip: '+mode);
  }
  if(!comparable(canonicalAnimation(animation.animations),canonicalAnimation(state.animation.animations))){
   fs.writeFileSync(path.join(scratch,`animation_roundtrip_${mode}.json`),JSON.stringify({imported:animation,exported:state.animation},null,2));
   throw Error('Animation changed during editor roundtrip: '+mode);
  }
  state.project.textures[0].source=texture;state.project.textures[0].internal=true;
  const target=path.join(root,'Modelos_Blockbench',spec.name+'.bbmodel');fs.writeFileSync(target,JSON.stringify(state.project,null,2)+'\n');
  fs.writeFileSync(path.join(scratch,`modelo_${mode}.geometry.json`),JSON.stringify(state.geometry,null,2));
  fs.writeFileSync(path.join(scratch,`modelo_${mode}.animation.json`),JSON.stringify(state.animation,null,2));
  await page.evaluate(({project,name})=>Codecs.project.load(project,{path:name+'.bbmodel'}),{project:state.project,name:spec.name});
  await page.waitForFunction(()=>Texture.all.length===1&&Texture.all[0].img.complete&&Texture.all[0].img.naturalWidth===512);
  const reopened=await page.evaluate(()=>({cubes:Cube.all.length,bones:Group.all.length,animations:Animation.all.length,texture_error:Texture.all[0].error}));
  const errors=await page.evaluate(b=>ErrorLog.slice(b),baseline);
  if(errors.length||state.texture_error||reopened.texture_error||reopened.cubes!==state.cubes||reopened.bones!==state.bones||reopened.animations!==1)throw Error('Saved project does not reopen: '+mode+' '+JSON.stringify(errors));
  const result={mode,editor:state.version,format:state.format,cubes:state.cubes,bones:state.bones,animations:state.animations,texture_error:state.texture_error,reopened,errors,
   geometry_roundtrip:true,animation_roundtrip:true,source_sha256:sha(target),native_geometry_sha256:sha(path.join(rp,spec.path)),native_animation_sha256:sha(animPath),texture_sha256:sha(texPath)};
  results.push(result);console.log(JSON.stringify(result));
 }
 fs.writeFileSync(path.join(root,'Validacao_Blockbench.json'),JSON.stringify({screenshots_created:false,minecraft_executado:false,results},null,2)+'\n');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
