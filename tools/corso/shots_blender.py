import bpy, sys, math
argv=sys.argv[sys.argv.index('--')+1:]
sc=bpy.context.scene; sc.cycles.samples=48
t=bpy.data.objects['t']
for k,spec in enumerate(argv[1:]):
    a,el,r,tx,ty=[float(x) for x in spec.split(':')]
    t.location=(tx,0,ty)
    cam=bpy.data.objects.new('c',bpy.data.cameras.new('c')); sc.collection.objects.link(cam); sc.camera=cam
    cam.data.lens=50; A=math.radians(a); E=math.radians(el)
    cam.location=(tx+r*math.cos(E)*math.sin(A), -r*math.cos(E)*math.cos(A), ty+r*math.sin(E))
    c=cam.constraints.new('TRACK_TO'); c.target=t; c.track_axis='TRACK_NEGATIVE_Z'; c.up_axis='UP_Y'
    sc.render.filepath=argv[0]+'_%d.png'%k; bpy.ops.render.render(write_still=True)
