# Aja M-9, the robot Cane Corso: handoff

Written 7 November 2026. Branch `claude/project-thread-45vhuw` in amaeteventurestudios/teardowns. Preview: https://claude.ai/artifact/BJF3ekdoaYNZEBY7RyuUJ4

## What it is
The owner asked for the same kind of explorer as a robot-cat video ("Robot Cat, Piece by Piece"), but for a robotic Cane Corso that matches their picture: ivory plates, copper actuators, dark paws. It's our own build and brand, with no copy of the video's name or logo. Sections: Overview, Eye, Ear, Paw, Back, Flank, Teardown, Walk, Run. There's no drop test (the owner didn't want one).

## Files
- `cane-corso/index.html`: the layout from the video. Brand top left, Live sim top right, centred title and a row of section chips with a Tour button, the section list on the left (two lines under the open one), four cards on the right (Stride Hz with a wave, Force on paws, Joint load with 12 bars, Battery), and a status pill, timeline and clock along the bottom. On phones the list hides, the cards become a row at the bottom, and sideways the chips and cards move to the right 40%.
- `cane-corso/dog.js`: the dog, all in code. It uses lofted torso, head, neck and leg surfaces, with plates cut out of them (rolled rim plus a short skirt), copper pistons, joint hubs, bolts, camera eyes, geared ears with smoked glass, toes with claws, an 8-segment tail, and a battery tray and control board behind a hinged near-side flank plate. Every mesh is one part (about 950). `computeExplode()` works out each part's teardown direction once, in the standing pose.
- `cane-corso/geo.js`: geometry helpers (`shellPatch`, lofts, rings, gears, tubes).
- `cane-corso/main.js`: the studio (neutral softbox environment, GTAO on desktop), the gait, the sections, the camera and the console. The legs use two-bone IK with the paw kept flat. The walk is a lateral sequence at 1.6 Hz (about 2.4 mph). The run is a rotary gallop at 2.6 Hz (about 8 to 9 mph) with a moment in the air. Force on paws is m(g + body acceleration), joint load is the stance share times the lever, and the battery drains from 900 Wh by gait power.
- `tools/dogshot.mjs`: `BASE=http://localhost:8799 node tools/dogshot.mjs /tmp/shots desk,port,land overview,eye,teardown`.
- `window.__corso`: `go(section)`, `ff(sec)`, `settle()`, `render()`, `parts`, `state`, `K`. Add `?still&notour` for screenshots and `?s=run` to open on a section.

## Numbers on the page (check them against the code if anything changes)
46 kg (101 lb). 12 leg joints (3 hubs per leg). 8 tail segments. 2 camera eyes. 14 vertebrae. 6 saddle plates with 2 bolts each. 6 cells, 0.9 kWh. The part count comes from `dog.parts.length`.

## What is still weak
The first version is built from code alone, from one picture. The body and legs read well, but the head is still blockier than the picture: the brow, jowls and muzzle need the owner's flat drawings. The plan, following the owner's "blueprints" article:
1. The owner makes 4 orthographic views in ChatGPT (side, front, back, top). The prompts are in the thread.
2. Hunyuan3D-2mv is installed on the owner's DGX Spark (spark-aeb0) in `~/tools/hunyuan3d`, with transformers pinned to 4.57.6 and diffusers to 0.35.2. Run it with `~/tools/hunyuan3d/.venv/bin/python ~/tools/hunyuan3d/run_mv.py --front f.png --left l.png --back b.png --out out/cane_corso.glb`. Its test run still waited on the owner's "allow it". The licence is Tencent's community licence, which isn't permissive, so we use it as a tool only.
3. Fit the mesh to the outlines, then cut the plates from the drawings by colour and drop them in place of the lofted shells. Keep the code parts (eyes, ears, paws, hubs, pistons, tray).

## v2 (7 Nov 2026): fiercer, from the owner's 8 reference views

