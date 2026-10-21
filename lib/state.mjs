/**
 * lib/state.mjs —— 插件的"家"与配置
 * ============================================================================
 * 规矩（抄 whale_craft）：**配置、凭证、报告、日志都放插件自己的家** ——
 * `$DSH_HOME/bili-duty/`，**绝不写进插件包目录**（装进 node_modules 后可能只读、升级也会被覆盖）。
 *
 * 还有一件小事但很要紧：vendored 的 `mcp_server.py` 里，凭证路径是
 * `Path(__file__).parent / "bili_credential.json"` —— 所以**运行时要把脚本拷到家目录里再跑**，
 * 这样凭证才会落在家的目录，而不是插件包里。
 * ============================================================================
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { homedir } from 'node:os'

/**
 * 谷时窗口（北京时间）—— 想改就改这一处。
 * ⭐ 官方口径（2026-09-10 起的新定价）：**高峰 = 工作日 9:00–12:00 与 14:00–18:00，其余全是谷时**
 *    ⇒ 12:00–14:00（夹在两个高峰之间）✓、18:00 之后的一整晚 ✓、以及**整个周末** ✓ 都便宜。
 * ⚠️ 我们原来写的 00:30–08:30 是 DeepSeek **早年**的错峰优惠时段，**已经过时** ✗
 *    —— 2026-10-14 使用者在"陌生人验收"里问「晚上峰谷真的是12点半才开始的吗」才查出来 ✓。
 */
export const WINDOWS = {
  noon: { label: '中午谷时', start: '12:00', end: '14:00' },
  night: { label: '晚上/夜间谷时', start: '18:00', end: '09:00' },
}

/**
 * ⭐ 2026-10-14 真机上踩到的坑（dsh 只留一句 `warning: 1 entry did not activate` + 堆栈）：
 *    `ctx.get('dshHomePath')` 返回的是**函数**，不是字符串！
 *    形状：`dshHomePath(...segments) => join(resolveDshHome(), ...segments)`（whale_craft 就是这么用的）。
 *    我一开始当字符串用（`String(p)`），路径就成了「函数源码 + \bili-duty」⇒ mkdir ENOENT ⇒ apply 抛错 ⇒ 插件不激活。
 */
export function stateDirOf(ctx) {
  let dir = ''
  try {
    const p = ctx?.get?.('dshHomePath')
    if (typeof p === 'function') {
      const v = p('bili-duty')                       // ← 函数形态：把目录名传进去
      if (v) dir = String(v)
    } else if (typeof p === 'string' && p) {
      dir = join(p, 'bili-duty')
    }
  } catch { /* 拿不到就用下面的兜底 */ }
  if (!dir) dir = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'bili-duty')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function readJson(file, fallback) {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return fallback }
}

export function writeJson(file, value) {
  writeFileSync(file, JSON.stringify(value, null, 2), 'utf8')
}

/** 首次运行：把 vendored 的脚本拷进家里（脚本变了就覆盖）。章程不在这里 —— 它走下面的 ensureCharter */
export function ensureHomeFiles(pluginDir, stateDir, log = () => {}) {
  const copies = [
    [join(pluginDir, 'vendor', 'bilibili-mcp', 'mcp_server.py'), join(stateDir, 'mcp_server.py'), true],
    [join(pluginDir, 'lib', 'asr.py'), join(stateDir, 'asr.py'), true],
  ]
  for (const [from, to, overwrite] of copies) {
    try {
      if (!existsSync(from)) { log(`缺文件：${from}`); continue }
      if (!overwrite && existsSync(to)) continue
      if (overwrite && existsSync(to) && readFileSync(from, 'utf8') === readFileSync(to, 'utf8')) continue
      copyFileSync(from, to)
      log(`已铺好：${to}`)
    } catch (e) { log(`铺 ${to} 失败：${e?.message ?? e}`) }
  }
}

/**
 * 值班章程（prompts/duty.md）放在哪一份 —— 家里那份优先，没有才用插件里那份。
 * （家里那份由下面的 ensureCharter 保证铺好）
 */
export function charterPath(pluginDir, stateDir) {
  const home = join(stateDir, 'duty.md')
  try { if (existsSync(home)) return home } catch { /* 兜底：用插件里那份 */ }
  return join(pluginDir, 'prompts', 'duty.md')
}

/**
 * ⭐ 值班章程怎么升级 —— 2026-10-17 审查里的 M6 就是这里。
 *    老规矩（index.js 里比 mtime）：家里那份比 shipped 新 ⇒ 听使用者的。听着合理，实际是一把**单向锁**：
 *    使用者只要改过章程一个字，家里那份就永远比 shipped 新 ⇒ 插件后续版本改进的章程
 *    （0.1.5 的注入防护、空输出定义恰好就写在章程里）**永远进不来** ✗。
 *    改成记账制 —— 上次铺的是哪一版（sha256）记在 charter.sha256：
 *      · 家里那份 === 我们上次铺的 ⇒ 他没动过 ⇒ 直接用 shipped 覆盖（升级 ✓）
 *      · 家里那份变过      ⇒ 他改过 ⇒ **一个字都不动**，新版另存 duty.md.new 让他自己合 ✓
 *      · 没有账本（带账本的第一个版本刚跑起来）⇒ 分不清「没改只是版本旧」和「改过」，
 *        按「改过」处理 —— 宁可让他手动合一次，也不能偷偷吃掉他的改动 ✓
 */
