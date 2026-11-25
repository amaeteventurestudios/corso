# Move each picture's painted eye to the spot where the front picture's eye lands on the body,
# so every view paints the eye in one place. Smooth local warp (no fold), not cut and paste.
import cv2, numpy as np, sys
S=sys.argv[1]; a=cv2.imread(S+'/eye/atlas_orig.jpg'); W,H=1672,941
WARP=[(0,(1387,128),(1426,131),55),(1,(282,135),(240,139),55),(4,(265,380),(201,396),60),(4,(265,520),(202,516),60)]
out=a.copy()
for k in sorted(set(w[0] for w in WARP)):
    ox,oy=(k%2)*W,(k//2)*H; t=a[oy:oy+H,ox:ox+W].astype(np.float32)
    yy,xx=np.mgrid[0:H,0:W].astype(np.float32)
    mx,my=xx.copy(),yy.copy()
    # backward map: solve q + D(q) = p by fixed-point, D gaussian around the target
    for _ in range(6):
        nx,ny=xx.copy(),yy.copy()
        for kk,(fx,fy),(tx,ty),sg in WARP:
            if kk!=k: continue
            dx,dy=tx-fx,ty-fy
            g=np.exp(-((mx-fx)**2+(my-fy)**2)/(2*sg*sg))
            nx-=dx*g; ny-=dy*g
        mx,my=nx,ny
    out[oy:oy+H,ox:ox+W]=cv2.remap(t,mx,my,cv2.INTER_CUBIC,borderMode=cv2.BORDER_REFLECT).clip(0,255).astype(np.uint8)
cv2.imwrite(S+'/eye/atlas_warp.jpg',out,[cv2.IMWRITE_JPEG_QUALITY,92])
rows=[]
for k,(fx,fy),(tx,ty),sg in WARP:
    ox,oy=(k%2)*W,(k//2)*H; X,Y=ox+(fx+tx)//2,oy+(fy+ty)//2
    rows.append(np.hstack([a[Y-90:Y+90,X-130:X+130],out[Y-90:Y+90,X-130:X+130]]))
cv2.imwrite(S+'/eye/warp_cmp.jpg',np.vstack(rows))
