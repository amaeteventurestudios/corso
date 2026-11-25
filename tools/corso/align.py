# Put the Hunyuan3D-2mv mesh into the page's frame: head +x, y up, ground y=0, 0.78 units tall, centred.
# python3 tools/corso/align.py cane_corso_60k.glb /tmp/al.glb   (needs trimesh)
import sys, numpy as np, trimesh
m = trimesh.load(sys.argv[1], force='mesh'); v = m.vertices.copy()
v = np.c_[v[:, 2], v[:, 1], -v[:, 0]]          # Hunyuan: length along z, head at +z
v *= 0.78 / (v[:, 1].max() - v[:, 1].min())
v[:, 1] -= v[:, 1].min(); v[:, 0] -= (v[:, 0].max() + v[:, 0].min()) / 2; v[:, 2] -= (v[:, 2].max() + v[:, 2].min()) / 2
trimesh.Trimesh(v, m.faces, process=True).export(sys.argv[2])
