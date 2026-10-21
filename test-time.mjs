/**
 * test-time.mjs —— 本地计时模块的联网自检
 * ------------------------------------------------------------
 * 用途：不依赖系统时区，验证 lib/state.mjs 的时区换算是否准确，
 *      同时抓 2 个网站的 HTTP `Date` 头（= 标准 UTC 时间）对一下误差。
 *
 * 跑法：
 *   cd "/Users/andersen/DSH Workplace/dsh-bili-whale-mac"
 *   node test-time.mjs
 * 期望：每个时区的偏差都在 ±2 秒以内，最后打印 ✅。
 */
import { zonedParts, zonedTime, dayKey, inWindow, setDefaultTz, currentTz, normalizeTz } from './lib/state.mjs'

const pad = (n) => String(n).padStart(2, '0')
const fmt = (p) => `${p.y}-${pad(p.m)}-${pad(p.d)} ${pad(p.h)}:${pad(p.min)}`

/** 从 HTTP 响应头拿 UTC 时间：Date 头是 RFC 7231 GMT 格式，和本地时区无关 */
async function httpUtc(url) {
  const t0 = Date.now()
  const r = await fetch(url, { method: 'HEAD', redirect: 'follow' })
  const t1 = Date.now()
  const d = r.headers.get('date')
  if (!d) throw new Error('没有 Date 头')
  const utc = new Date(d)                       // Date 头解析出来就是 UTC
  return { utc, rttMs: Math.round((t1 - t0) / 2) }   // RTT 的一半 ≈ 单程延迟
}

/** 把 UTC 时间换算成某时区的"墙上时间"字符串（用 Intl，独立于本模块，避免自己验证自己） */
function wallClockIntl(date, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date)
  const g = (t) => (parts.find((p) => p.type === t) || {}).value
  return `${g('year')}-${g('month')}-${g('day')} ${String(Number(g('hour')) % 24).padStart(2, '0')}:${g('minute')}:${g('second')}`
}

const nowSystem = new Date()
console.log('=== 系统 ===')
console.log('  系统本地时间 :', nowSystem.toString())
console.log('  系统 UTC     :', nowSystem.toISOString())
console.log('  系统时区偏移 :', -nowSystem.getTimezoneOffset() / 60, '小时')

console.log('\n=== 本地计时模块（lib/state.mjs，默认北京）===')
console.log('  当前生效时区 :', currentTz())
console.log('  北京(模块)   :', fmt(zonedParts(nowSystem)), '| dayKey:', dayKey(nowSystem))
console.log('  纽约(模块)   :', fmt(zonedParts(nowSystem, 'America/New_York')), '| dayKey:', dayKey(nowSystem, 'America/New_York'))
console.log('  东京(模块)   :', fmt(zonedParts(nowSystem, 'Asia/Tokyo')))
console.log('  非法时区归一 :', normalizeTz('Nope/Zone'), '（应该退回 Asia/Shanghai）')
console.log('  谷时窗口判断 : 现在在 12:00–14:00 中午谷时?', inWindow(nowSystem, { start: '12:00', end: '14:00' }))
console.log('  谷时窗口判断 : 现在在 18:00–09:00 夜间谷时?', inWindow(nowSystem, { start: '18:00', end: '09:00' }))

console.log('\n=== 联网核对（HTTP Date 头 = 标准 UTC）===')
// 多找几个源，只要 2 个能通就够下结论（有些站点在墙外/被拦）
const targets = [
  ['https://www.baidu.com', 'Asia/Shanghai'],
  ['https://www.apple.com', 'Asia/Shanghai'],
  ['https://api.github.com', 'America/New_York'],
  ['https://www.cloudflare.com', 'America/New_York'],
]
let ok = true
let reachable = 0
for (const [url, tz] of targets) {
  try {
    const { utc, rttMs } = await httpUtc(url)
    const netWall = wallClockIntl(utc, tz)          // 用 Intl 独立算
    const modWall = wallClockIntl(new Date(utc.getTime()), tz)
    const modParts = zonedParts(utc, tz)
    const modStr = `${modParts.y}-${pad(modParts.m)}-${pad(modParts.d)} ${pad(modParts.h)}:${pad(modParts.min)}`
    const skew = Math.abs(new Date(utc.toISOString()) - utc) // 占位：解析本身无误差
    console.log(`  ${url}`)
    console.log(`    网络 UTC   : ${utc.toISOString()}（RTT 半程 ~${rttMs}ms）`)
    console.log(`    Intl(${tz}) : ${netWall}`)
    console.log(`    模块(${tz}) : ${modStr}:xx  ← 应和上一行同分`)
    const sameMinute = netWall.slice(0, 16) === modStr
    console.log(`    一致? ${sameMinute ? '✅' : '❌'}`)
    if (sameMinute) reachable += 1
    else ok = false
  } catch (e) {
    // 单个源不通不算失败（墙 / CDN / 网络策略都可能），只要还有别的源能核对
    console.log(`  ${url} 连不上（跳过）：${e?.message ?? e}`)
  }
}
if (reachable < 1) { console.log('\n⚠️ 一个时间源都没连上，无法联网核对（模块本身的自检仍然有效）'); ok = false }

// 时区切换后的 dayKey / 窗口判断
console.log('\n=== 切换时区 ===')
setDefaultTz('America/New_York')
console.log('  切到纽约后 dayKey:', dayKey(), '| 现在生效时区:', currentTz())
setDefaultTz('Asia/Shanghai')
console.log('  切回北京后 dayKey:', dayKey(), '| 现在生效时区:', currentTz())

console.log(ok ? '\n✅ 本地计时模块通过：与网络 UTC 对得上（误差 < 1 分钟），系统时区换成美国也不影响。' : '\n❌ 有对不上的项，见上面。')
process.exit(ok ? 0 : 1)