- The owner said v1 "looks like a toy". v2 reshapes the body and head from measurements of the 8 reference images in `/mnt/project-files/teardowns/cane-corso-refs/` (top, exploded, three-quarter, bottom, back, right, front, left). The torso is scaled (`TX 1.13`, `TZ 1.1`) and follows measured top and belly lines (`TOP`, `BOT` tables in `dog.js`).
- Head: heavy frown brows, forehead wrinkles, a deep square muzzle, a big gloss nose, and face plates split into temple, cheek, eye surround, under-eye, upper lip, jowl, muzzle side and flews.
- New Jaw section (after Eye): the lips peel back (`snarl` offsets on the face plates), the jaw drops on two copper hinge pistons, and 42 steel teeth show (20 upper, 22 lower, with 4 big fangs), plus gums and a dark tongue. `K.snarl` drives it. The dog also snarls briefly every few seconds in Overview and Walk, and half opens its mouth while running.
- About 1,023 parts. The status pill reads "Jaw N% open" in that section.
- Still to do: the head is built from code and stays a little blocky. If the owner approves, Hunyuan3D-2mv on the DGX Spark (`~/tools/hunyuan3d/run_corso.sh`, Remote Control) makes a rough body from their views, which we would fit and cut into plates. That would be a model file, an exception to the "no model files" rule, like Prebyld's FreeCAD one.

## v3 (7 Nov 2026): the owner's own dog, modelled from their drawings

The owner rejected v2 ("looks nothing like the images") and asked for it to be modelled properly. v3 replaces the code-built look with a body made from their four views:

1. **Shape.** Hunyuan3D-2mv on the owner's DGX Spark (`~/tools/hunyuan3d/run_corso.sh`, about a minute) turned front, left, back and right (`/mnt/project-files/teardowns/cane-corso-refs/`) into a mesh (859k faces, plus a 60k version). The owner approved one Claude Code allow rule on the Spark for that script. Hunyuan's licence (Tencent Hunyuan community) is not permissive: we use it as a tool only.
2. **Line-up and paint.** `tools/corso/align.py` puts the mesh in the page's frame. `tools/corso/prep_blender.py` (Blender 4.2, headless) maps each of the six reference pictures (right, left, front, back, top, bottom) onto it orthographically, tests which vertices each picture can actually see (ray casts), and writes `cane-corso/scan/aja.bin` (positions, normals, six view weights, triangles) and `aja.json` (the view mappings). `cane-corso/scan/atlas.jpg` is the six pictures in a 2 by 3 grid.
3. **Page.** `cane-corso/scan.js` builds a skinned mesh whose shader paints the atlas by the six weights. `fitRig()` moves the code rig's hips, knees, ankles, paws, head and jaw onto joints read off the right view (`JOINTS`), so the skin binds to a rig with its shape; the code parts stay as the inside. Legs take only what hangs below the shoulder and hip discs (`legZone`). The jaw is cut along the mouth line in the side view, and the code teeth, gums, palate and tongue sit inside it.
4. **Sections.** Flank turns the painted shell to glass and shows the code-built inside. Teardown cuts the painted shell into about 350 plates (a grid of cells) that fly off with the code parts. Eye, ear, paw and back are close-ups of the painted body.

Exception to the repo rule "no images, no model files": this page carries the owner's own drawings and a mesh made from them, at the owner's request.

Known issues: the side pictures carry their own highlights, so oblique views look a bit glassy; the far legs stretch a little mid-stride; the full 859k mesh (on the Spark) would give finer form if brought over.

### v3.1 (7 Nov 2026, after the owner's 360 review)
- The owner saw "six eyes": painted eyes from several pictures landing in different places. Fix: the Spark re-ran Hunyuan at full quality (50 steps; `run_corso.sh` now defaults to it); its 120k-face body puts the eye sockets where the pictures do, so each eye is painted once. `buildEyes()` in `scan.js` (3D amber eyes) stays available behind `?eyes3d`.
- The skin was bound mid-stride (the page boots walking), which bent the legs; it now binds in the plain standing pose.
- Pictures no longer paint where they show background (masks per view), and the atlas is padded with the nearest dog colour, so the legs carry no cream blobs.
- The mouth line gives each triangle wholly to the head or the jaw: no gap when closed.
- Checks: `tools/dog360.mjs` (camera all round, any section), `tools/dogwalk.mjs` (8 frames of a stride).

## v3.2 (8 Nov 2026): two eyes, rigid hind legs

- Eyes: the side and top pictures painted their eyes about 3 cm behind where the front picture's eyes land on the body,
  so 3/4 views showed three eyes. `tools/corso/eye_warp.py` warps each of those pictures (smooth local warp, no cut and
  paste) so its eye sits where the front eye lands, and rewrites `scan/atlas.jpg` (keep the original atlas as input).
  Checked: exactly two eyes from 12 angles round the head; one eye in each profile.
