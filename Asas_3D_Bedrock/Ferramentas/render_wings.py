"""Offline inspection render from the exact Blockbench cube data; run with Blender."""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Matrix, Vector, Euler

ROOT=Path(__file__).resolve().parent
PROJECT=ROOT.parent if ROOT.name=='Ferramentas' else ROOT/'Asas_3D_Fonte'
OUT=PROJECT/'Previews';OUT.mkdir(exist_ok=True)

def transform(p):return (p[0]/16,-p[2]/16,p[1]/16)
def around(p,r):
    p=Vector(p)
    return Matrix.Translation(p)@Euler([math.radians(a) for a in r],'XYZ').to_matrix().to_4x4()@Matrix.Translation(-p)

def make_material(kind,image,aura=False):
    m=bpy.data.materials.new(kind+('_halo' if aura else '_corpo'));m.use_nodes=True
    n=m.node_tree.nodes;l=m.node_tree.links
    shader=n.get('Principled BSDF')
    tex=n.new('ShaderNodeTexImage');tex.image=image;tex.interpolation='Closest'
    l.new(tex.outputs['Color'],shader.inputs['Base Color']);l.new(tex.outputs['Alpha'],shader.inputs['Alpha'])
    shader.inputs['Roughness'].default_value=.67
    shader.inputs['Specular IOR Level'].default_value=.18
    if 'Emission Color' in shader.inputs:
        l.new(tex.outputs['Color'],shader.inputs['Emission Color']);shader.inputs['Emission Strength'].default_value=.12 if kind=='azuis' else .18
    m.diffuse_color=(.1,.7,1,1) if kind=='azuis' else (1,.5,.9,1)
    return m

def wings(kind):
    data=json.loads((PROJECT/'Modelos_Blockbench'/('Asas_Azuis.bbmodel' if kind=='azuis' else 'Asas_Rosas.bbmodel')).read_text())
    byid={e['uuid']:e for e in data['elements']}
    texture=bpy.data.images.load(str(PROJECT/f'Asas_3D_RP/textures/entity/asas_teste/chamas_{kind}.png'))
    mats=[make_material(kind,texture),make_material(kind,texture,True)]
    vertices=[];faces=[];uvs=[];matindices=[]
    def walk(g,parent):
        matrix=parent@around(g['origin'],g.get('rotation',[0,0,0]))
        for child in g['children']:
            if isinstance(child,dict):walk(child,matrix);continue
            e=byid[child];m=matrix@around(e['origin'],e.get('rotation',[0,0,0]))
            x0,y0,z0=e['from'];x1,y1,z1=e['to']
            quads={
              'north':[(x0,y1,z0),(x1,y1,z0),(x1,y0,z0),(x0,y0,z0)],
              'south':[(x1,y1,z1),(x0,y1,z1),(x0,y0,z1),(x1,y0,z1)],
              'east':[(x1,y1,z0),(x1,y1,z1),(x1,y0,z1),(x1,y0,z0)],
              'west':[(x0,y1,z1),(x0,y1,z0),(x0,y0,z0),(x0,y0,z1)],
              'up':[(x0,y1,z1),(x1,y1,z1),(x1,y1,z0),(x0,y1,z0)],
              'down':[(x0,y0,z0),(x1,y0,z0),(x1,y0,z1),(x0,y0,z1)]}
            for f,quad in quads.items():
                k=len(vertices);vertices.extend(transform(m@Vector(v)) for v in quad);faces.append((k,k+1,k+2,k+3))
                a,b,c,d=e['faces'][f]['uv'];uvs.append([(a/1024,1-b/1024),(c/1024,1-b/1024),(c/1024,1-d/1024),(a/1024,1-d/1024)])
                matindices.append(1 if g['name'].endswith('_halo') else 0)
    for g in data['outliner']:walk(g,Matrix.Identity(4))
    mesh=bpy.data.meshes.new('Geometria_Exata_'+kind);mesh.from_pydata(vertices,[],faces);mesh.update()
    ob=bpy.data.objects.new('Asas_'+kind,mesh);bpy.context.collection.objects.link(ob)
    for m in mats:mesh.materials.append(m)
    uv=mesh.uv_layers.new(name='UVMap')
    for i,p in enumerate(mesh.polygons):
        p.material_index=matindices[i]
        for j,loop in enumerate(p.loop_indices):uv.data[loop].uv=uvs[i][j]
    return ob

