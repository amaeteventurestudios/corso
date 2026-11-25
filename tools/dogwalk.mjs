// Walk or run frames from one camera angle: node tools/dogwalk.mjs walk|run <azimuth degrees>  (OUT=/tmp/walk)
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const pw = require('/opt/node-tools/node_modules/playwright')
const b = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const p = await b.newPage({ viewport: { width: 800, height: 600 } })
await p.goto('http://localhost:8799/?still&notour')
await p.waitForFunction(() => window.__corso)
await p.evaluate(() => __corso.scanReady)
const sec = process.argv[2] || 'walk', az = Number(process.argv[3] || 90)
await p.evaluate((sec) => { __corso.go(sec); __corso.ff(3) }, sec)
await p.addStyleTag({ content: '.ui,#callouts,svg{display:none!important}' })
const O = (process.env.OUT || '/tmp/walk') + '/'
const fs = await import('node:fs'); fs.mkdirSync(O, { recursive: true })
const f = sec === 'run' ? 2.6 : 1.6
for (let i = 0; i < 8; i++) {
  await p.evaluate(([dt, az]) => { __corso.ff(dt); const c = __corso.camera; c.fov = 22; c.updateProjectionMatrix(); const a = az * Math.PI / 180; c.position.set(Math.sin(a) * 4.2, 0.6, Math.cos(a) * 4.2); c.lookAt(0, 0.42, 0); __corso.render() }, [1 / f / 8, az])
  await p.screenshot({ path: `${O}${sec}${az}_${i}.png` })
}
await b.close()
