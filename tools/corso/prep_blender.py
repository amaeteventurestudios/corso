# Blender: project the owner's 6 ortho views onto the aligned mesh.
# Writes <out>.bin (pos f32, nrm f32, w 6xu8, idx u32) + <out>.json (view mappings), and preview renders.
import bpy, sys, math, json, numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
argv=sys.argv[sys.argv.index('--')+1:]
src,out=argv[0],argv[1]; az=[float(a) for a in argv[2].split(',')] if len(argv)>2 else []
REF='/mnt/project-files/teardowns/cane-corso-refs/'
MASKS='/tmp/claude-0/-home-user/15e38164-fee4-5b5c-9457-1745d5d5b972/scratchpad/hy/'
IW,IH=1672,941
BOX={'right':(136,1514,20,892),'left':(152,1499,29,893),'front':(563,1107,14,901),'back':(542,1129,19,903),'top':(104,1606,164,746),'bottom':(47,1624,87,842)}
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
ob=[o for o in bpy.context.scene.objects if o.type=='MESH'][0]
me=ob.data
co=np.empty(len(me.vertices)*3); me.vertices.foreach_get('co',co); co=co.reshape(-1,3)
vn=np.empty(len(me.vertices)*3); me.vertices.foreach_get('normal',vn); vn=vn.reshape(-1,3)
G=np.c_[co[:,0],co[:,2],-co[:,1]]; GN=np.c_[vn[:,0],vn[:,2],-vn[:,1]]
lo,hi=G.min(0),G.max(0)
def lin(a0,a1,b0,b1): k=(b1-b0)/(a1-a0); return [k, b0-a0*k]   # px = k*coord + c
# each view: camera dir (glTF), u = ku*coord[iu]+cu, v = kv*coord[iv]+cv  (pixels)
V={}
x0,x1,y0,y1=BOX['right']; V['right']=dict(d=[0,0,-1],iu=0,u=lin(lo[0],hi[0],x0,x1),iv=1,v=lin(lo[1],hi[1],y1,y0))
x0,x1,y0,y1=BOX['left']; V['left']=dict(d=[0,0,1],iu=0,u=lin(lo[0],hi[0],x1,x0),iv=1,v=lin(lo[1],hi[1],y1,y0))
x0,x1,y0,y1=BOX['front']; V['front']=dict(d=[-1,0,0],iu=2,u=lin(lo[2],hi[2],x1,x0),iv=1,v=lin(lo[1],hi[1],y1,y0))
x0,x1,y0,y1=BOX['back']; V['back']=dict(d=[1,0,0],iu=2,u=lin(lo[2],hi[2],x0,x1),iv=1,v=lin(lo[1],hi[1],y1,y0))
x0,x1,y0,y1=BOX['top']; V['top']=dict(d=[0,-1,0],iu=0,u=lin(lo[0],hi[0],x1,x0),iv=2,v=lin(lo[2],hi[2],y1,y0))
x0,x1,y0,y1=BOX['bottom']; V['bottom']=dict(d=[0,1,0],iu=0,u=lin(lo[0],hi[0],x1,x0),iv=2,v=lin(lo[2],hi[2],y0,y1))
NAMES=['right','left','front','back','top','bottom']
# eye centres in each picture (px, py, radius) and in 3D (scan frame): x and y from the side views, z from the front
EYES={}
def inv(n,iu,px): m=V[n]; return (px-m['u'][1])/m['u'][0]
def invv(n,py): m=V[n]; return (py-m['v'][1])/m['v'][0]
ex=inv('right',0,1388); exl=inv('left',0,283); ey=(invv('right',127)+invv('front',127))/2
ez=abs(inv('front',2,780)+-inv('front',2,892))/2
EYE3D=np.array([[ex,ey,ez],[exl,ey,-ez]]); EYE_R=0.035
print('EYE3D',EYE3D)
bvh=BVHTree.FromObject(ob,bpy.context.evaluated_depsgraph_get())
W=[]
for n in NAMES:
    d=np.array(V[n]['d'],float)
    w=np.clip(-(GN@d),0,1)
    bd=Vector((-d[0],d[2],-d[1]))
    vis=np.ones(len(G))
    for i in np.where(w>0.02)[0]:
        hit=bvh.ray_cast(Vector(co[i])+bd*0.003,bd,3.0)
        if hit[0] is not None: vis[i]=0.0
    # eyes: a picture's eye may only land on the real eye, not on a cheek or brow behind it
    px_=(V[n]['u'][0]*G[:,V[n]['iu']]+V[n]['u'][1]); py_=(V[n]['v'][0]*G[:,V[n]['iv']]+V[n]['v'][1])
    for (ex,ey,er) in EYES.get(n,[]):
        inside=(px_-ex)**2+(py_-ey)**2 < er*er
        near=np.min(np.linalg.norm(G[:,None,:]-EYE3D[None,:,:],axis=2),axis=1) < EYE_R
        vis[inside & ~near]=0.0
    # a picture only paints where it shows the dog (the body and the pictures don't line up perfectly at the rims)
    mk=np.asarray(bpy.data.images.load(MASKS+'mask_'+n+'.png').pixels[:]).reshape(IH,IW,4)[::-1,:,0]>0.5
    ui=np.clip(np.round(px_).astype(int),0,IW-1); vi=np.clip(np.round(py_).astype(int),0,IH-1)
    on=mk[vi,ui]
    vis=vis*np.where(on,1.0,0.02)
    W.append(w**14*vis+1e-4*w**14*vis)