def solid_material(name,col):
    m=bpy.data.materials.new(name);m.diffuse_color=(*col,1);m.use_nodes=True
    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*col,1)
    m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.8
    return m

def box(name,lo,hi,mat):
    a=Vector(transform(lo));b=Vector(transform(hi))
    bpy.ops.mesh.primitive_cube_add(size=1,location=(a+b)/2)
    ob=bpy.context.object;ob.name=name;ob.dimensions=tuple(abs(b[i]-a[i]) for i in range(3));ob.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return ob

def mannequin():
    cloth=solid_material('Tronco neutro',(.19,.235,.30));skin=solid_material('Cabeça e mãos',(.57,.61,.65));pants=solid_material('Pernas',(.095,.12,.165));shoes=solid_material('Pés',(.04,.055,.075));eye=solid_material('Rosto',(.07,.10,.15))
    for name,lo,hi,mat in [('torso',[-4,12,-2],[4,24,2],cloth),('head',[-4,24,-4],[4,32,4],skin),('armR',[-8,12,-2],[-4,24,2],cloth),('armL',[4,12,-2],[8,24,2],cloth),('handR',[-8,12,-2],[-4,15,2],skin),('handL',[4,12,-2],[8,15,2],skin),('legR',[-4,0,-2],[0,12,2],pants),('legL',[0,0,-2],[4,12,2],pants),('shoeR',[-4,0,-2.1],[0,2,2],shoes),('shoeL',[0,0,-2.1],[4,2,2],shoes),('eyeR',[-2.8,28.2,-4.03],[-1.2,29.2,-4],eye),('eyeL',[1.2,28.2,-4.03],[2.8,29.2,-4],eye)]:box(name,lo,hi,mat)

def look(obj,target):obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
def area(name,pos,power,size,target):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
    ob=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(ob);ob.location=pos;look(ob,target)

def setup(kind):
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.samples=32;sc.cycles.use_denoising=False
    sc.render.resolution_x=1000;sc.render.resolution_y=1120;sc.render.resolution_percentage=100
    sc.render.image_settings.file_format='PNG';sc.render.film_transparent=False
    sc.view_settings.view_transform='Standard';sc.view_settings.look='Medium High Contrast' if False else 'None'
    sc.world.color=(.055,.065,.09)
    sc.world.use_nodes=True;bg=sc.world.node_tree.nodes['Background'];bg.inputs['Color'].default_value=(.055,.069,.100,1);bg.inputs['Strength'].default_value=.65
    wings(kind);mannequin()
    floor=solid_material('Chão',(.025,.034,.053))
    box('floor',[-150,-3.5,-150],[150,-3.3,150],floor)
    area('Key',(2,4,7),260,5,(0,0,2));area('Back',(-3,-5,5),240,4,(0,0,2));area('Fill',(-3,2,2.5),100,4,(0,0,1.7))
    camdata=bpy.data.cameras.new('Camera');cam=bpy.data.objects.new('Camera',camdata);bpy.context.collection.objects.link(cam);sc.camera=cam
    camdata.type='ORTHO';camdata.ortho_scale=4.25
    for view,location,target in [('frente',(0,9,1.8),(0,0,1.72)),('perspectiva',(4.6,-8,3.1),(0,-.23,1.75))]:
        cam.location=location;look(cam,target);sc.render.filepath=str(OUT/f'{kind}_{view}.png');bpy.ops.render.render(write_still=True)

if __name__=='__main__':
    for k in ['azuis','rosas']:setup(k)
