// Screenshots of the robot Cane Corso. BASE=http://localhost:8799 node tools/dogshot.mjs /tmp/shots desk,port overview,eye,teardown
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const require = createRequire(import.meta.url)
let pw; try { pw = require('playwright') } catch { pw = require('/opt/node-tools/node_modules/playwright') }
const [out = '/tmp/shots', sizes = 'desk', secs = 'overview', ffs = '2'] = process.argv.slice(2)
const BASE = process.env.BASE || 'http://localhost:8799'
const SIZES = { desk: [1440, 900, false], lap: [1280, 800, false], port: [390, 844, true], land: [844, 390, true] }
mkdirSync(out, { recursive: true })
const browser = await pw.chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
for (const s of sizes.split(',')) {
  const [width, height, phone] = SIZES[s]
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', (e) => errs.push('PAGE ' + e.message.split('\n')[0]))
  page.on('console', (m) => { if (m.type() === 'error' || /warn/i.test(m.type())) errs.push(m.type() + ' ' + m.text().slice(0, 300)) })
  await page.goto(`${BASE}/?still&notour${process.env.Q ? '&' + process.env.Q : ''}`, { waitUntil: 'load', timeout: 180000 })
  await page.waitForFunction(() => window.__corso, null, { timeout: 240000 })
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => __corso.scanReady)
  for (const sec of secs.split(',')) {
    await page.evaluate(async ([sec, ff]) => { __corso.go(sec); for (let i = 0; i < ff; i++) { __corso.ff(0.5); await new Promise(r => setTimeout(r, 30)) } __corso.settle() }, [sec, Number(process.env.FF || ffs) * 2])
    if (process.env.JS) await page.evaluate(process.env.JS)
    const f = `${out}/${sec}-${s}.png`
    await page.screenshot({ path: f, timeout: 600000 })
    console.log(f, 'parts', await page.evaluate(() => __corso.parts))
  }
  console.log(s, errs.length ? errs.join(' | ') : 'no console errors')
  await ctx.close()
}
await browser.close()