- Hind legs: the robot's hind leg is one rigid plate from the hip disc to the hock disc, then the cannon to the paw.
  `JOINTS.hind` now uses those real joints; both knees bend back (`L.bendBack`), the hind cannon is one straight bar
  (`L.rigidAnkle`), the hock folds at most about 65 degrees, the hip disc turns with the leg and the haunch plate stays
  on the body (sharp seam at the disc rim), hind stride is 62% of the front's with less lift, and the paw hangs off the
  cannon in the air.
- Webs between the near and far legs are collapsed, and parts no picture sees (inside of the far legs) borrow the side
  picture instead of rendering black.

## v3.3 (11 Nov 2026): mechanical legs, gait check, jump

- Nothing renders before the painted skin is ready (the code rig is hidden; a "Loading Aja" note shows).
- Leg points are rigid: each belongs to one bone of its leg (nearest centre line), so leg plates turn at their joint
  discs and never stretch. The shoulder disc works like the hip disc.
- Gaits: walk is a lateral-sequence walk (hind left, fore left, hind right, fore right), 1.7 Hz; run is a rotary
  gallop, 2.8 Hz. Front and hind now share one stride length so all four paws sweep at the same ground speed.
- Jump section (`JUMP` in main.js): crouch, push (fores leave first), flight with paws tucked, fores land, hinds land,
  absorb. Force on paws drops to zero in the air.

## v3.4 (12 Nov 2026): real cutaways

- Eye, Jaw, Ear, Paw, Back and Flank each cut a window in the painted shell (`CUTS` in main.js: a capsule between two
  anchors, radius, and the side it opens on). The skin shader discards inside it, draws the inside of the shell in
  shadow and a copper line along the cut edge. The machine parts inside the window show and come apart on their own
  offsets; ivory code shell stays hidden. Cutaways open over about 2.6 s; the tour holds each for 7 s.
- 4 to 5 callouts per section on desktop, 3 on phones. Portrait phones stack the cards in two columns above the dog.

## v3.5 (12 Nov 2026): eye and ear cutaways rebuilt
- The code-built eye and ear in dog.js are small and sit off the painted ones, so these two sections now use their own
  mechanisms in `cutmods.js`, placed on the painted eye and ear (positions read off the scan in the rig frame, parented
  to the head, scaled 1/head scale).
- Eye: a 3 cm window over the painted eye opens into a machined socket (copper lip, 6 bolts); the camera stack slides
  out up and forward, layer by layer (image sensor board, rear lens, focus barrel with ring gear and motor, front lens,
  7-blade iris, glass dome) and grows to 1.6x so each layer reads.
- Ear: a half section. The shader's new `cutOff` uniform puts the cut plane through the capsule axis (0), so the near
  half of the painted ear is removed and a copper line marks the cut face; inside: copper frame, smoked membrane, sound
  horn with grille, microphone and lead, and the pivot ring gear with its motor and pinion in the skull.
- In these two sections every code part is hidden except the mouth. Other cutaways keep `cutOff` -0.25.

## v3.6 (12 Nov 2026): every section comes apart
- Paw, Hind leg (new) and Tail (new, with a servo, cable and boards in the segments): the code parts in the cut are
  sorted into five depth layers that slide out one after another (`buildExtract` in main.js, `xt` on the CUTS entry).
- Flank, Back and Jaw: built mechanisms in `bays.js`, like the eye: harness, battery, power board and control board
  step out in a staircase with the side plate lifted clear; vertebrae, cable trunk and coolant loop, copper actuators
  and saddle plates rise in layers; hinge motor, pistons, bite sensor and tooth rail come out below the head.
- Ear parts now move sideways as well as out, so they separate on screen.

## v3.7 (16 Nov 2026): the walk limp
- The walk looked like a limp on one leg. Cause: `running = (f - 1.6) / 1.0` was 0.1 at the walk's 1.7 Hz, so a tenth of the run was mixed in. The run's leg offsets pulled left and right 0.44 of a stride apart instead of 0.5, and its once-a-stride bob and nod made one side land harder. `running` now runs from the walk's rate (0) to the run's (1), and the walk's nod is twice a stride.
- Check a gait by logging each paw's world position and knee angle over a stride: the left and right legs must trace the same path half a stride apart.