export function ensureCharter(pluginDir, stateDir, log = () => {}) {
  const shipped = join(pluginDir, 'prompts', 'duty.md')
  const home = join(stateDir, 'duty.md')
  const ledger = join(stateDir, 'charter.sha256')
  const fresh = join(stateDir, 'duty.md.new')
  const readIf = (f) => { try { return readFileSync(f, 'utf8') } catch { return '' } }
  try {
    if (!existsSync(shipped)) { log(`缺文件：${shipped}`); return }
    const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex')
    const newText = readFileSync(shipped, 'utf8')
    const hShip = sha(newText)
    const hLast = readIf(ledger).trim()
    if (!existsSync(home)) {
      writeFileSync(home, newText, 'utf8'); writeFileSync(ledger, hShip, 'utf8')
      log('已铺好值班章程')
      return
    }
    const hHome = sha(readFileSync(home, 'utf8'))
    if (hHome === hShip) {                              // 家里那份就是最新版（他可能只是没动过）
      if (hLast !== hShip) writeFileSync(ledger, hShip, 'utf8')
      return
    }
    if (!hLast || hHome !== hLast) {                    // 他改过（或没账本、分不清）⇒ 只另存新版
      if (hShip !== hLast && readIf(fresh) !== newText) {
        writeFileSync(fresh, newText, 'utf8')
        log(`值班章程有新版、但家里那份你改过 ⇒ 新版另存为 ${fresh}，自己合一下`)
      }
      return
    }
    writeFileSync(home, newText, 'utf8'); writeFileSync(ledger, hShip, 'utf8')   // 他没动过 ⇒ 直接升级
    log('值班章程已更新到插件里这一版')
  } catch (e) { log(`铺值班章程失败：${e?.message ?? e}`) }
}

/** 'HH:MM' → 当天的分钟数 */
function minutesOf(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * ⭐⭐ 2026-10-20（主人："别跟系统时间走，搞个本地计时模块，默认北京，我也能改时区"）：
 *   **插件自己算时区，完全不看系统时区**（这台机器可能被改成美国/别的国家，改了也不影响）。
 *   默认 `Asia/Shanghai`；用户在设置页改 `tz` 即可（任意 IANA 名字，比如 America/New_York）。
 *   实现：用 Intl.DateTimeFormat 把"此刻"投影到目标时区，读年/月/日/时/分。
 *   —— 不依赖系统时区设置，Windows/mac/Linux 行为一致。
 */
export const DEFAULT_TZ = 'Asia/Shanghai'

/** 当前生效的时区（插件自己的"本地计时模块"，默认北京；用户改了设置就换） */
let CURRENT_TZ = DEFAULT_TZ
export function setDefaultTz(tz) { CURRENT_TZ = normalizeTz(tz); return CURRENT_TZ }
export function currentTz() { return CURRENT_TZ }

/** 校验一个 IANA 时区名是否可用；不可用就退回默认 */
export function normalizeTz(tz) {
  const v = String(tz || '').trim()
  if (!v) return DEFAULT_TZ
  if (v === 'system') return 'system'            // ⭐ 2026-10-21：跟随系统时区（主人把系统改成北京了）
  try { new Intl.DateTimeFormat('en-US', { timeZone: v }) ; return v } catch { return DEFAULT_TZ }
}

/** 把"此刻"投影到目标时区，返回 {y,m,d,h,min}（全部是数字） */
export function zonedParts(now = new Date(), tz = CURRENT_TZ) {
  const zone = normalizeTz(tz)
  // ⭐ 跟随系统：直接用本地时间读数（系统现在就是北京）
  if (zone === 'system') {
    return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate(), h: now.getHours(), min: now.getMinutes() }
  }
  let parts
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).formatToParts(now)
  } catch {
    // 极端情况（Intl 挂了）：退回 UTC+8
    const shifted = new Date(now.getTime() + 8 * 3_600_000)
    return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate(), h: shifted.getUTCHours(), min: shifted.getUTCMinutes() }
  }
  const get = (t) => Number((parts.find((p) => p.type === t) || {}).value || 0)
  // hour '24' 的处理（en-CA 在部分平台会给 24）
  const h = get('hour') === 24 ? 0 : get('hour')
  return { y: get('year'), m: get('month'), d: get('day'), h, min: get('minute') }
}

/** 目标时区的 HH:MM（给日志/页面显示用） */
export function zonedTime(now = new Date(), tz = CURRENT_TZ) {
  const p = (n) => String(n).padStart(2, '0')
  const t = zonedParts(now, tz)
  return `${p(t.h)}:${p(t.min)}`
}

/** 现在在不在这个窗口里（**按配置的时区**判断；支持跨零点，比如 23:00–02:00） */
export function inWindow(now, win, tz = CURRENT_TZ) {
  const start = minutesOf(win.start); const end = minutesOf(win.end)
  if (start === null || end === null) return false
  const t = zonedParts(now, tz)
  const cur = t.h * 60 + t.min
  return start <= end ? (cur >= start && cur < end) : (cur >= start || cur < end)
}

/** 目标时区的日期 YYYY-MM-DD（报告文件名 / 每日额度都按这个算） */
export function dayKey(now = new Date(), tz = CURRENT_TZ) {
  const p = (n) => String(n).padStart(2, '0')
  const t = zonedParts(now, tz)
  return `${t.y}-${p(t.m)}-${p(t.d)}`
}

