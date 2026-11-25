// 360 of the Cane Corso: node tools/dog360.mjs <out> <size> <section> <targetY> <dist> [n] [ff]
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let pw; try { pw = require('playwright') } catch { pw = require('/opt/node-tools/node_modules/playwright') }
const [out = '/tmp/360', size = 'desk', sec = 'eye', ty = '0.6', dist = '1.2', n = '8', ff = '1', tx = '0.45'] = process.argv.slice(2)
const BASE = process.env.BASE || 'http://localhost:8799'
const SIZES = { desk: [1440, 900, false], port: [390, 844, true] }
mkdirSync(out, { recursive: true })
const browser = await pw.chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const [width, height, phone] = SIZES[size]
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGE', e.message))
await page.goto(`${BASE}/?still&notour`, { waitUntil: 'load', timeout: 180000 })
await page.waitForFunction(() => window.__corso, null, { timeout: 240000 })
await page.evaluate(() => __corso.scanReady)
await page.evaluate(async ([sec, ff]) => { __corso.go(sec); for (let i = 0; i < ff * 2; i++) { __corso.ff(0.5); await new Promise(r => setTimeout(r, 30)) } }, [sec, Number(ff)])
await page.addStyleTag({ content: '.ui,.callouts,svg.decor,#callouts{display:none!important}' })
for (let i = 0; i < Number(n); i++) {
  const az = (i / Number(n)) * Math.PI * 2
  await page.evaluate(([az, ty, d, tx]) => { const c = __corso.camera; c.position.set(tx + Math.cos(az) * d, ty + 0.15 * d, Math.sin(az) * d); c.lookAt(tx, ty, 0); c.updateMatrixWorld(); __corso.render() }, [az, Number(ty), Number(dist), Number(tx)])
  await page.screenshot({ path: `${out}/${String(i).padStart(2, '0')}.png` })
}
await browser.close()