W=np.array(W); W=W/(W.sum(0)+1e-9)
# smooth weights over the mesh a bit (neighbour average)
import bmesh
bm=bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
nb=[[e.other_vert(v).index for e in v.link_edges] for v in bm.verts]
for it in range(1):
    W=np.stack([np.array([ (W[k,i]+W[k,nb[i]].sum())/(1+len(nb[i])) for i in range(len(nb))]) for k in range(len(NAMES))])
W=W/(W.sum(0)+1e-9)
# write bin
me.calc_loop_triangles()
tri=np.empty(len(me.loop_triangles)*3,dtype=np.int32); me.loop_triangles.foreach_get('vertices',tri)
with open(out+'.bin','wb') as f:
    f.write(G.astype(np.float32).tobytes()); f.write(GN.astype(np.float32).tobytes())
    f.write(np.round(W.T*255).astype(np.uint8).tobytes()); f.write(tri.astype(np.uint32).tobytes())
json.dump(dict(nv=len(G),ni=len(tri),views=NAMES,map={n:V[n] for n in NAMES},img=[IW,IH],lo=lo.tolist(),hi=hi.tolist()),open(out+'.json','w'))
print('bin',len(G),len(tri)//3)
# preview material: weighted sum of projected images
for k,n in enumerate(NAMES):
    uv=me.uv_layers.new(name='p_'+n); m=V[n]
    lv=np.empty(len(me.loops),dtype=np.int64); me.loops.foreach_get('vertex_index',lv)
    u=(m['u'][0]*G[:,m['iu']]+m['u'][1])/IW; v=1-(m['v'][0]*G[:,m['iv']]+m['v'][1])/IH
    uv.data.foreach_set('uv',np.c_[u[lv],v[lv]].ravel())
    a=me.color_attributes.new(name='w_'+n,type='FLOAT_COLOR',domain='POINT')
    c=np.zeros((len(G),4)); c[:,0]=W[k]; c[:,3]=1; a.data.foreach_set('color',c.ravel())
mat=bpy.data.materials.new('proj'); mat.use_nodes=True; nt=mat.node_tree
bsdf=nt.nodes['Principled BSDF']; bsdf.inputs['Roughness'].default_value=0.4
acc=None
for n in NAMES:
    uvn=nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map='p_'+n
    tx=nt.nodes.new('ShaderNodeTexImage'); tx.image=bpy.data.images.load(REF+n+'.png'); tx.extension='EXTEND'; nt.links.new(uvn.outputs[0],tx.inputs[0])
    at=nt.nodes.new('ShaderNodeAttribute'); at.attribute_name='w_'+n
    sep=nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(at.outputs[0],sep.inputs[0])
    mul=nt.nodes.new('ShaderNodeMix'); mul.data_type='RGBA'; mul.blend_type='MULTIPLY'; mul.inputs['Factor'].default_value=1
    nt.links.new(tx.outputs[0],mul.inputs['A']); nt.links.new(sep.outputs[0],mul.inputs['B'])
    if acc is None: acc=mul.outputs['Result']
    else:
        add=nt.nodes.new('ShaderNodeMix'); add.data_type='RGBA'; add.blend_type='ADD'; add.inputs['Factor'].default_value=1
        nt.links.new(acc,add.inputs['A']); nt.links.new(mul.outputs['Result'],add.inputs['B']); acc=add.outputs['Result']
nt.links.new(acc,bsdf.inputs['Base Color'])
me.materials.clear(); me.materials.append(mat)
bpy.ops.object.shade_smooth()
sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.samples=32; sc.render.resolution_x=1400; sc.render.resolution_y=820
w=bpy.data.worlds.new('w'); sc.world=w; w.use_nodes=True; w.node_tree.nodes['Background'].inputs[0].default_value=(0.95,0.91,0.87,1); w.node_tree.nodes['Background'].inputs[1].default_value=1.0
l=bpy.data.objects.new('sun',bpy.data.lights.new('sun','SUN')); l.data.energy=1.5; l.rotation_euler=(math.radians(40),0,math.radians(30)); sc.collection.objects.link(l)
t=bpy.data.objects.new('t',None); t.location=(0,0,0.38); sc.collection.objects.link(t)
for k,a in enumerate(az):
    cam=bpy.data.objects.new('c',bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera=cam
    cam.data.lens=50; r=3.0; A=math.radians(a); el=math.radians(14)
    cam.location=(r*math.cos(el)*math.sin(A), -r*math.cos(el)*math.cos(A), 0.38+r*math.sin(el))
    c=cam.constraints.new('TRACK_TO'); c.target=t; c.track_axis='TRACK_NEGATIVE_Z'; c.up_axis='UP_Y'
    sc.render.filepath=out+'_v%d.png'%k; bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=out+'.blend')
