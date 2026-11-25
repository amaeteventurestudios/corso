# Corso: working notes for Claude Code

Aja M-9, the robot Cane Corso, at corso.amaete.com. Moved out of the teardowns repo (`cane-corso/`) on 25 Nov 2026. Read `docs/HANDOFF.md` first.

- Static site, no build step. Three.js r160 vendored in `vendor/three/`; never load it from a CDN.
- Public content never mentions USG companies or Palasora. Invented brand (Aja M-9), no real makers' names.
- Phone-first: check 1280x800 and 390x844 (isMobile, hasTouch). Respect prefers-reduced-motion.
- Always run `tools/dog360.mjs` and `tools/dogwalk.mjs` before sending changes (the owner caught extra eyes and a limp before). Left and right legs must trace the same path half a stride apart.
- Headless SwiftShader is slow: open with `?still&notour` and call `__corso.render()` before screenshots.
- Deploy: the noveniqe repo's `deploy/sites3d/sites.json` entry `corso` copies this repo's `main` to the Oracle server.
