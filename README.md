# Aja M-9, the robot Cane Corso

A robot Cane Corso you can take apart while it stands and walks: camera eyes, geared ears, the jaw, paws, the back, the flank's circuit, the hind leg, the tail, and the chassis box inside, then every part at once. Live at https://corso.amaete.com.

Static site, no build step. Three.js r160 is vendored in `vendor/three/`. Serve the folder (`python3 -m http.server 8799`) and open http://localhost:8799/.

- `index.html`, `main.js`: the page, the gait, the sections and the console.
- `dog.js`: the rig and the code-built parts. `scan.js` + `scan/`: the painted body (skinned mesh and its atlas).
- `cutmods.js` (eye, ear), `bays.js` (jaw, back, flank), `chassis.js` (the box inside): the cutaway close-ups.
- `tools/`: screenshot and walk-check scripts; `tools/corso/`: the Blender steps that made the painted body.
- `docs/HANDOFF.md`: the full build notes.

Deployed to the shared server by the noveniqe repo's 3D sites workflow (within 30 minutes of a push to `main`).
