/* Import native Bedrock assets into Blockbench and save editable animated projects.
 * Requires a locally served Blockbench 4.12.6 and Playwright; no screenshots.
 */
const fs=require('fs');const path=require('path');const crypto=require('crypto');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const url=process.env.IBURI_BLOCKBENCH_URL||'http://127.0.0.1:8876/';
const geometryPaths={1:'nz_modo_iburi1.json',2:'nz_modo_iburi2.json',3:'nz_modo_iburi3l.geo.json'};
const names={1:'Iburi_Fumaca_I',2:'Iburi_Fumaca_II',3:'Iburi_Fumaca_Total'};
(async()=>{
 const options={headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']};
 if(fs.existsSync('/usr/bin/chromium'))options.executablePath='/usr/bin/chromium';
 const browser=await chromium.launch(options);const page=await browser.newPage();
 await page.route('https://**/*',r=>r.abort());
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof Blockbench!=='undefined'&&Blockbench.setup_successful);
 const results=[];fs.mkdirSync(path.join(root,'Modelos_Blockbench'),{recursive:true});
 const scratch=process.env.IBURI_CHECK_DIR||'/workspace/work/iburi/checks';fs.mkdirSync(scratch,{recursive:true});
 for(const stage of [1,2,3]){
  const geometry=JSON.parse(fs.readFileSync(path.join(root,'Integracao/RP/models/entity',geometryPaths[stage])));
  const animation=JSON.parse(fs.readFileSync(path.join(root,`Integracao/RP/animations/nz_modo_iburi${stage}.idle.json`)));
  const texture='data:image/png;base64,'+fs.readFileSync(path.join(root,`Integracao/RP/textures/entity/swbr/iburi/fumaca${stage}.png`)).toString('base64');
  const baseline=await page.evaluate(()=>ErrorLog.length);
  await page.evaluate(({geometry,animation,texture,name,stage})=>{
    Codecs.bedrock.load(geometry,{path:name+'.geo.json'});
    Project.name=name;
    const tex=new Texture({name:`iburi_fumaca${stage}.png`,keep_size:true}).fromDataURL(texture).add(false);
    for(const cube of Cube.all)for(const face of Object.values(cube.faces))if(face.texture!==null)face.texture=tex.uuid;
    Animator.loadFile({path:name+'.animation.json',json:animation});
  },{geometry,animation,texture,name:names[stage],stage});
  await page.waitForFunction(()=>Texture.all.length===1&&Texture.all[0].img.complete&&Texture.all[0].img.naturalWidth===512);
  const state=await page.evaluate(()=>({
    version:Blockbench.version,format:Format.id,cubes:Cube.all.length,bones:Group.all.length,
    animations:Animation.all.map(a=>({name:a.name,length:a.length,animators:Object.keys(a.animators).length})),
    texture_error:Texture.all[0].error,
    project:Codecs.project.compile({raw:true,bitmaps:true}),geometry:Codecs.bedrock.compile({raw:true}),animation:Animator.buildFile()
  }));
  state.project.textures[0].source=texture;state.project.textures[0].internal=true;
  const file=path.join(root,'Modelos_Blockbench',names[stage]+'.bbmodel');
  fs.writeFileSync(file,JSON.stringify(state.project,null,2)+'\n');
  fs.writeFileSync(path.join(scratch,`iburi${stage}.geometry.json`),JSON.stringify(state.geometry,null,2));
  fs.writeFileSync(path.join(scratch,`iburi${stage}.animation.json`),JSON.stringify(state.animation,null,2));
  const errors=await page.evaluate(b=>ErrorLog.slice(b),baseline);
  const result={stage,editor:state.version,format:state.format,cubes:state.cubes,bones:state.bones,animations:state.animations,texture_error:state.texture_error,errors,source_sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')};
  if(errors.length||result.texture_error||result.animations.length!==1)throw Error(JSON.stringify(result));
  results.push(result);console.log(JSON.stringify(result));
 }
 fs.writeFileSync(path.join(root,'Validacao_Blockbench.json'),JSON.stringify({screenshots_created:false,results},null,2)+'\n');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
