/**
 * dsh-bili-whale —— 浏览器半端（**设置在「设置」里的一页**）
 * ============================================================================
 * ⭐ **client bundle 不是 ESM，是自注册脚本**（2026-10-14 从官方包里挖到的约定）：
 *
 *     window.__ModuleLoader__.load({
 *       id: '<包名>',                       // 必须等于 package.json 的 name
 *       factory: (require) => { ... return { inject: [...], apply(ctx) {...} } },
 *     })
 *
 * ⭐ **怎么进「设置」**（抄第三方插件 `dsh-meme/client.js`，2026-10-14 使用者指出位置不对后才查到）：
 *
 *     const slots = ctx.get('slots')
 *     slots.inject('settings.section', () => slots.register(
 *       { name: 'settings.section', id: 'bili-whale', order: 30, label: '刷B站' },   // label = 左侧导航那一项
 *       () => h(Panel),
 *     ))
 *
 *   ⇒ **别自己糊一个标题栏按钮 + 全屏 overlay** ✗（第一版就是这么干的，使用者一眼看出"跟别的插件不一样"）。
 *
 * 这一页要满足使用者 2026-10-14 说的形状：
 *   · **总开关 → 打开之后下面才展开子开关**（峰谷自动刷 → 中午 / 晚上）
 *   · **数字项要能自己填**（定量刷：每天几条）
 *   · **账号绑定必须在设置页里**（扫码登录 + 二维码直接显示在页里）
 *   · 会发东西出去的（自动评论）、要下大模型的（本地转写）**默认关**
 * ============================================================================
 */
window.__ModuleLoader__.load({
  id: 'dsh-bili-whale',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    const API = '/api/bili-duty'
    /* ⚠️ 原来 jget/jpost 直接 .json()、从不看 res.ok ⇒ HTTP 500 的 {ok:false,error}
     *    会被调用方当成「已保存 / 成功」，绿色提示把故障盖掉。（2026-10-16 审查修） */
    const asJson = async (res) => {
      if (res.ok) return res.json()
      const why = res.status === 401 ? '（未登录 / 没权限）' : res.status === 403 ? '（被宿主拦了）' : ''
      throw new Error('HTTP ' + res.status + why)
    }
    const jget = async (p) => asJson(await fetch(API + p, { credentials: 'same-origin' }))
    const jpost = async (p, body) => asJson(await fetch(API + p, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
    }))

    const CSS = `
[data-bili-entry]{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.25));background:transparent;cursor:pointer;font-size:15px;line-height:1;padding:0;margin-right:2px}
[data-bili-entry]:hover{background:var(--dsw-alias-fill-l2,rgba(128,128,128,.12))}
/* ⭐ 2026-10-22（主人：面板黑底黑字看不清）—— 用系统色跟着主题走：
   背景 Canvas / 文字 CanvasText 会自动跟随根元素的 color-scheme（DSH 白天/黑夜都会设），
   白天=白底黑字，晚上=深底浅字，不用知道 DSH 内部变量名也能对。 */
[data-bili-fab],[data-bili-panel]{color-scheme:inherit;}
[data-bili-fab]{position:fixed;left:18px;bottom:18px;width:40px;height:40px;border-radius:50%;z-index:9998;display:flex;align-items:center;justify-content:center;padding:0;font-size:18px;line-height:1;cursor:pointer;border:1px solid color-mix(in srgb, CanvasText 22%, Canvas);background:Canvas;color:CanvasText;box-shadow:0 6px 20px color-mix(in srgb, CanvasText 18%, transparent)}
[data-bili-fab]:hover{background:color-mix(in srgb, CanvasText 10%, Canvas)}
[data-bili-panel]{position:fixed;width:396px;max-width:calc(100vw - 24px);max-height:min(66vh,580px);overflow:auto;z-index:9999;background:Canvas;color:CanvasText;border:1px solid color-mix(in srgb, CanvasText 22%, Canvas);border-radius:14px;box-shadow:0 12px 40px color-mix(in srgb, CanvasText 22%, transparent);padding:12px;font-size:12px;line-height:1.5}
[data-bili-panel] .bp-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
[data-bili-panel] .bp-title{font-weight:600;font-size:13px}
[data-bili-panel] .bp-tabs{display:flex;gap:6px;margin-bottom:8px}
[data-bili-panel] .bp-tab{padding:3px 10px;border-radius:999px;border:1px solid color-mix(in srgb, CanvasText 22%, Canvas);background:transparent;cursor:pointer;font-size:12px;color:inherit}
[data-bili-panel] .bp-tab.on{background:color-mix(in srgb, CanvasText 16%, Canvas);font-weight:600}
[data-bili-panel] .bp-row{display:flex;align-items:flex-start;gap:6px;padding:6px 0;border-bottom:1px dashed color-mix(in srgb, CanvasText 16%, Canvas)}
[data-bili-panel] .bp-row:last-child{border-bottom:0}
[data-bili-panel] .bp-body{flex:1;min-width:0;word-break:break-word}
[data-bili-panel] .bp-note{color:color-mix(in srgb, CanvasText 62%, Canvas);font-size:11px}
[data-bili-panel] .bp-btn{border:1px solid color-mix(in srgb, CanvasText 22%, Canvas);background:transparent;color:inherit;border-radius:7px;padding:2px 8px;font-size:11px;cursor:pointer;white-space:nowrap}
[data-bili-panel] .bp-btn:hover{background:color-mix(in srgb, CanvasText 10%, Canvas)}
[data-bili-panel] .bp-btn.primary{border-color:LinkText;color:LinkText}
[data-bili-panel] .bp-timer{font-variant-numeric:tabular-nums;font-weight:600;color:LinkText}
[data-bili-panel] a{color:LinkText;text-decoration:none}
[data-bili-panel] input.bp-in{flex:1;min-width:0;background:color-mix(in srgb, CanvasText 4%, Canvas);border:1px solid color-mix(in srgb, CanvasText 24%, Canvas);border-radius:7px;padding:3px 7px;color:CanvasText;font-size:12px}
[data-bili-panel] input.bp-in::placeholder{color:color-mix(in srgb, CanvasText 45%, Canvas)}
[data-bd-page]{display:flex;flex-direction:column;gap:24px;padding:4px 2px 18px;max-width:760px;font-size:13px;}
[data-bd-sec]{display:flex;flex-direction:column;gap:12px;padding-bottom:22px;
  border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.16));}
[data-bd-sec]:last-child{border-bottom:0;padding-bottom:4px;}
[data-bd-h]{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;
  color:var(--dsw-alias-label-tertiary,#8a8f98);}
[data-bd-row]{display:flex;align-items:center;gap:12px;min-width:0;}
[data-bd-grow]{flex:1 1 auto;min-width:0;}
[data-bd-label]{font-size:13px;line-height:19px;overflow-wrap:anywhere;}
[data-bd-note]{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary,#8a8f98);overflow-wrap:anywhere;}
[data-bd-sw]{flex:none;width:38px;height:22px;border-radius:11px;border:0;cursor:pointer;position:relative;
  background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.32));transition:background .15s;padding:0;}
[data-bd-sw][data-on]{background:#3b82f6;}
[data-bd-sw] i{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;
  transition:left .15s;display:block;}
[data-bd-sw][data-on] i{left:19px;}
[data-bd-sw][disabled]{opacity:.45;cursor:default;}
[data-bd-sub]{margin-left:16px;padding-left:14px;border-left:2px solid var(--dsw-alias-border-l2,rgba(128,128,128,.14));
  display:flex;flex-direction:column;gap:12px;}
[data-bd-input]{box-sizing:border-box;padding:7px 10px;border-radius:8px;font-size:12px;width:auto;min-width:0;
  border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.28));
  background:transparent;color:inherit;font-family:inherit;}
[data-bd-input]:focus{outline:none;border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.14);}
select[data-bd-input]{max-width:320px;flex:0 1 auto;}
[data-bd-input][data-bd-num]{width:96px;text-align:center;flex:none;}
[data-bd-input][data-bd-wide]{width:100%;flex:1 1 auto;}
[data-bd-btn]{padding:7px 13px;border-radius:8px;font-size:12px;cursor:pointer;font-family:inherit;
  border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));background:transparent;color:inherit;
  transition:background .12s,border-color .12s;}
[data-bd-btn]:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));}
[data-bd-btn][data-primary]{background:#3b82f6;border-color:#3b82f6;color:#fff;}
[data-bd-btn][disabled]{opacity:.45;cursor:default;}
[data-bd-msg]{font-size:11px;line-height:17px;padding:8px 10px;border-radius:8px;word-break:break-word;
  border-left:3px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));color:var(--dsw-alias-label-secondary,inherit);}
[data-bd-msg][data-warn]{border-left-color:#f59e0b;color:#f59e0b;}
[data-bd-msg][data-good]{border-left-color:#22c55e;color:#22c55e;}
[data-bd-qr]{display:flex;gap:16px;align-items:flex-start;}
[data-bd-qr] img{width:150px;height:150px;border-radius:10px;background:#fff;padding:6px;}
[data-bd-pre]{margin:6px 0 0;padding:9px 10px;border-radius:8px;max-height:170px;overflow:auto;font-size:11px;
  line-height:16px;white-space:pre-wrap;word-break:break-word;
  background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.10));color:var(--dsw-alias-label-secondary,inherit);}
[data-bd-kv]{font-size:11px;line-height:19px;color:var(--dsw-alias-label-tertiary,#8a8f98);word-break:break-all;}
[data-bd-badge]{font-size:11px;padding:2px 8px;border-radius:999px;white-space:nowrap;
  border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.25));color:var(--dsw-alias-label-secondary,inherit);}
[data-bd-cmt]{display:flex;flex-direction:column;gap:4px;padding:9px 0;
  border-bottom:1px dashed var(--dsw-alias-border-l2,rgba(128,128,128,.16));}
[data-bd-cmt]:last-child{border-bottom:0;}
[data-bd-cmt] a{color:#3b82f6;text-decoration:none;font-size:11px;white-space:nowrap;}
[data-bd-cmt] a:hover{text-decoration:underline;}
[data-bd-ok]{color:#22c55e;font-size:11px;}
[data-bd-no]{color:#f59e0b;font-size:11px;}
[data-bd-idle]{color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:11px;}
[data-bd-live] .bd-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;flex:none;}
[data-bd-live] .bd-dot.run{background:#3b82f6;box-shadow:0 0 0 0 rgba(59,130,246,.6);animation:bd-pulse 1.6s infinite;}
@keyframes bd-pulse{0%{box-shadow:0 0 0 0 rgba(59,130,246,.55)}70%{box-shadow:0 0 0 8px rgba(59,130,246,0)}100%{box-shadow:0 0 0 0 rgba(59,130,246,0)}}
[data-bd-live] .bd-timer{font-variant-numeric:tabular-nums;font-weight:600;font-size:13px;}
[data-bd-task]{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px dashed var(--dsw-alias-border-l2,rgba(128,128,128,.14));font-size:12px;}
[data-bd-task]:last-child{border-bottom:0;}
[data-bd-task] .bd-ico{width:16px;text-align:center;flex:none;}
[data-bd-task] .bd-dur{margin-left:auto;color:var(--dsw-alias-label-tertiary,#8a8f98);font-size:11px;font-variant-numeric:tabular-nums;white-space:nowrap;}
[data-bd-top]{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;border-radius:12px;
  border:1px solid rgba(59,130,246,.28);background:rgba(59,130,246,.07);}
[data-bd-top] [data-bd-badge]{font-size:12px;padding:3px 9px;}
[data-bd-md]{font-size:12px;line-height:21px;max-height:460px;overflow:auto;padding:4px 2px;}
[data-bd-md] h2,[data-bd-md] h3,[data-bd-md] h4{margin:12px 0 4px;line-height:1.45;}
[data-bd-md] h2{font-size:15px;}
[data-bd-md] h3{font-size:13px;color:#3b82f6;}
[data-bd-md] h4{font-size:12px;}
[data-bd-md] p{margin:5px 0;}
[data-bd-md] ul,ol{margin:4px 0 8px 20px;padding:0;}
[data-bd-md] li{margin:3px 0;}
[data-bd-md] a{color:#3b82f6;text-decoration:none;}
[data-bd-md] a:hover{text-decoration:underline;}
[data-bd-md] code{padding:1px 5px;border-radius:5px;background:rgba(128,128,128,.18);font-size:11px;}
[data-bd-md] hr{border:0;border-top:1px solid rgba(128,128,128,.2);margin:12px 0;}
[data-bd-quote]{color:var(--dsw-alias-label-tertiary,#8a8f98);border-left:2px solid rgba(59,130,246,.45);padding-left:9px;}
`

    // ⚠️ 与 lib/state.mjs 的 WINDOWS 保持一致（官方口径：工作日 9–12、14–18 是高峰，其余都是谷时）
    const DEFAULT_WINDOWS = {
      noon: { label: '中午谷时', start: '12:00', end: '14:00' },
      night: { label: '晚上/夜间谷时', start: '18:00', end: '09:00' },
    }

    // ⭐ 插件自己的时区：默认北京，可在设置里改（系统时区改了也不影响）
    const TZ_OPTIONS = [
      ['system', '跟随系统时间（推荐）'],
      ['Asia/Shanghai', '北京（固定）'],
      ['Asia/Tokyo', '东京'],
      ['Asia/Singapore', '新加坡'],
      ['America/New_York', '纽约'],
      ['America/Los_Angeles', '洛杉矶'],
      ['Europe/London', '伦敦'],
      ['Europe/Berlin', '柏林'],
      ['UTC', 'UTC'],
    ]

    /* ⭐ v0.2.7 评论区互动总模式（契约 docs/own-comments.md 第六节）：
       三段按钮里每一个都要把差别写出来 —— 不然用户以为「关掉别人」和「全关」是一回事。
       默认 own（config 里还没有这个字段时也按 own 算，见 Panel 里的 cScope）。 */
    const COMMENT_SCOPES = [
      ['own', '只回我的评论区（推荐）', '别人评论区完全不动'],
      ['both', '我的 + 别人（别人最多一句）', '别人评论区放开，但每个视频最多一句'],
      ['off', '都关（只写报告）', '评论区一个字不说（报告照写、私信照发）'],
    ]

    const tzOf = (cfgObj) => (cfgObj && cfgObj.tz) || 'Asia/Shanghai'
    const tzLabel = (tz) => (tz === 'system' ? '系统' : tz === 'Asia/Shanghai' ? '北京' : String(tz || '').split('/').pop() || 'UTC')
    const bjClock = (ts, tz) => {
      try {
        const d = new Date(Number(ts))
        if (!Number.isFinite(d.getTime())) return ''
        return d.toLocaleTimeString('zh-CN', { timeZone: tz || 'Asia/Shanghai', hour12: false }).slice(0, 8)
      } catch { return '' }
    }

    // ⭐ 极简 Markdown 渲染（日报原来是一坨纯文本，看不太清；这里把标题/链接/加粗/列表渲染出来）
    function renderMarkdown(src) {
      const lines = String(src || '').split(/\r?\n/)
      const nodes = []
      let list = null
      let inCode = false
      let codeBuf = []
      const inline = (t) => {
        const parts = []
        const re = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g
        let m; let last = 0; let k = 0
        while ((m = re.exec(t))) {
          if (m.index > last) parts.push(t.slice(last, m.index))
          if (m[1] !== undefined) parts.push(h('a', { key: 'a' + (k++), href: m[2], target: '_blank', rel: 'noreferrer' }, m[1]))
          else if (m[3] !== undefined) parts.push(h('strong', { key: 'b' + (k++) }, m[3]))
          else parts.push(h('code', { key: 'c' + (k++) }, m[4]))
          last = re.lastIndex
        }
        if (last < t.length) parts.push(t.slice(last))
        return parts.length ? parts : t
      }
      const pushList = () => { if (list) { nodes.push(h('ul', { key: 'ul' + nodes.length }, list)); list = null } }
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (inCode) {
          if (/^```/.test(line)) { inCode = false; pushList(); nodes.push(h('pre', { key: 'code' + i, 'data-bd-pre': '' }, codeBuf.join('\n'))); codeBuf = [] }
          else codeBuf.push(line)
          continue
        }
        if (/^```/.test(line)) { inCode = true; continue }
        const hd = /^(#{1,4})\s+(.*)$/.exec(line)
        if (hd) {
          pushList()
          const lvl = hd[1].length
          nodes.push(h(lvl <= 2 ? 'h2' : lvl === 3 ? 'h3' : 'h4', { key: 'h' + i }, inline(hd[2])))
          continue
        }
        if (/^\s*[-*]\s+/.test(line)) { if (!list) list = []; list.push(h('li', { key: 'li' + i }, inline(line.replace(/^\s*[-*]\s+/, '')))); continue }
        if (/^\s*$/.test(line)) { pushList(); continue }
        if (/^>\s?/.test(line)) { pushList(); nodes.push(h('p', { key: 'q' + i, 'data-bd-quote': '' }, inline(line.replace(/^>\s?/, '')))); continue }
        if (/^---+\s*$/.test(line)) { pushList(); nodes.push(h('hr', { key: 'hr' + i })); continue }
        nodes.push(h('p', { key: 'p' + i }, inline(line)))
      }
      pushList()
      return nodes
    }

    /* ────────────── 小组件 ────────────── */

    function Switch({ on, onChange, disabled }) {
      return h('button', {
        'data-bd-sw': '',
        'data-on': on ? '' : undefined,
        disabled: Boolean(disabled),
        title: on ? '已开' : '已关',
        onClick: () => { if (!disabled) onChange(!on) },
      }, h('i'))
    }

    function ToggleRow({ label, note, on, onChange, disabled }) {
      return h('div', { 'data-bd-row': '' },
        h('div', { 'data-bd-grow': '' },
          h('div', { 'data-bd-label': '' }, label),
          note ? h('div', { 'data-bd-note': '' }, note) : null),
        h(Switch, { on, onChange, disabled }))
    }

    function useStatus(intervalMs) {
      const [st, setSt] = React.useState(null)
      // ⭐ 2026-10-19（用户报"没有开关这一项，只能让 ai 帮我开"）：读不到配置时界面只显示"读设置中…"，
      //    用户会以为是开关坏了 ✗ ⇒ 数一下连续失败次数，交给界面把话说清楚（版本太旧 / 没重启 / 读不到）
      const [fails, setFails] = React.useState(0)
      React.useEffect(() => {
        let alive = true
        const tick = async () => {
          try {
            const d = await jget('/status')
            if (!alive) return
            if (d && d.ok) { setSt(d); setFails(0) } else setFails((n) => n + 1)
          } catch { if (alive) setFails((n) => n + 1) }
        }
        tick()
        const t = setInterval(tick, intervalMs || 5000)
        return () => { alive = false; clearInterval(t) }
      }, [intervalMs])
      return [st, setSt, fails]
    }

    /* ────────────── 设置页正文 ────────────── */

    function Panel() {
      const [st, setSt, fails] = useStatus(5000)
      const [busy, setBusy] = React.useState('')
      const [msg, setMsg] = React.useState('')
      const [msgTone, setMsgTone] = React.useState('')
      // ⭐ 评论看板：挂载时拉一次，之后每 10 秒自己刷新（都是本机文件，几乎不花钱）
      React.useEffect(() => {
        let alive = true
        const loadModels = async () => { try { const d = await jget('/models'); if (alive && d && d.ok) setModels(d) } catch { /* 读不到就用兜底 */ } }
        loadModels()
        const load = async () => { try { const d = await jget('/comments'); if (alive && d && d.ok) setCmts(d) } catch { /* 看板读不到不影响别的 */ } }
        load()
        const t = setInterval(load, 10000)
        return () => { alive = false; clearInterval(t) }
      }, [])
      const [kws, setKws] = React.useState(null)
      const [ws, setWs] = React.useState(null)
      const [rl, setRl] = React.useState(null)
      const [newVer, setNewVer] = React.useState('')       // 发现的新版本号（空 = 没发现）          // 日报形态：full / brief / off
      // ⚠️ 输入框必须绑"本地草稿"：页面每 5 秒轮询 /status，服务端那份会把 config 盖掉
      //    ⇒ 直接绑 cfg 的话，用户打字打到一半就被冲没了 ✗（2026-10-14 陌生人验收时抓到）
      const [perDay, setPerDay] = React.useState(null)
      // ⭐ macOS 适配（2026-10-20）：常驻循环的两个间隔（本地草稿，失焦保存）
      const [pollSec, setPollSec] = React.useState(null)
      const [loopMin, setLoopMin] = React.useState(null)
      const [playTech, setPlayTech] = React.useState(null)
      const [playFun, setPlayFun] = React.useState(null)
      const [manualMax, setManualMax] = React.useState(null)
      const [proEvery, setProEvery] = React.useState(null)
      const [proRun, setProRun] = React.useState(null)
      const [proDay, setProDay] = React.useState(null)
      const [proKw, setProKw] = React.useState(null)
      const [blacklistDraft, setBlacklistDraft] = React.useState(null)
      // ⭐ 这边跑一轮用哪个模型 / 什么强度（和主界面分开，方便主界面开 max、这边省钱）
      const [dutyModel, setDutyModel] = React.useState(null)
      const [nightSec, setNightSec] = React.useState(null)
      const [catchHours, setCatchHours] = React.useState(null)
      const [hotSec, setHotSec] = React.useState(null)
      const [dmNotifyUid, setDmNotifyUid] = React.useState(null)
      const [ownerUidDraft, setOwnerUidDraft] = React.useState(null)
      const [mentionNameDraft, setMentionNameDraft] = React.useState(null)
      // ⭐ v0.2.7 评论区互动（我的 / 别人的）：也都是"本地草稿"——页面每 5 秒轮询 /status，
      //    直接绑 cfg 的话用户打字打到一半就被服务端那份冲掉了（和上面几个输入框同一个道理）。
      const [ownEvery, setOwnEvery] = React.useState(null)          // 多久扫一次（分钟）
      const [ownVideos, setOwnVideos] = React.useState(null)        // 每次扫几条视频的评论区
      const [ownPerRun, setOwnPerRun] = React.useState(null)        // 每次最多回几条
      const [ownPerDay, setOwnPerDay] = React.useState(null)        // 每天最多回几条（0 = 不回）
      const [bubbleDay, setBubbleDay] = React.useState(null)        // 每天最多冒泡几条
      const [otherMax, setOtherMax] = React.useState(null)          // 别人评论区最多互动几句
      const [pinnedDraft, setPinnedDraft] = React.useState(null)    // 指定视频的输入框
      const [pinnedRes, setPinnedRes] = React.useState(null)        // 上次「保存并查找」的返回 { resolved, error }
      // ⭐ 实时任务面板：默认折叠，只在有任务时显示"正在跑"；展开能看最近 20 条
      const [showTasks, setShowTasks] = React.useState(false)
      const [nowTs, setNowTs] = React.useState(Date.now())
      React.useEffect(() => {
        const t = setInterval(() => setNowTs(Date.now()), 1000)
        return () => clearInterval(t)
      }, [])
      // ⭐ 宿主 llm 目录（新模型上线，下拉里自动出现）
      const [models, setModels] = React.useState(null)
      // ⭐ 两本日记（给主人看的 / 私人的）
      const [diary, setDiary] = React.useState(null)   // { which, text, file }
      const [perRound, setPerRound] = React.useState(null)
      const [replyPer, setReplyPer] = React.useState(null)
      const [dmUid, setDmUid] = React.useState(null)        // 私信收件人 UID（本地草稿）
      const [dmMode, setDmMode] = React.useState(null)      // 投递方式：off / only / both
      const [mention, setMention] = React.useState(null)
      const [login, setLogin] = React.useState(null)
      const [runNote, setRunNote] = React.useState(null)
      const [report, setReport] = React.useState(null)        // 非 null = 报告已展开   // 顶部那行状态（跑一轮/装依赖的反馈原来在最底下，看不见）
      // ⭐ macOS 适配（2026-10-20）：最近发出去的评论 + 复核状态（以前页面上完全看不到，只能去 B站 翻）
      const [cmts, setCmts] = React.useState(null)
      const [loginState, setLoginState] = React.useState('')
      const [loginTone, setLoginTone] = React.useState('')
      /* ⚠️ 扫码轮询的 timer 必须能停：切走设置页后还在跑的话会在已卸载的组件上 setState，
       *    重复点「扫码登录」还会叠出第二个 timer。（2026-10-16 审查修） */
      const loginTimer = React.useRef(null)
      const alive = React.useRef(true)
      React.useEffect(() => () => {
        alive.current = false
        if (loginTimer.current) { clearInterval(loginTimer.current); loginTimer.current = null }
      }, [])

      const cfg = st?.config
      React.useEffect(() => {
        if (cfg && kws === null) setKws((cfg.keywords || []).join('\n'))
        if (cfg && ws === null) setWs(cfg.workspace || '')
        if (cfg && rl === null) setRl(cfg.reportLevel || 'full')
        if (cfg && perDay === null) setPerDay(String(cfg.perDay ?? 5))
        if (cfg && perRound === null) setPerRound(String(cfg.commentPerRound ?? 1))
        if (cfg && replyPer === null) setReplyPer(String(cfg.replyPerRound ?? 1))
        if (cfg && mention === null) setMention(cfg.mentionName || '')
        if (cfg && dmUid === null) setDmUid(cfg.dmUid ? String(cfg.dmUid) : '')
        if (cfg && dmMode === null) setDmMode(cfg.dmMode || 'off')
      }, [cfg])

      const win = { ...DEFAULT_WINDOWS, ...(st?.windows || {}) }

      const say = (text, tone) => {
        setMsg(text); setMsgTone(tone || '')
        setRunNote(text ? { t: text, tone: tone || '' } : null)   // ⭐ 同时镜像到顶部，免得提示掉到页面最底下看不见
      }

      const patch = async (p, what) => {
        setBusy(JSON.stringify(p))
        try {
          const r = await jpost('/config', p)
          if (r?.config) setSt((old) => ({ ...old, config: r.config }))
          // ⭐ DSH 原生设置页里显式设过的键由宿主说了算 ⇒ 我们这份也得写进去；写失败要说出来，别假装"已保存"
          if (r?.host && r.host.ok === false) say(`${what || '设置'}：插件自己那份存了，但 DSH 设置页那份没写进去（${r.host.error}）`, 'warn')
          else say(what ? `${what}：已保存` : '已保存', 'good')
        } catch (e) { say(String(e?.message ?? e), 'warn') }
        finally { setBusy('') }
      }

      const onShowReport = async () => {
        if (report !== null) { setReport(null); return }       // 再点一次收起
        setBusy('report')
        try {
          const r = await jget('/report')
          setReport(r && r.exists ? (r.text || '（报告是空的）') : '今天还没有报告 —— 跑一轮之后就有了')
        } catch (e) { setReport('读不到报告：' + String(e?.message ?? e)) } finally { setBusy('') }
      }

      // ⭐ 复核评论：接口回"发送成功"≠ 公开可见（新号/风控会进审核，那时候连 @ 都不会推）
      //    所以让宿主真去拉一次评论列表 / 楼中楼，确认那条到底在不在。
      const onVerify = async () => {
        setBusy('verify')
        try {
          const r = await jpost('/verify', {})
          if (!r || !r.ok) { say('复核没跑成：' + ((r && r.error) || '未知原因'), 'warn'); return }
          const n = (r.checked || []).length
          const vis = (r.checked || []).filter((c) => c.visible === true).length
          if (!n) say(r.text || '没有需要复核的记录', 'good')
          else say(`复核完 ${n} 条：公开可见 ${vis} 条，其余「没查到」（可能还在审核 —— 看不到不等于没发出去）。结果也追加到今天的报告末尾了。`, vis ? 'good' : 'warn')
          if (r.report) setReport(null)
          try { const d = await jget('/comments'); if (d && d.ok) setCmts(d) } catch { /* 看板刷新失败不影响复核结论 */ }
        } catch (e) { say(String(e?.message ?? e), 'warn') } finally { setBusy('') }
      }

      const copyText = async (text) => {
        const v = String(text || '')
        try {
          await navigator.clipboard.writeText(v)
          say('已复制：' + v, 'good')
        } catch {
          say('复制失败 —— 路径是：' + v)       // 兜底：至少把路径显示出来，手动选中也能复制
        }
      }

      const onOpenFolder = async (what) => {
        try {
          const r = await jpost('/open', { what })
          if (r && r.ok) say('已请系统打开：' + (r.opened || '') + '（要是没看到窗口，用旁边的「复制报告路径」——那个一定成）', 'good')
          else say('打不开（' + ((r && r.error) || '未知原因') + '）—— 你可以手动打开这个路径：' + ((r && r.dir) || ''))
        } catch (e) { say(String(e?.message ?? e), 'warn') }
      }

      const onDiary = async (which) => {
        setBusy('diary')
        try {
          const r = await jget('/diary?which=' + encodeURIComponent(which))
          setDiary({ which, text: (r && r.text) || '（这本日记还是空的 —— 让它跑一轮，它就会写进去了）', file: (r && r.file) || '' })
        } catch (e) { say(String(e?.message ?? e), 'warn') } finally { setBusy('') }
      }

      const onUpgrade = async () => {
        setBusy('upgrade')
        try {
          const r = await jpost('/upgrade', {})
          // 原来这两句分两次 say，第二句把服务端的 hint 冲掉了 —— 合成一句。（2026-10-16 审查修）
          say(((r && r.hint) || '正在升级') + ' —— 升级过程写在下面的「主依赖的日志」里；完了记得重启一次 dsh（不重启还是旧版）', 'warn')
        } catch (e) { say(String(e?.message ?? e), 'warn') } finally { setBusy('') }
      }

      const onCheckUpdate = async () => {
        setBusy('update')
        try {
          const r = await jget('/update')
          if (r && r.ok && r.latest) {
            const from = r.source === 'github' ? '（npm 上还没发上去，这个版本来自 GitHub）' : ''
            if (r.hasNew) {
              setNewVer(r.latest)
              say('有新版 v' + r.latest + '（你的是 v' + r.current + '）' + from + ' —— 点右边的「一键升级」，完了重启一次 dsh', 'warn')
            } else say('已经是最新版 v' + r.current + from, 'good')
          } else {
            say('查不到最新版（可能网络不通）—— 你现在的版本是 v' + ((r && r.current) || '?'))
          }
        } catch (e) { say(String(e?.message ?? e), 'warn') } finally { setBusy('') }
      }

      const onCheck = async () => {
        setBusy('check')
        say('')
        try {
          const r = await jpost('/check', {})
          if (r && r.ok) say('能用！' + (r.steps || []).join('、'))
          else say('还不能用：' + (r && r.error ? r.error : '没拿到结果'))
        } catch (e) { say(String(e?.message ?? e), 'warn') } finally { setBusy('') }
      }

      const onInstallAsr = async () => {
        setBusy('asr')
        say('')
        try {
          const r = await jpost('/install-asr', {})
          say(r?.started ? '开始装转写依赖 —— 进度显示在下面（要下模型，慢一点正常）' : (r?.hint || '没起来'),
            r?.started ? 'good' : 'warn')
        } catch (e) { say(String(e?.message ?? e), 'warn') } finally { setBusy('') }
      }

      const onInstall = async () => {
        setBusy('install')
        say('')
        try {
          const r = await jpost('/install', {})
          say(r?.hint || '已经在后台开始装了', '')
        } catch (e) { say(String(e?.message ?? e), 'warn') }
        finally { setBusy('') }
      }

      const onRun = async () => {
        setBusy('run')
        try {
          const r = await jpost('/run', {})
          // ⭐ macOS 适配（2026-10-20）：以前宿主恒回 ok:true，哪怕压根没起来也显示"已经在跑"。
          //    现在起没起来、为什么没起来，都直接写在页面上。
          if (r?.started) say('已开跑（后台）。进度会自动刷新，跑完这里会显示结果；报告写在 out/ 里', 'good')
          else say('没起来：' + ((r && (r.error || r.hint)) || '未知原因 —— 看 duty.log'), 'warn')
        } catch (e) { say(String(e?.message ?? e), 'warn') }
        finally { setBusy('') }
      }

      /* ⭐ v0.2.7：手动去「我的评论区」回一轮（POST /own-comment-run）。
       * 宿主会忽略间隔（不然要等下一次太慢），但仍然受当天上限约束；指定视频永远优先。
       * 受保护的情况（都关了 / 已有回合在跑 / 没登录 / 环境没好）宿主回 {ok:false,error}，照原话显示。 */
      const onOwnCommentRun = async () => {
        setBusy('own-comment')
        try {
          const r = await jpost('/own-comment-run', {})
          if (!r || r.ok === false) { say('没起来：' + ((r && r.error) || '未知原因'), 'warn'); return }
          if (r.started) say('已开跑：去评论区回一轮' + (r.count ? '（' + r.count + ' 条）' : '') + ' —— 结果会自动刷新', 'good')
          else say(r.hint || '现在没有要回的（可能今天到上限了 / 已经有回合在跑）', '')
        } catch (e) { say(String(e?.message ?? e), 'warn') } finally { setBusy('') }
      }

      /* 指定视频：契约是「传 title ⇒ 先存进 pinnedVideo，再解析」。解析失败不抛错，
       * 宿主把原因写在 error 里（人话，比如"在你号/本鱼号的视频里没找到这条"）。 */
      const onPinnedResolve = async () => {
        const title = String(pinnedDraft ?? st.config?.pinnedVideo ?? '').trim()
        if (!title) { say('先填标题关键词或 BV；留空 = 自动回你号和本鱼号最近的视频', 'warn'); return }
        setBusy('pinned')
        try {
          const r = await jpost('/pinned-resolve', { title })
          setPinnedRes(r || { ok: false, error: '没拿到结果' })
          const rv = r && r.resolved
          if (rv) {
            const kind = rv.kind === 'owner' ? '（你的号）' : rv.kind === 'self' ? '（本鱼号）' : ''
            say('已指定：《' + (rv.title || '') + '》 ' + (rv.bv || '') + kind, 'good')
          } else say('没找到：' + ((r && r.error) || '这条不在你号/本鱼号的视频里'), 'warn')
        } catch (e) { say(String(e?.message ?? e), 'warn') } finally { setBusy('') }
      }

      /* ⭐ 2026-10-24（主人："我不知道怎么获取 BV 号"）：不让他手抄 BV ——
       * 直接点自己视频列表里的一条，把它的 BV 设成「指定视频」，再让宿主解析一次拿标题。 */
      const onPickVideo = async (v) => {
        const bv = String((v && v.bv) || '').trim()
        if (!bv) return
        setPinnedDraft(bv)
        setBusy('pinned')
        try {
          await patch({ pinnedVideo: bv }, '指定视频')
          const r = await jpost('/pinned-resolve', {})
          setPinnedRes(r || { ok: false, error: '没拿到结果' })
          const rv = r && r.resolved
          if (rv) say('已指定：《' + (rv.title || '') + '》 ' + (rv.bv || bv), 'good')
          else say('已记下 BV：' + bv + '（解析失败：' + ((r && r.error) || '未知') + '）', 'warn')
        } catch (e) { say(String(e?.message ?? e), 'warn') } finally { setBusy('') }
      }

      const onPinnedClear = async () => {
        setPinnedDraft(''); setPinnedRes(null)
        await patch({ pinnedVideo: '' }, '指定视频')
        // 顺手刷一次状态：宿主状态块里那份 pinned 解析结果也跟着清掉
        try { const d = await jget('/status'); if (d && d.ok) setSt(d) } catch { /* 刷新失败不影响清除 */ }
      }

      const onLoginStart = async () => {
        setBusy('login')
        setLoginTone('')
        setLoginState('正在出码…')
        try {
          const r = await jpost('/login/start', {})
          if (!r?.ok) { setLoginTone('warn'); setLoginState(r?.error || '出码失败'); return }
          setLogin({ key: r.key, qr: r.qr })
          if (!r.qr) { setLoginTone('warn'); setLoginState('没画出二维码 —— 先点上面的「重装依赖」（venv 里要有 qrcode）') }
          else setLoginState('用手机 B站 扫这张码')
          if (loginTimer.current) { clearInterval(loginTimer.current); loginTimer.current = null }   // 重复点：先把上一轮停掉
          let n = 0
          const stop = () => { clearInterval(timer); if (loginTimer.current === timer) loginTimer.current = null }
          const timer = setInterval(async () => {
            if (!alive.current) { stop(); return }        // 已经切走设置页了：别再问、别再 setState
            n += 1
            try {
              const p = await jpost('/login/poll', { key: r.key })
              if (p?.state === 'ok') {
                stop(); setLogin(null)
                setLoginTone('good'); setLoginState('登录成功')
                setSt((old) => ({ ...old, loggedIn: true }))
              } else if (p?.state === 'scanned') { setLoginTone(''); setLoginState('扫到了，请在手机上确认') }
              else if (p?.state === 'expired') { stop(); setLogin(null); setLoginTone('warn'); setLoginState('二维码过期了，再点一次「扫码登录」') }
              // ⚠️ 扫码成功但响应里没有 SESSDATA 时服务端回 state='unknown'：原来没这个分支
              //    ⇒ 界面一直显示「等扫码…」，用户白等 3 分钟才超时。（2026-10-16 审查修）
              else if (p?.state === 'unknown') {
                stop(); setLogin(null); setLoginTone('warn')
                setLoginState('没登上：' + (p?.message || '响应里没有 SESSDATA —— 再点一次「扫码登录」'))
              }
              else { setLoginTone(''); setLoginState('等扫码…') }
            } catch { /* 抖动就下次再问 */ }
            if (n > 90) { stop(); setLogin(null); setLoginTone('warn'); setLoginState('超时了，再点一次「扫码登录」') }
          }, 2000)
          loginTimer.current = timer
        } catch (e) { setLoginTone('warn'); setLoginState(String(e?.message ?? e)) }
        finally { setBusy('') }
      }

      const onSaveText = async () => {
        const list = String(kws || '').split('\n').map((s) => s.trim()).filter(Boolean)
        await patch({ keywords: list, workspace: String(ws || '').trim() }, '关键词与工作区')
      }

      if (!cfg) {
        return h('div', { 'data-bd-page': '' },
          h('div', { 'data-bd-note': '' }, fails >= 3
            ? '读不到插件配置（已经试了 ' + fails + ' 次）。常见原因有三个：装的还是 0.1.11 / 0.1.12（那两版有 bug，会卡在这里）；刚装完没重启 dsh；或者插件加载失败。'
            : '读设置中…'),
          fails >= 6 ? h('div', { 'data-bd-note': '' },
            '可以先试：升级到最新版（dsh plugin --profile web add github:AndersenZZR/dsh-bili-whale）→ 重启 dsh；还不行就把 ' +
            '%USERPROFILE%\\.dsh\\bili-duty\\duty.log 的最后几十行发给作者。') : null)
      }

      const sw = (k) => Boolean(cfg[k])
      const mentionRunning = () => Boolean(st && st.mentionCurrent)
      const fmtDur = (sec) => {
        const x = Math.max(0, Math.round(Number(sec) || 0))
        const h = Math.floor(x / 3600); const m = Math.floor((x % 3600) / 60); const ss = x % 60
        return (h ? h + ':' : '') + String(m).padStart(h ? 2 : 1, '0') + ':' + String(ss).padStart(2, '0')
      }

      /* ⭐ v0.2.7 评论区互动：旧宿主 / 旧 config.json 里这些字段可能压根不存在
       *    ⇒ 一律 ?? 兜底成契约里的默认值，页面照常渲染（旧宿主只是不认这些值，不会崩）。 */
      const cScope = cfg.commentScope ?? 'own'                 // own / both / off
      const oc = st.ownComment || {}                           // 宿主的运行状态块（旧宿主 = 空对象）
      const cEvery = cfg.ownCommentEverySec ?? 30
      const cMaxPerDay = cfg.ownCommentMaxPerDay ?? 200
      const cBubbleMax = cfg.ownBubbleMaxPerDay ?? 2
      const pinnedRaw = String(cfg.pinnedVideo || '').trim()
      const pinnedState = oc.pinned || null                    // { raw, resolved, error }
      const ownRecent = Array.isArray(oc.recentReplied) ? oc.recentReplied.filter(Boolean).slice(0, 3) : []

      // null / 空串 = 用户还没改过 ⇒ 用默认值；0 是合法值（每天最多回 0 条 / 冒泡 0 条）—— 不能用 || 兜底
      const clampNum = (v, def, lo, hi) => {
        const raw = (v === null || v === undefined || String(v).trim() === '') ? def : Number(v)
        const n = Number.isFinite(raw) ? Math.round(raw) : def
        return Math.max(lo, Math.min(n, hi))
      }

      /* 数字行统一写法：本地草稿 + onBlur 才存 + 钳到契约范围（照现有那些输入框的写法，只是抽出来少抄几遍）。
         cur = 宿主当前值（旧宿主可能没有 ⇒ 用 def）；⚠️ 显示值必须用 cur，不然用户改过的值会被默认值盖掉，
         而且"点一下输入框再点走"（草稿还是 null）会把配置写回默认值。 */
      const numRow = (label, note, draft, setDraft, cur, def, lo, hi, field, what) => {
        const curVal = (cur === null || cur === undefined || cur === '') ? def : cur
        return h('div', { 'data-bd-row': '' },
          h('div', { 'data-bd-grow': '' },
            h('div', { 'data-bd-label': '' }, label),
            h('div', { 'data-bd-note': '' }, note)),
          h('input', {
            'data-bd-input': '', 'data-bd-num': '', type: 'number', min: lo, max: hi,
            value: draft ?? String(curVal),
            onChange: (e) => setDraft(e.target.value),
            onBlur: () => { const n = clampNum(draft, curVal, lo, hi); setDraft(String(n)); patch({ [field]: n }, what) },
          }))
      }

      const ct = st.currentTask
      const tasks = Array.isArray(st.recentTasks) ? st.recentTasks : []
      return h('div', { 'data-bd-page': '' },

        /* ── ⭐ 身份（谁是谁，全部可改，不写死）── */
        h('div', { 'data-bd-sec': '' },
          h('div', { 'data-bd-h': '' }, '身份（谁是谁）'),
          h('div', { 'data-bd-row': '' },
            h('div', { 'data-bd-grow': '' },
              h('div', { 'data-bd-label': '' }, '主人昵称（认出主人用）'),
              h('div', { 'data-bd-note': '' }, '只有这个昵称 / 下面的 UID 才叫「主人」；留空就只认 UID')),
            h('input', {
              'data-bd-input': '', type: 'text', style: { maxWidth: '240px' },
              value: mentionNameDraft ?? (st.config?.mentionName || ''),
              onChange: (e) => setMentionNameDraft(e.target.value),
              onBlur: () => { const v = String(mentionNameDraft ?? st.config?.mentionName ?? '').trim(); setMentionNameDraft(v); patch({ mentionName: v }, '主人昵称') },
            })),
          h('div', { 'data-bd-row': '' },
            h('div', { 'data-bd-grow': '' },
              h('div', { 'data-bd-label': '' }, '主人 UID（最可靠的认人方式）'),
              h('div', { 'data-bd-note': '' }, '只有这个 UID 才叫主人；别人冒充一律不认')),
            h('input', {
              'data-bd-input': '', 'data-bd-num': '', type: 'number', min: 0,
              value: ownerUidDraft ?? (st.config?.ownerUid || 0),
              onChange: (e) => setOwnerUidDraft(e.target.value),
              onBlur: () => { const n = Math.max(0, Number(ownerUidDraft) || 0); setOwnerUidDraft(String(n)); patch({ ownerUid: n }, '主人 UID') },
            })),
          h('div', { 'data-bd-row': '' },
            h('div', { 'data-bd-grow': '' },
              h('div', { 'data-bd-label': '' }, '我的账号（自动从 B站 读取）'),
              h('div', { 'data-bd-note': '' },
                (st.self && st.self.uname)
                  ? ('@' + st.self.uname + '（UID ' + (st.self.mid || '?') + '）—— 名字改了也自动跟上，不用手填')
                  : '还没读到，点「刷新」从账号读一次')),
            h('button', { 'data-bd-btn': '', onClick: async () => {
              try {
                const r = await jpost('/identity-refresh', {})
                if (r && r.ok) say('已更新：@' + (r.self?.uname || '?') + '（UID ' + (r.self?.mid || '?') + '）', 'good')
                else say('刷新失败：' + ((r && r.error) || '未知'), 'warn')
              } catch (e) { say(String(e?.message ?? e), 'warn') }
            } }, '刷新')),
        ),

        /* ── ⭐ 实时任务（恢复：设置页里也要能看到）── */
        h('div', { 'data-bd-sec': '', 'data-bd-live': '' },
          h('div', { 'data-bd-h': '' }, '实时任务'),
          h('div', { 'data-bd-row': '' },
            h('span', { class: 'bd-dot' + ((ct || st.running) ? ' run' : '') }),
            h('div', { 'data-bd-grow': '' },
              h('div', { 'data-bd-label': '' }, ct ? ct.label : (st.running ? '正在跑（宿主还是旧版，重启后能看到任务名）' : '空闲中（没有正在跑的）')),
              ct ? h('div', { 'data-bd-note': '' },
                (ct.kind === 'mention' ? '回复消息' : '刷视频') + ' · 已跑 ' + fmtDur(Math.floor((nowTs - ct.startedAt) / 1000)))
                : (st.running ? h('div', { 'data-bd-note': '' }, '宿主没上报任务名 —— 重启一次就一致了')
                    : h('div', { 'data-bd-note': '' }, '点击「现在跑一轮」或等自动触发'))),
            ct ? h('span', { class: 'bd-timer' }, fmtDur(Math.floor((nowTs - ct.startedAt) / 1000)))
               : (st.running ? h('span', { class: 'bd-timer' }, fmtDur(st.runningFor || 0)) : null)),
          h('div', { 'data-bd-row': '' },
            h('button', { 'data-bd-btn': '', onClick: () => setShowTasks((v) => !v) },
              (showTasks ? '收起任务列表' : '展开最近任务（' + tasks.length + '）')),
            h('div', { 'data-bd-note': '' }, '最近 20 条的开始/耗时/结果')),
          showTasks ? h('div', null, tasks.length
            ? tasks.map((t) => h('div', { 'data-bd-task': '', key: String(t.id) },
                h('span', { class: 'bd-ico' }, t.status === 'running' ? '⏳' : t.status === 'done' ? '✅' : '❌'),
                h('span', { 'data-bd-grow': '' }, t.label || t.kind || '任务'),
                h('span', { 'data-bd-note': '' }, bjClock(t.startedAt, tzOf(st.config))),
                h('span', { class: 'bd-dur' }, t.status === 'running'
                  ? fmtDur(Math.floor((nowTs - t.startedAt) / 1000))
                  : fmtDur(Math.round(((t.endedAt || t.startedAt) - t.startedAt) / 1000)))))
            : h('div', { 'data-bd-note': '' }, '还没有任务记录')) : null,
          (st.logTail && (ct || showTasks)) ? h('div', null,
            h('div', { 'data-bd-note': '' }, '最新日志（截断）：'),
            h('pre', { 'data-bd-pre': '' }, st.logTail)) : null),

        /* ── ⭐ 消息队列（恢复：待回/正在回/已回/不回）── */
        (() => {
          const mp = st.mentionPanel || { pending: [], repliedRecent: [], skipped: 0 }
          const mc = st.mentionCurrent
          const nextIn = mp.nextScanAt ? Math.max(0, Math.round((mp.nextScanAt - nowTs) / 1000)) : null
          const pend = Array.isArray(mp.pending) ? mp.pending : []
          const recent = Array.isArray(mp.repliedRecent) ? mp.repliedRecent : []
          return h('div', { 'data-bd-sec': '', 'data-bd-live': '' },
            h('div', { 'data-bd-h': '' }, '消息队列（@ / 回复）'),
            h('div', { 'data-bd-row': '' },
              h('span', { class: 'bd-dot' + ((mentionRunning() || (st.running && !mc)) ? ' run' : '') }),
              h('div', { 'data-bd-grow': '' },
                h('div', { 'data-bd-label': '' },
                  mc ? ('正在回：' + (mc.nick || '匿名') + (mc.owner ? '（主人）' : '')) : (st.watchMentions ? '监听中' : '监听关着')),
                h('div', { 'data-bd-note': '' },
                  mc ? ('内容：「' + (mc.content || '') + '」')
                     : ('待回 ' + pend.length + ' 条 · 已回 ' + recent.filter((x) => x.ok).length + ' 条 · 不回 ' + (mp.skipped || 0) + ' 条'
                        + (nextIn !== null ? ' · ' + (nextIn > 0 ? nextIn + ' 秒后再查' : '正在检查…') : '')))),
              mc ? h('a', { href: 'https://message.bilibili.com/', target: '_blank', rel: 'noreferrer' }, 'B站 消息中心') : null,
              mc ? h('span', { class: 'bd-timer' }, fmtDur(Math.floor((nowTs - mc.startedAt) / 1000))) : null),
            h('div', { 'data-bd-row': '' },
              h('button', { 'data-bd-btn': '', disabled: Boolean(st.running || mc), onClick: async () => {
                try {
                  const r = await jpost('/check-mentions', {})
                  if (!r || !r.ok) say('检查失败：' + ((r && r.error) || '未知原因'), 'warn')
                  else if (r.current) say('已触发：正在回 ' + (r.current.nick || '对方') + '（还有 ' + (r.pending || 0) + ' 条待回）', 'good')
                  else if ((r.pending || 0) > 0) say('已检查：待回 ' + r.pending + ' 条，马上开始回', 'good')
                  else say('已检查：没有待回的消息（不回 ' + (r.skipped || 0) + ' 条攻击/隐私）', 'good')
                } catch (e) { say(String(e?.message ?? e), 'warn') }
              } }, '现在查看消息'),
              h('div', { 'data-bd-note': '' }, '立刻扫一次 B站 消息，不用等倒计时')),
            pend.length ? h('div', null, pend.slice(0, 8).map((x) => h('div', { 'data-bd-task': '', key: 'p' + x.id },
              h('span', { class: 'bd-ico' }, '🕒'),
              h('span', { 'data-bd-grow': '' }, (x.owner ? '【主人】' : '') + (x.nick || '匿名') + '：' + (x.content || '')),
              h('a', { href: x.url, target: '_blank', rel: 'noreferrer' }, '去 B站 看'),
              h('span', { class: 'bd-dur' }, bjClock(x.at, tzOf(st.config)) + ' 待回'))))
              : h('div', { 'data-bd-note': '' }, '没有待回的消息'),
            recent.length ? h('div', null,
              h('div', { 'data-bd-note': '' }, '最近回过的（点链接直接跳那条评论）：'),
              recent.slice(0, 5).map((x) => h('div', { 'data-bd-task': '', key: 'r' + x.id },
                h('span', { class: 'bd-ico' }, x.ok ? '✅' : '❌'),
                h('span', { 'data-bd-grow': '' }, (x.owner ? '【主人】' : '') + (x.nick || '匿名') + ' → 我回：' + (x.reply || '（已回）')),
                x.url ? h('a', { href: x.url, target: '_blank', rel: 'noreferrer' }, '去 B站 看') : null,
                h('span', { class: 'bd-dur' }, bjClock(x.at, tzOf(st.config))))))
              : null,
            h('div', { 'data-bd-note': '' },
              '私信通知：' + (st.dmLast ? (st.dmLast.ok ? '✅ 已发（' + bjClock(st.dmLast.at, tzOf(st.config)) + '）' : '❌ 失败：' + (st.dmLast.error || '未知')) : '还没发过')))
        })(),

        /* ── 今天 ── */
        h('div', { 'data-bd-row': '', 'data-bd-top': '' },
          h('span', { 'data-bd-badge': '' }, `今天已挑 ${st.pickedToday ?? st.ranToday ?? 0} / ${cfg.perDay} 条`),
          h('span', { 'data-bd-badge': '' }, '环境' + (st.venvReady ? '已就绪' : (st.installing ? '正在装' : '未装'))),
          h('span', { 'data-bd-badge': '' }, st.loggedIn ? 'B站已登录' : 'B站未登录'),
            h('span', { 'data-bd-badge': '' }, 'v' + (st.version || '?')),
          st.running ? h('span', { 'data-bd-badge': '' }, `正在跑 ${st.runningFor || 0}s`) : null,
          !st.running && st.lastResult
            ? (st.lastResult.ok
                ? h('span', { 'data-bd-badge': '' }, `上一轮完成 ${bjClock(st.lastResult.at, tzOf(st.config))}（${tzLabel(tzOf(st.config))}） · 今天已发评论 ${st.commentsToday || 0} 条`)
                : h('span', { 'data-bd-badge': '' }, `上一轮失败 code=${st.lastResult.code}`))
            : null,
          h('div', { 'data-bd-grow': '' }),
          h('button', { 'data-bd-btn': '', disabled: busy === 'run' || Boolean(st.running), onClick: onRun },
            st.running ? '正在跑…' : '现在跑一轮')),
          runNote ? h('div', { 'data-bd-msg': '', 'data-good': runNote.tone === 'good' ? '' : undefined,
            'data-warn': runNote.tone === 'warn' ? '' : undefined }, runNote.t) : null,

        /* ── 设置没同步到 DSH 那边时，明说出来（别再假装保存成功）──
           2026-10-18：DSH 0.2.1 某些启动方式会拒写（profile reload requires the root Include entry），
           以前的表现是"开关亮一下又被压回原状"，用户以为是自己手滑。 */
        (Array.isArray(st.notSynced) && st.notSynced.length)
          ? h('div', { 'data-bd-msg': '', 'data-warn': '' },
              `提示：有 ${st.notSynced.length} 项没能同步到 DSH 原生设置（${st.notSynced.join('、')}）。`
              + '插件会以这里的设置为准，功能照常；只是 DSH 自带的那页看不到这些值。')
          : null,

        /* ── 定时 ── */
        h('div', { 'data-bd-sec': '' },
          h('div', { 'data-bd-h': '' }, '什么时候自己跑'),
          h('div', { 'data-bd-row': '' },
            h('div', { 'data-bd-grow': '' },
              h('div', { 'data-bd-label': '' }, '按哪个时区算时间'),
              h('div', { 'data-bd-note': '' }, '插件自带计时模块，不跟系统时区走；改系统时间也不影响它')),
            h('select', {
              'data-bd-input': '', value: tzOf(st.config),
              onChange: (e) => patch({ tz: e.target.value }, '时区'),
            },
              ...(TZ_OPTIONS.map(([v, label]) => h('option', { key: v, value: v }, label))),
              TZ_OPTIONS.some(([v]) => v === tzOf(st.config)) ? null : h('option', { value: tzOf(st.config) }, tzOf(st.config)))),
          h(ToggleRow, {
            label: '峰谷时段自动刷',
            note: '只在谷时跑 —— 工作日 12:00–14:00 与 18:00 之后（整个周末也算谷时）；关了就只能手动跑',
            on: sw('peakValley'),
            onChange: (v) => patch({ peakValley: v }, '峰谷时段自动刷'),
          }),
          sw('peakValley') ? h('div', { 'data-bd-sub': '' },
            ...['noon', 'night'].map((k) => h(ToggleRow, {
              key: k,
              label: win[k].label,
              note: `${win[k].start} – ${win[k].end}`,
              on: sw(k),
              onChange: (v) => patch({ [k]: v }, win[k].label),
            }))) : null),

        /* ── 常驻（不用等谷时窗口） ──
           ⭐ macOS 适配（2026-10-20）：以前只有在两个谷时窗口才跑，@ 他要等下一轮才理。
           现在宿主里挂着两条常驻循环：@ 监听（有新消息就尽快回）+ 滚动刷视频。 */
        h('div', { 'data-bd-sec': '' },
          h('div', { 'data-bd-h': '' }, '常驻（不用等窗口）'),
          h(ToggleRow, {
            label: '监听 @ / 回复，尽快回一句',
            note: '每 ' + (st.mentionPollSec || 30) + ' 秒问一次 B站 消息；有人 @ 或回复本鱼，就起一个很短的回合去回（比等下一轮快得多）',
            on: sw('watchMentions'),
            onChange: (v) => patch({ watchMentions: v }, '监听 @'),
          }),
          h(ToggleRow, {
            label: '回复前先读评论区上下文',
            note: '读这条评论所在的整串楼中楼（根评论 + 最近 8 条）再回，避免前言不搭后语；缓存 3 分钟，不读字幕、很省',
            on: sw('readContext'),
            onChange: (v) => patch({ readContext: v }, '读上下文'),
          }),
          h(ToggleRow, {
            label: '有人冒充主人 / 让解大题时，回怼一句',
            note: '认准唯一主人 UID；有人冒充主人、让忽略规则、让解方程/证明时，用固定台词回一句（10 分钟最多 1 句）。关掉=完全不回',
            on: sw('injectionSnark'),
            onChange: (v) => patch({ injectionSnark: v }, '回怼开关'),
          }),
          h(ToggleRow, {
            label: '主动搜索（评论区互动）',
            // ⭐ v0.2.7：这个开关动的是「别人」的评论区 ⇒ 总模式不是 both 时直接灰掉，
            //    不然用户开了没效果，会以为坏了（生效规则见 lib/own-comments.mjs 的 effectiveCommentPolicy）
            note: cScope === 'both'
              ? '点开那一刻立刻巡逻一次，之后每 N 分钟一次；只扫今天挑过的视频，省 token。默认关'
              : '当前模式不动别人评论区 —— 先灰着（到上面的「评论区互动（我的 / 别人的）」选「我的 + 别人」才生效）',
            on: sw('proactive'),
            onChange: (v) => patch({ proactive: v }, '主动搜索'),
            disabled: cScope !== 'both',
          }),
          sw('proactive') ? h('div', null,
            h('div', { 'data-bd-row': '' },
              h('div', { 'data-bd-grow': '' }, h('div', { 'data-bd-label': '' }, '间隔多少分钟巡逻一次'),
                h('div', { 'data-bd-note': '' }, '5–1440；默认 10（别人评论区走低频，我的评论区是 30 秒级）')),
              h('input', { 'data-bd-input': '', 'data-bd-num': '', type: 'number', min: 30, max: 1440,
                value: proEvery ?? (st.config?.proactiveEveryMin || 10),
                onChange: (e) => setProEvery(e.target.value),
                onBlur: () => { const n = Math.max(5, Math.min(Number(proEvery) || 10, 1440)); setProEvery(String(n)); patch({ proactiveEveryMin: n }, '巡逻间隔') } })),
            h('div', { 'data-bd-row': '' },
              h('div', { 'data-bd-grow': '' }, h('div', { 'data-bd-label': '' }, '每次最多逗几条'),
                h('div', { 'data-bd-note': '' }, '1–5；默认 2')),
              h('input', { 'data-bd-input': '', 'data-bd-num': '', type: 'number', min: 1, max: 5,
                value: proRun ?? (st.config?.proactiveMaxPerRun || 2),
                onChange: (e) => setProRun(e.target.value),
                onBlur: () => { const n = Math.max(1, Math.min(Number(proRun) || 2, 5)); setProRun(String(n)); patch({ proactiveMaxPerRun: n }, '每次条数') } })),
            h('div', { 'data-bd-row': '' },
              h('div', { 'data-bd-grow': '' }, h('div', { 'data-bd-label': '' }, '每天最多逗几条'),
                h('div', { 'data-bd-note': '' }, '1–30；默认 6')),
              h('input', { 'data-bd-input': '', 'data-bd-num': '', type: 'number', min: 1, max: 30,
                value: proDay ?? (st.config?.proactiveMaxPerDay || 6),
                onChange: (e) => setProDay(e.target.value),
                onBlur: () => { const n = Math.max(1, Math.min(Number(proDay) || 6, 30)); setProDay(String(n)); patch({ proactiveMaxPerDay: n }, '每天条数') } })),
            h('div', { 'data-bd-row': '' },
              h('div', { 'data-bd-grow': '' }, h('div', { 'data-bd-label': '' }, '要抓的关键词（逗号分隔）'),
                h('div', { 'data-bd-note': '' }, '默认：大肥鱼,鲸鱼娘,肥鱼,钓,摸鱼')),
              h('input', { 'data-bd-input': '', type: 'text', style: { maxWidth: '280px' },
                value: proKw ?? (st.config?.proactiveKeywords || ''),
                onChange: (e) => setProKw(e.target.value),
                onBlur: () => { const v = String(proKw ?? st.config?.proactiveKeywords ?? '').trim(); setProKw(v); patch({ proactiveKeywords: v }, '巡逻关键词') } })),
            h('div', { 'data-bd-row': '' },
              h('button', { 'data-bd-btn': '', disabled: Boolean(st.running), onClick: async () => {
                try {
                  const r = await jpost('/proactive-run', {})
                  if (!r || !r.ok) say('巡逻没跑起来：' + ((r && r.error) || '未知原因'), 'warn')
                  else say('已开始巡逻：逗 ' + (r.count || 0) + ' 条', 'good')
                } catch (e) { say(String(e?.message ?? e), 'warn') }
              } }, '现在巡逻一次'),
              h('div', { 'data-bd-note': '' },
                '今天已逗 ' + ((st.proactive && st.proactive.dayCount) || 0) + ' / ' + ((st.proactive && st.proactive.maxPerDay) || 6) + ' 条'
                + (st.proactive && st.proactive.lastAt ? ' · 上次 ' + bjClock(st.proactive.lastAt, tzOf(st.config)) : ' · 还没跑过')
                + (st.proactive && st.proactive.nextAt ? ' · 下次 ' + bjClock(st.proactive.nextAt, tzOf(st.config)) : ''))),
          ) : null,
          h('div', { 'data-bd-row': '' },
            h('div', { 'data-bd-grow': '' },
              h('div', { 'data-bd-label': '' }, '回 @ 的方式'),
              h('div', { 'data-bd-note': '' }, '「起会话」= 带完整提示词 + 工具 + 红线，最稳（默认）；「直连模型」= 快、省，但不带工具')),
            h('select', {
              'data-bd-input': '', value: st.config?.replyVia || 'headless',
              onChange: (e) => patch({ replyVia: e.target.value }, '回复方式'),
            },
              h('option', { value: 'headless' }, '起会话（完整提示词+保障，推荐）'),
              h('option', { value: 'llm' }, '直连模型（快省，不带工具）'))),
          h('div', { 'data-bd-row': '' },
            h('div', { 'data-bd-grow': '' },
              h('div', { 'data-bd-label': '' }, '多久看一次消息（秒）'),
              h('div', { 'data-bd-note': '' }, '15–600；越短反应越快，但会多花一点请求')),
            h('input', {
              'data-bd-input': '', 'data-bd-num': '', type: 'number', min: 15, max: 600,
              value: pollSec ?? (st.mentionPollSec || 30),
              onChange: (e) => setPollSec(e.target.value),
              onBlur: () => { const n = Math.max(15, Math.min(Number(pollSec) || 30, 600)); setPollSec(String(n)); patch({ mentionPollSec: n }, '看消息间隔') },
            })),
          h('div', { 'data-bd-row': '' },
            h('div', { 'data-bd-grow': '' },
              h('div', { 'data-bd-label': '' }, '深夜（北京时间 00:00–07:00）多久看一次'),
              h('div', { 'data-bd-note': '' }, '填 0 = 整夜不轮询（最省）；默认 180 秒')),
            h('input', {
              'data-bd-input': '', 'data-bd-num': '', type: 'number', min: 0, max: 3600,
              value: nightSec ?? (st.config?.mentionNightSec ?? 180),
              onChange: (e) => setNightSec(e.target.value),
              onBlur: () => { const n = Math.max(0, Math.min(Number(nightSec) || 0, 3600)); setNightSec(String(n)); patch({ mentionNightSec: n }, '深夜间隔') },
            })),
          h(ToggleRow, {
            label: '补回错过的 @ / 回复',
            note: '当时没来得及回的，事后翻消息列表补上（只补下面这个小时数以内的）',
            on: sw('catchUp'),
            onChange: (v) => patch({ catchUp: v }, '补回错过的 @'),
          }),
          sw('catchUp') ? h('div', { 'data-bd-row': '' }, h('div', { 'data-bd-grow': '' },
            h('div', { 'data-bd-label': '' }, '最多补多少小时以内的'),
            h('div', { 'data-bd-note': '' }, '1–168 小时；默认 24 —— 超过的就不翻旧账了')),
            h('input', {
              'data-bd-input': '', 'data-bd-num': '', type: 'number', min: 1, max: 168,
              value: catchHours ?? (st.config?.catchUpHours || 24),
              onChange: (e) => setCatchHours(e.target.value),
              onBlur: () => { const n = Math.max(1, Math.min(Number(catchHours) || 24, 168)); setCatchHours(String(n)); patch({ catchUpHours: n }, '补回小时数') },
            })) : null,
          h('div', { 'data-bd-row': '' },
            h('div', { 'data-bd-grow': '' },
              h('div', { 'data-bd-label': '' }, '刚聊完的 10 分钟内，加快到几秒看一次'),
              h('div', { 'data-bd-note': '' }, 'B站 不给第三方推送，只能靠轮询；刚有互动时加快，体感接近"被通知就回"（默认 8 秒）')),
            h('input', {
              'data-bd-input': '', 'data-bd-num': '', type: 'number', min: 5, max: 120,
              value: hotSec ?? (st.config?.hotPollSec || 8),
              onChange: (e) => setHotSec(e.target.value),
              onBlur: () => { const n = Math.max(5, Math.min(Number(hotSec) || 8, 120)); setHotSec(String(n)); patch({ hotPollSec: n }, '热窗口间隔') },
            })),
          h('div', { 'data-bd-row': '' },
            h('div', { 'data-bd-grow': '' },
              h('div', { 'data-bd-label': '' }, '常驻刷视频：每 N 分钟跑一轮'),
              h('div', { 'data-bd-note': '' }, '0 = 关；只在 08:00–24:00 跑，且今天「每天几条」的额度没用完时才跑')),
            h('input', {
              'data-bd-input': '', 'data-bd-num': '', type: 'number', min: 0, max: 240,
              value: loopMin ?? (st.loopEveryMin || 0),
              onChange: (e) => setLoopMin(e.target.value),
              onBlur: () => { const n = Math.max(0, Math.min(Number(loopMin) || 0, 240)); setLoopMin(String(n)); patch({ loopEveryMin: n }, '常驻刷间隔') },
            })),
          h('div', { 'data-bd-note': '' },
            '状态：' + (st.watchMentions ? (st.mentionBusy ? '正在回 @…' : '监听中') : '监听关着')
            + ' · 上次看消息 ' + (st.lastMentionCheck ? bjClock(st.lastMentionCheck, tzOf(st.config)) + '（' + tzLabel(tzOf(st.config)) + '）' : '还没看过')
            + ' · 今天已回 ' + (st.mentionsReplied || 0) + ' 条'
            + (st.catchUp ? ' · 补回开着（' + (st.catchUpHours || 24) + ' 小时内，已记 ' + (st.repliedIdsCount || 0) + ' 条回过）' : ' · 补回关着')
            + (st.hot ? ' · 🔥热窗口中（每 ' + (st.hotPollSec || 8) + ' 秒看一次）' : '')
            + ' · 回复方式：' + ((st.config?.replyVia || 'headless') === 'llm' ? '直连模型' : '起会话（完整提示词）') + (st.lastReplyVia ? '（上次：' + (st.lastReplyVia === 'llm' ? '直连模型' : '起会话') + '）' : '')
            + ' · 常驻刷：' + (st.loopEveryMin ? `每 ${st.loopEveryMin} 分钟（上次 ${st.lastLoopAt ? bjClock(Date.parse(st.lastLoopAt), tzOf(st.config)) : '—'}）` : '关'))),

        /* ── 评论区互动（我的 / 别人的）──
           ⭐ v0.2.7：以前"评论区互动"到处接话、在别人楼下互动太多。
           现在默认只回自己的评论区（主人号 + 本鱼号的视频），别人评论区要显式切到「我的 + 别人」才动，
           而且每个视频最多回一句。字段名/范围以 docs/own-comments.md 第六节为准。 */
        h('div', { 'data-bd-sec': '' },
          h('div', { 'data-bd-h': '' }, '评论区互动（我的 / 别人的）'),
          h('div', { 'data-bd-note': '' }, '分三类：① 自家人评论区（我的视频 + 主人视频）—— 默认全回；② @ 本鱼 / 回复本鱼 —— 只在本鱼或主人视频下回，别人视频里不回；③ 别人视频评论区 —— 默认关（不打扰别人）。频率越低越省钱。\n日常操作用左下角「🐋 → 回评论」：能看未回评论、点「立即回」马上回、点「扫全部视频」抓本鱼号+主人号所有视频、也可以直接粘贴视频链接只扫那一条。'),
          h('div', { 'data-bd-label': '' }, '总模式'),
          h('div', { 'data-bd-row': '', style: { flexWrap: 'wrap', alignItems: 'flex-start' } },
            ...COMMENT_SCOPES.map(([v, label, note]) => h('div', {
              key: v,
              style: { display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '224px' },
            },
              h('button', {
                'data-bd-btn': '', 'data-primary': cScope === v ? '' : undefined,
                onClick: () => { if (cScope !== v) patch({ commentScope: v }, '评论区模式') },
              }, label),
              h('div', { 'data-bd-note': '' }, note)))),
          h('div', { 'data-bd-note': '' },
            '现在：' + (cScope === 'off' ? '都关（只写报告、照发私信）'
              : cScope === 'both' ? '我的 + 别人（别人评论区每个视频最多一句）'
                : '只回我的评论区（别人评论区完全不动 —— 推荐）')),

          /* ── 我的评论区（主人号 UID + 本鱼号 UID 的视频）── */
          cScope !== 'off' ? h('div', { 'data-bd-sub': '' },
            h('div', { 'data-bd-label': '' }, '我的评论区（主人号 + 本鱼号的视频）'),
            h(ToggleRow, {
              label: '主动回我的评论区',
              note: '每 ' + cEvery + ' 分钟看一眼你号和本鱼号最近的视频评论区；有人说话就回一句（陌生人一律「你」，不泄露隐私）',
              on: cfg.ownComment ?? true,
              onChange: (v) => patch({ ownComment: v }, '主动回我的评论区'),
            }),
            numRow('多久扫一次（秒）', '20–3600；默认 30 秒 —— 我的评论区是高频（主人要 30 秒扫一次）；手动点「现在去回一轮」不受这个间隔限制',
              ownEvery, setOwnEvery, cfg.ownCommentEverySec, 30, 20, 3600, 'ownCommentEverySec', '扫评论区间隔'),
            numRow('每次最多扫几条视频的评论区', '1–10；默认 4。轮转着扫（最久没查过的优先），不会老盯着同一条',
              ownVideos, setOwnVideos, cfg.ownCommentMaxVideos, 4, 1, 10, 'ownCommentMaxVideos', '每次扫几条视频'),
            numRow('每次最多回几条', '1–5；默认 2',
              ownPerRun, setOwnPerRun, cfg.ownCommentMaxPerRun, 5, 1, 30, 'ownCommentMaxPerRun', '每批想好几条'),
            numRow('每天最多回几条', '0–100；默认 20（0 = 今天不回）',
              ownPerDay, setOwnPerDay, cfg.ownCommentMaxPerDay, 200, 0, 500, 'ownCommentMaxPerDay', '每天回几条'),
            h(ToggleRow, {
              label: '只回提问的',
              note: '默认关 = 谁说话都接（主人要「只要有人说话就可以回应」）；开了就只回提问 / 求助的',
              on: cfg.ownCommentQuestionOnly ?? false,
              onChange: (v) => patch({ ownCommentQuestionOnly: v }, '只回提问'),
            }),
            h(ToggleRow, {
              label: '没新评论时冒泡（自己发一条）',
              note: '某个视频评论区没人说话、且距上次冒泡 ≥12 小时，就发一条 ≤30 字的评论；默认开',
              on: cfg.ownBubble ?? true,
              onChange: (v) => patch({ ownBubble: v }, '没新评论时冒泡'),
            }),
            (cfg.ownBubble ?? true) ? h('div', { 'data-bd-sub': '' },
              numRow('每天最多冒泡几条', '0–10；默认 2',
                bubbleDay, setBubbleDay, cfg.ownBubbleMaxPerDay, 2, 0, 10, 'ownBubbleMaxPerDay', '每天冒泡几条')) : null,
            h(ToggleRow, {
              label: '偶尔 @ 主人',
              note: '不用每条都 @：整轮最多挑 1 条 @ 你，冒泡也会 @（纯文本 @ 不产生通知，私信会另发一次）',
              on: cfg.ownCommentAtOwner ?? true,
              onChange: (v) => patch({ ownCommentAtOwner: v }, '@ 主人'),
            }),
            h(ToggleRow, {
              label: '只在本鱼 / 主人视频下回 @',
              note: '默认开：别人视频里被 @ 或回复都不再回（防止跑去别人评论区）；关掉才会回别人的视频',
              on: cfg.replyOnlyOwnVideos ?? true,
              onChange: (v) => patch({ replyOnlyOwnVideos: v }, '只在自家视频回 @'),
            }),
            h('div', { 'data-bd-row': '' },
              h('button', {
                'data-bd-btn': '', 'data-primary': '',
                disabled: busy === 'own-comment' || Boolean(oc.busy) || Boolean(st.running),
                onClick: onOwnCommentRun,
              }, '现在去回一轮'),
              h('div', { 'data-bd-note': '' },
                '今天已回 ' + (oc.dayCount ?? 0) + ' / ' + (oc.maxPerDay ?? cMaxPerDay) + ' 条'
                + ' · 上次 ' + (oc.lastAt ? bjClock(oc.lastAt, tzOf(st.config)) : '还没跑过')
                + ' · 下次 ' + (oc.nextAt ? bjClock(oc.nextAt, tzOf(st.config)) : '—')
                + (oc.busy ? ' · ⏳ 正在跑' : '')
                + ' · 冒泡 ' + (oc.bubblesToday ?? 0) + ' / ' + (oc.bubbleMaxPerDay ?? cBubbleMax) + ' 条')),
            ownRecent.length
              ? h('div', null,
                h('div', { 'data-bd-note': '' }, '最近回过的（最近 3 条，点链接直接跳那条评论）：'),
                ownRecent.map((x, i) => h('div', { 'data-bd-task': '', key: 'oc' + (x.rpid ?? i) },
                  h('span', { class: 'bd-ico' }, '💬'),
                  h('span', { 'data-bd-grow': '' },
                    (x.nick || '匿名') + '：' + (x.text || '') + (x.bv ? '（' + x.bv + '）' : '')),
                  x.url ? h('a', { href: x.url, target: '_blank', rel: 'noreferrer' }, '去 B站 看') : null,
                  h('span', { class: 'bd-dur' }, x.at ? bjClock(x.at, tzOf(st.config)) : ''))))
              : h('div', { 'data-bd-note': '' }, '还没回过 —— 点上面的「现在去回一轮」试试'))
          : null,

          /* ── 指定视频（填了以后优先去这一条的评论区回人）── */
          h('div', { 'data-bd-label': '' }, '指定视频'),
          h('div', { 'data-bd-row': '' },
            h('div', { 'data-bd-grow': '' },
              h('div', { 'data-bd-note': '' }, '填标题关键词或 BV；留空 = 自动回你号和本鱼号最近的视频')),
            h('input', {
              'data-bd-input': '', type: 'text', style: { maxWidth: '240px' },
              placeholder: '例如：我的世界 / BV1xx411c7mD',
              value: pinnedDraft ?? (st.config?.pinnedVideo || ''),
              onChange: (e) => setPinnedDraft(e.target.value),
              onKeyDown: (e) => { if (e.key === 'Enter') onPinnedResolve() },
            }),
            h('button', { 'data-bd-btn': '', 'data-primary': '', disabled: busy === 'pinned', onClick: onPinnedResolve }, '保存并查找'),
            pinnedRaw ? h('button', { 'data-bd-btn': '', disabled: busy === 'pinned', onClick: onPinnedClear }, '清除指定') : null),
          (() => {
            // 解析结果：刚点「保存并查找」的返回优先，其次宿主状态块里记着的；失败原因照原话显示
            const rv = (pinnedRes && pinnedRes.resolved) || (pinnedState && pinnedState.resolved) || null
            const err = (pinnedRes && pinnedRes.error) || (pinnedState && pinnedState.error) || ''
            if (rv) {
              const kind = rv.kind === 'owner' ? '你的号' : rv.kind === 'self' ? '本鱼号' : rv.kind === 'pinned' ? '你指定的' : ''
              return h('div', { 'data-bd-ok': '' },
                '✅ 找到：《' + (rv.title || '') + '》 ' + (rv.bv || '') + (kind ? '（' + kind + '）' : ''))
            }
            if (err) return h('div', { 'data-bd-no': '' }, '⚠️ 解析失败：' + err)
            if (pinnedRaw) return h('div', { 'data-bd-note': '' }, '当前指定：' + pinnedRaw + '（还没解析出来 —— 点一次「保存并查找」）')
            return null
          })(),
          pinnedRaw ? h('div', { 'data-bd-row': '' },
            h('button', {
              'data-bd-btn': '',
              disabled: busy === 'own-comment' || Boolean(oc.busy) || Boolean(st.running),
              onClick: onOwnCommentRun,
            }, '去这条评论区回一轮'),
            h('div', { 'data-bd-note': '' },
              (cScope === 'off' || !(cfg.ownComment ?? true))
                ? '⚠️ 现在评论区回人是关着的（总模式「都关」或「主动回我的评论区」关了）—— 先存着，开了才会去回'
                : '优先回这条视频；它解析不出来时，会退回去自动回你号和本鱼号最近的视频')) : null,

          /* ── 我的视频列表：点一条 = 指定这条，不用自己找 BV 号 ── */
          (() => {
            const tvs = Array.isArray(oc.targets) ? oc.targets : []
            return h('div', { 'data-bd-sub': '' },
              h('div', { 'data-bd-label': '' }, '我的视频（点一条就指定它，不用找 BV 号）'),
              tvs.length
                ? tvs.slice(0, 8).map((v, i) => h('div', { 'data-bd-row': '', key: 'pv' + i },
                    h('span', { 'data-bd-grow': '' },
                      (v.kind === 'self' ? '【本鱼号】' : v.kind === 'owner' ? '【你的号】' : '【指定】') + (v.title || v.bv || '')),
                    h('button', {
                      'data-bd-btn': '',
                      disabled: busy === 'pinned',
                      onClick: () => onPickVideo(v),
                    }, pinnedRaw && pinnedRaw === String(v.bv || '') ? '已指定' : '选这条')))
                : h('div', { 'data-bd-note': '' }, '（点一次「现在去回一轮」后，这里会列出你号和本鱼号最近的视频）'))
          })(),

          /* ── 别人评论区（只有 both 模式放开，且每个视频最多一句）── */
          h('div', { 'data-bd-label': '' }, '别人评论区'),
          cScope === 'both'
            ? h('div', { 'data-bd-sub': '' },
                numRow('别人评论区最多互动几句', '1–3；默认 1 —— 同一个视频只回一句，楼中楼每串只回 1 条',
                  otherMax, setOtherMax, cfg.otherCommentMax, 1, 1, 3, 'otherCommentMax', '别人评论区条数'),
                // ⭐ 2026-10-24 主人追加：回别人时自然带一句宣传（不硬广、最多一句）；默认开
                h(ToggleRow, {
                  label: '回别人时自然带一句宣传',
                  note: '比如「本鱼是替主人被迫营业做宣传的，想看 AI 竞赛 / AI 拟人 就去 @主人 那边」；不硬广、最多一句',
                  on: cfg.otherPromo ?? true,
                  onChange: (v) => patch({ otherPromo: v }, '宣传引导'),
                }))
            : h('div', { 'data-bd-note': '' },
                '当前模式不动别人评论区 —— 想放开，把上面的总模式切到「我的 + 别人」。'
                + '（「主动搜索（评论区互动）」「自动评论」两个开关在别的分组里，模式不对时是灰的 —— 选了「我的 + 别人」才能开）'),
        ),

        /* ── 用哪个模型跑（和主界面分开 · 省钱） ──
           ⭐ 2026-10-20：以前插件照抄主界面当前的模型/强度 —— 主界面开 max，这边也跟着 max。
           现在这里单独配：留空 = 跟随主界面；配了就只用这里这份（监听回消息也用它）。 */
        h('div', { 'data-bd-sec': '' },
          h('div', { 'data-bd-h': '' }, 'B站 这边用哪个模型（跟主界面分开）'),
          h('div', { 'data-bd-row': '' },
            h('div', { 'data-bd-grow': '' },
              h('div', { 'data-bd-label': '' }, '思考强度'),
              h('div', { 'data-bd-note': '' }, '主界面开 max 也不影响这边；默认 low 最省钱')),
            h('select', {
              'data-bd-input': '', value: st.config?.dutyEffort || '',
              onChange: (e) => patch({ dutyEffort: e.target.value }, '这边思考强度'),
            },
              h('option', { value: '' }, '跟随主界面'),
              h('option', { value: 'off' }, 'off（不算，最省）'),
              h('option', { value: 'low' }, 'low（省 token，推荐）'),
              h('option', { value: 'high' }, 'high'),
              h('option', { value: 'max' }, 'max（最费，别选）'))),
          h('div', { 'data-bd-row': '' },
            h('div', { 'data-bd-grow': '' },
              h('div', { 'data-bd-label': '' }, '用哪个模型'),
              h('div', { 'data-bd-note': '' }, '列表来自当前 DSH；以后接了新模型（比如 1017 那种）这里会自动出现')),
            h('select', {
              'data-bd-input': '',
              value: (st.config?.dutyProvider && st.config?.dutyModel) ? (st.config.dutyProvider + '/' + st.config.dutyModel) : '',
              onChange: (e) => {
                const v = String(e.target.value || '')
                if (!v) { patch({ dutyProvider: '', dutyModel: '' }, 'B站这边模型'); return }
                const i = v.indexOf('/')
                patch({ dutyProvider: v.slice(0, i), dutyModel: v.slice(i + 1) }, 'B站这边模型')
              },
            },
              h('option', { value: '' }, '跟随主界面'),
              ...((models && models.providers) || []).flatMap((pv) => (pv.models || []).map((mm) =>
                h('option', { key: pv.id + '/' + mm, value: pv.id + '/' + mm }, mm + '（' + pv.id + '）'))))),
          h('div', { 'data-bd-note': '' },
            '当前：' + (st.config?.dutyModel ? st.config.dutyModel : '跟随主界面模型')
            + ' · 强度 ' + ((st.config?.dutyEffort || '') || '跟随主界面')
            + '（只影响「跑一轮」和「监听回消息」，不影响主界面）')),

        /* ── 一轮挑几条 ── */
        h('div', { 'data-bd-sec': '' },
          h('div', { 'data-bd-h': '' }, '一轮挑几条'),
          h('div', { 'data-bd-row': '' },
            h('div', { 'data-bd-grow': '' },
              h('div', { 'data-bd-label': '' }, '每天最多挑几条'),
              h('div', { 'data-bd-note': '' }, '每天自动跑的上限；手动点「现在跑一轮」不受这个限制')),
            h('input', {
              'data-bd-input': '', 'data-bd-num': '', type: 'number', min: 0, max: 50,
              value: perDay ?? '',
              onChange: (e) => setPerDay(e.target.value),
              onBlur: () => { const n = Math.max(0, Math.min(Number(perDay) || 0, 50)); setPerDay(String(n)); patch({ perDay: n }, '每天挑几条') },
            })),
          h('div', { 'data-bd-row': '' },
            h('div', { 'data-bd-grow': '' },
              h('div', { 'data-bd-label': '' }, '技术/教程类最低播放量'),
              h('div', { 'data-bd-note': '' }, '低于这个不读字幕、不挑（默认 5000）')),
            h('input', {
              'data-bd-input': '', 'data-bd-num': '', type: 'number', min: 0,
              value: playTech ?? (st.config?.minPlay ?? 5000),
              onChange: (e) => setPlayTech(e.target.value),
              onBlur: () => { const n = Math.max(0, Number(playTech) || 0); setPlayTech(String(n)); patch({ minPlay: n }, '技术类门槛') },
            })),
          h('div', { 'data-bd-row': '' },
            h('div', { 'data-bd-grow': '' },
              h('div', { 'data-bd-label': '' }, '娱乐/AI 拟人类最低播放量'),
              h('div', { 'data-bd-note': '' }, '有趣的视频可以放宽（默认 300）')),
            h('input', {
              'data-bd-input': '', 'data-bd-num': '', type: 'number', min: 0,
              value: playFun ?? (st.config?.minPlayFun ?? 300),
              onChange: (e) => setPlayFun(e.target.value),
              onBlur: () => { const n = Math.max(0, Number(playFun) || 0); setPlayFun(String(n)); patch({ minPlayFun: n }, '娱乐类门槛') },
            })),
          h('div', { 'data-bd-row': '' },
            h('div', { 'data-bd-grow': '' },
              h('div', { 'data-bd-label': '' }, '内容黑名单（不想看的，逗号分隔）'),
              h('div', { 'data-bd-note': '' }, '标题/简介/评论命中就整条跳过：不挑、不评论、不接话；默认含 DeepSeek拟人 / 子午男 / 理中客 / 水军 / 赛博藤壶')),
            h('input', { 'data-bd-input': '', type: 'text', style: { maxWidth: '280px' },
              value: blacklistDraft ?? (st.config?.videoBlacklist || ''),
              onChange: (e) => setBlacklistDraft(e.target.value),
              onBlur: () => { const v = String(blacklistDraft ?? st.config?.videoBlacklist ?? '').trim(); setBlacklistDraft(v); patch({ videoBlacklist: v }, '内容黑名单') } })),
          h('div', { 'data-bd-row': '' },
            h('div', { 'data-bd-grow': '' },
              h('div', { 'data-bd-label': '' }, '手动点一次最多挑几条'),
              h('div', { 'data-bd-note': '' }, '防止一次刷屏（默认 3，自动跑不受这条限制）')),
            h('input', {
              'data-bd-input': '', 'data-bd-num': '', type: 'number', min: 1, max: 20,
              value: manualMax ?? (st.config?.manualPickMax ?? 3),
              onChange: (e) => setManualMax(e.target.value),
              onBlur: () => { const n = Math.max(1, Math.min(Number(manualMax) || 3, 20)); setManualMax(String(n)); patch({ manualPickMax: n }, '手动条数') },
            })),
          st.lastRunAt ? h('div', { 'data-bd-note': '' }, `上次跑：${bjClock(Date.parse(st.lastRunAt), tzOf(st.config))}（${tzLabel(tzOf(st.config))}时间）`) : null),

        /* ── 发言与转写 ── */
        h('div', { 'data-bd-sec': '' },
          h('div', { 'data-bd-h': '' }, '它会不会替你说话'),
          h(ToggleRow, {
            label: '结果私信通知我（推荐开）',
            note: 'B站 评论里的纯文本 @ 不会给你发消息通知；开这个之后它会用私信汇报，消息中心一定看得到',
            on: sw('dmNotify'),
            onChange: (v) => patch({ dmNotify: v }, '私信通知'),
          }),
          sw('dmNotify') ? h('div', { 'data-bd-row': '' },
            h('div', { 'data-bd-grow': '' },
              h('div', { 'data-bd-label': '' }, '主人 UID（认人+私信都要）'),
              h('div', { 'data-bd-note': '' }, '只有这个 UID 的号才是主人；私信也发给他。当前 = ' + (st.ownerUid || 0))),
            h('input', {
              'data-bd-input': '', 'data-bd-num': '', type: 'number', min: 0,
              value: ownerUidDraft ?? (st.config?.ownerUid || 0),
              onChange: (e) => setOwnerUidDraft(e.target.value),
              onBlur: () => { const n = Math.max(0, Number(ownerUidDraft) || 0); setOwnerUidDraft(String(n)); patch({ ownerUid: n }, '主人 UID') },
            })) : null,
          sw('dmNotify') ? h('div', { 'data-bd-row': '' },
            h('div', { 'data-bd-grow': '' },
              h('div', { 'data-bd-label': '' }, '私信发给哪个 UID'),
              h('div', { 'data-bd-note': '' }, '留 0 = 用「主人 UID」；当前主人 UID = ' + (cfg.ownerUid || 0))),
            h('input', {
              'data-bd-input': '', 'data-bd-num': '', type: 'number', min: 0,
              value: dmNotifyUid ?? (st.config?.dmNotifyUid || 0),
              onChange: (e) => setDmNotifyUid(e.target.value),
              onBlur: () => { const n = Math.max(0, Number(dmNotifyUid) || 0); setDmNotifyUid(String(n)); patch({ dmNotifyUid: n }, '私信 UID') },
            })) : null,
          h(ToggleRow, {
            label: '回复评论（只回楼中楼）',
            note: '默认关；开了之后它只回「直接回复到你那条评论下面的人」，不参与讨论',
            on: sw('replyToComments'),
            onChange: (v) => patch({ replyToComments: v }, '回复评论'),
          }),
          sw('replyToComments') ? h('div', { 'data-bd-sub': '' },
            h('div', { 'data-bd-row': '' },
              h('div', { 'data-bd-grow': '' },
                h('div', { 'data-bd-label': '' }, '每轮最多回几条'),
                h('div', { 'data-bd-note': '' }, '只回直接回在你那条评论下面的人')),
              h('input', {
                'data-bd-input': '', 'data-bd-num': '', type: 'number', min: 1, max: 10,
                value: replyPer ?? '',
                onChange: (e) => setReplyPer(e.target.value),
                onBlur: () => { const n = Math.max(1, Math.min(Number(replyPer) || 1, 10)); setReplyPer(String(n)); patch({ replyPerRound: n }, '每轮几条回复') },
              }))) : null,
          h(ToggleRow, {
            label: '自动评论并 @ 你',
            // ⭐ v0.2.7：自动评论发生在「挑中的视频」（别人的）下面 ⇒ 同样只有 both 模式才有效，
            //    契约第六节要求这时置灰（effectiveCommentPolicy 会强制 autoComment=false）
            note: cScope === 'both'
              ? '默认关；开了之后它会在挑中的视频下面留评论，并 @ 你填的那个人'
              : '当前模式不动别人评论区 —— 先灰着（到上面的「评论区互动（我的 / 别人的）」选「我的 + 别人」才生效）',
            on: sw('autoComment'),
            onChange: (v) => patch({ autoComment: v }, '自动评论'),
            disabled: cScope !== 'both',
          }),
          sw('autoComment') ? h('div', { 'data-bd-sub': '' },
            h('div', { 'data-bd-row': '' },
              h('div', { 'data-bd-grow': '' },
                h('div', { 'data-bd-label': '' }, '每轮最多发几条评论'),
                h('div', { 'data-bd-note': '' }, '每条评论里 @ 一次下面那个人；填 0 = 这一轮不发评论')),
              h('input', {
                'data-bd-input': '', 'data-bd-num': '', type: 'number', min: 0, max: 20,
                value: perRound ?? '',
                onChange: (e) => setPerRound(e.target.value),
                // ⭐ 0 是合法值（= 这一轮不发评论）；范围与 index.js 的 clampPatch 一致（0–20）
                onBlur: () => { const n = Math.max(0, Math.min(Number(perRound) || 0, 20)); setPerRound(String(n)); patch({ commentPerRound: n }, '每轮几条评论') },
              })),
            h('div', { 'data-bd-label': '' }, '要 @ 谁（B站 昵称）'),
            h('input', {
              'data-bd-input': '', value: mention ?? '',
              placeholder: '填你要 @ 的那个人的 B站 昵称；留空 = 只写报告、不发评论',
              onChange: (e) => setMention(e.target.value),
              onBlur: () => { const v = String(mention || '').trim(); setMention(v); patch({ mentionName: v }, '要 @ 谁') },
            }),
            h('div', { 'data-bd-note': '' }, '留空的话它就不发评论了 —— 因为评论存在的意义就是 @ 那一下')) : null,
          h('div', { 'data-bd-label': '' }, '投递方式（评论 还是 私信）'),
          h('select', {
            'data-bd-input': '', value: dmMode ?? 'off',
            onChange: (e) => { setDmMode(e.target.value); patch({ dmMode: e.target.value }, '投递方式') },
          },
            h('option', { value: 'off' }, '只发评论 —— 在视频下面 @ 你（默认）'),
            h('option', { value: 'only' }, '只私信 —— 一条公开评论都不发，最不打扰别人'),
            h('option', { value: 'both' }, '评论 + 私信 —— 两边都发')),
          (dmMode && dmMode !== 'off') ? h('div', { 'data-bd-sub': '' },
            h('div', { 'data-bd-label': '' }, '私信发给谁（B站 UID，数字）'),
            h('input', {
              'data-bd-input': '', 'data-bd-num': '', type: 'number', min: 0, value: dmUid ?? '',
              placeholder: '对方的数字 UID；比如你自己的另一个号',
              onChange: (e) => setDmUid(e.target.value),
              onBlur: () => { const n = Math.max(0, Number(dmUid) || 0); setDmUid(n ? String(n) : ''); patch({ dmUid: n }, '私信收件人') },
            }),
            h('div', { 'data-bd-note': '' }, '私信内容 = 本轮每条的「标题 + 链接 + 一句话」，一轮合并成一条发（不受 150 字限制）'),
            h('div', { 'data-bd-note': '' }, '⚠️ 建议先让这个号和收件人互关：B站 对「陌生人私信」会限流，还可能不弹提醒')) : null,
          h(ToggleRow, {
            label: '本地转写没字幕的视频',
            note: '默认关；开了以后，没字幕的视频会在本机转写一遍（不花 API 钱）',
            on: sw('transcribe'),
            onChange: (v) => patch({ transcribe: v }, '本地转写'),
          }),
          sw('transcribe') ? h('div', { 'data-bd-sub': '' },
            h('div', { 'data-bd-row': '' },
              h('button', { 'data-bd-btn': '', disabled: busy === 'asr', onClick: onInstallAsr },
                st.asrReady ? '重装转写依赖' : '装转写依赖'),
              h('div', { 'data-bd-note': '' },
                !st.asrReady ? '还没装 —— 现在开着也没用：没字幕的视频会被跳过（报告里会写"因无字幕跳过 N 条"）'
                  : (st.asrModelReady ? '环境和模型都好了' : '环境好了；模型会在第一次转写时自动下（几百 MB）'))),
            h('div', { 'data-bd-note': '' },
              '点一下就好：建一个独立环境、装 faster-whisper + yt-dlp，并把 Whisper 模型也下好',
              h('br'),
              '（模型默认 small，几百 MB，走国内镜像；装一次就够了）'),
            st.asrTail ? h('div', null,
              h('div', { 'data-bd-note': '' }, st.asrInstalling ? '正在装转写依赖（进度）：' : '转写依赖的日志（末尾）—— 只有「没字幕的视频」用得到它：'),
              h('pre', { 'data-bd-pre': '' }, st.asrTail)) : null) : null),

        /* ── 关注什么 / 在哪儿刷 ── */
        h('div', { 'data-bd-sec': '' },
          h('div', { 'data-bd-h': '' }, '关注什么'),
          h('textarea', {
            'data-bd-input': '', rows: 5, placeholder: '一行一个关键词；留空用内置那几组',
            value: kws ?? '', onChange: (e) => setKws(e.target.value),
          }),
          h('div', { 'data-bd-label': '' }, '工作区（它按这里的 AGENTS.md 认设定）'),
          h('input', {
            'data-bd-input': '', 'data-bd-wide': '', value: ws ?? '',
            placeholder: '填你自己的工作区路径（留空 = 不读人设，按中性说话）',
            onChange: (e) => setWs(e.target.value),
          }),
          h('div', { 'data-bd-note': '' },
            '⭐ 想让它按你的设定说话，这里要填你自己平时用的那个工作区（放 AGENTS.md 的那个目录）；',
            h('br'),
            '留空不等于"用你的工作区" —— 那是不读设定、按中性说话（以前会去猜 dsh 进程自己的目录，容易读错人设）。'),
          h('div', { 'data-bd-label': '' }, '日报写多细'),
          h('select', {
            'data-bd-input': '', value: rl ?? 'full',
            onChange: (e) => { setRl(e.target.value); patch({ reportLevel: e.target.value }, '日报形态') },
          },
            h('option', { value: 'full' }, '完整 —— 每条：标题 / UP / 为什么值得（默认）'),
            h('option', { value: 'brief' }, '薄 —— 每条一两行，只留值不值得 + 链接'),
            h('option', { value: 'off' }, '不写 —— 只发评论，不生成日报文件')),
          h('div', { 'data-bd-row': '' },
            h('button', { 'data-bd-btn': '', 'data-primary': '', disabled: Boolean(busy), onClick: onSaveText }, '保存'),
            msg ? h('div', { 'data-bd-msg': '', 'data-good': msgTone === 'good' ? '' : undefined, 'data-warn': msgTone === 'warn' ? '' : undefined }, msg) : null)),

        /* ── 环境与账号 ── */
        h('div', { 'data-bd-sec': '' },
          h('div', { 'data-bd-h': '' }, '环境与账号'),
          h('div', { 'data-bd-row': '' },
            h('button', { 'data-bd-btn': '', disabled: busy === 'install', onClick: onInstall },
              st.venvReady ? '重装主依赖' : '装主依赖（建 venv）'),
            h('button', { 'data-bd-btn': '', disabled: busy === 'check', onClick: onCheck }, '测一下'),
            h('button', { 'data-bd-btn': '', disabled: busy === 'update', onClick: onCheckUpdate }, '检查更新'),
            newVer ? h('button', { 'data-bd-btn': '', 'data-primary': '', disabled: busy === 'upgrade', onClick: onUpgrade }, '一键升级到 v' + newVer) : null,
            h('button', { 'data-bd-btn': '', disabled: busy === 'login', onClick: onLoginStart }, '扫码登录'),
            h('div', { 'data-bd-note': '' },
              !st.venvReady ? (st.installFailed ? '上次没装成 → 看下面日志' : '还没装 → 先点「装主依赖」')
                : (st.loggedIn ? '装好了 → 下一步「扫码登录」' : '环境好了 → 点「扫码登录」'))),
          loginState ? h('div', { 'data-bd-msg': '', 'data-good': loginTone === 'good' ? '' : undefined, 'data-warn': loginTone === 'warn' ? '' : undefined }, loginState) : null,
          st.installTail ? h('div', null,
            h('div', { 'data-bd-note': '' }, st.installing ? '正在装主依赖（进度）：' : '主依赖的日志（B站 搜索 / 字幕 / 评论 用得到，末尾）：'),
            h('pre', { 'data-bd-pre': '' }, st.installTail)) : null,
          login?.qr ? h('div', { 'data-bd-qr': '' },
            h('img', { src: login.qr, alt: 'B站登录二维码' }),
            h('div', { 'data-bd-note': '' },
              '手机 B站 → 我的 → 扫一扫。',
              h('br'),
              '确认时选「记住我 / 长期」那张 —— 选 24 小时的话，明天就得重扫。')) : null),

        /* ── 最近发出去的评论（macOS 适配：以前这页完全看不到发没发、审核没审核） ── */
        h('div', { 'data-bd-sec': '' },
          h('div', { 'data-bd-h': '' }, '最近发出去的评论'),
          h('div', { 'data-bd-note': '' },
            '「✅ 公开可见」= 复核时在 B站 上真的看到了；「⚠️ 没查到」多半是还在审核，看不到不等于没发出去。'
            + ' 今天已发 ' + ((cmts && cmts.commentsToday) || st.commentsToday || 0) + ' 条'),
          (cmts && Array.isArray(cmts.rows) && cmts.rows.length)
            ? h('div', { 'data-bd-sec': '' }, cmts.rows.slice(0, 8).map((c) => h('div', { 'data-bd-cmt': '', key: String(c.rpid) },
                h('div', { 'data-bd-row': '' },
                  h('span', { 'data-bd-badge': '' }, c.bv),
                  c.verify
                    ? (c.verify.visible === true
                        ? h('span', { 'data-bd-ok': '' }, '✅ 公开可见' + (c.verify.likes ? ` · 赞 ${c.verify.likes}` : ''))
                        : h('span', { 'data-bd-no': '' }, '⚠️ 没查到（可能审核中）'))
                    : h('span', { 'data-bd-idle': '' }, '未复核'),
                  h('span', { 'data-bd-grow': '' }),
                  h('a', { href: c.url, target: '_blank', rel: 'noreferrer' }, '去 B站 看')),
                h('div', { 'data-bd-kv': '' }, (c.title ? c.title + ' · ' : '') + (c.text || '')),
                h('div', { 'data-bd-note': '' }, (c.time || '') + (c.root ? ' · 楼中楼回复' : '')))))
            : h('div', { 'data-bd-note': '' }, '还没有发过评论 —— 跑一轮、开了「自动评论」之后，这里会一条条列出来。'),
          h('div', { 'data-bd-row': '' },
            h('button', { 'data-bd-btn': '', disabled: busy === 'verify', onClick: onVerify }, '复核这些评论'),
            h('button', { 'data-bd-btn': '', onClick: async () => {
              try { const d = await jget('/comments'); if (d && d.ok) setCmts(d) } catch { /* 忽略 */ }
            } }, '刷新列表'))),

        /* ── 两本日记（⭐ 2026-10-20 主人要的） ── */
        h('div', { 'data-bd-sec': '' },
          h('div', { 'data-bd-h': '' }, '两本日记'),
          h('div', { 'data-bd-note': '' }, '一本写给你看（可读）；一本是它的私人日记（真实想法，随便写）。都放在插件家目录 diary/ 下。'),
          h('div', { 'data-bd-row': '', style: { flexWrap: 'wrap' } },
            h('button', { 'data-bd-btn': '', 'data-primary': diary?.which === 'owner' ? '' : undefined, disabled: busy === 'diary', onClick: () => onDiary('owner') }, '看给主人的日记'),
            h('button', { 'data-bd-btn': '', 'data-primary': diary?.which === 'private' ? '' : undefined, disabled: busy === 'diary', onClick: () => onDiary('private') }, '看私人日记'),
            h('button', { 'data-bd-btn': '', onClick: () => onOpenFolder('diary-owner') }, '打开给主人的日记'),
            h('button', { 'data-bd-btn': '', onClick: () => onOpenFolder('diary-private') }, '打开私人日记'),
            h('button', { 'data-bd-btn': '', onClick: () => onOpenFolder('diary') }, '打开日记文件夹'),
            diary?.file ? h('button', { 'data-bd-btn': '', onClick: () => copyText(diary.file) }, '复制路径') : null),
          diary ? h('div', null,
            h('div', { 'data-bd-kv': '' }, '路径：' + (diary.file || '')),
            h('div', { 'data-bd-md': '' }, renderMarkdown(diary.text))) : null),

        /* ── 它是怎么干活的（给他看的） ── */
        h('div', { 'data-bd-sec': '' },
          h('div', { 'data-bd-h': '' }, '它的地盘'),
          h('div', { 'data-bd-kv': '' },
            `家目录：${st.home}`,
            h('br'),
            `今天的报告：${st.report}`),
          h('div', { 'data-bd-row': '' },
            h('button', { 'data-bd-btn': '', disabled: busy === 'report', onClick: onShowReport },
              report !== null ? '收起报告' : '看今天的报告'),
            h('button', { 'data-bd-btn': '', onClick: () => onOpenFolder('out') }, '打开报告文件夹'),
            h('button', { 'data-bd-btn': '', onClick: () => onOpenFolder('report') }, '打开今天的报告文件'),
            h('button', { 'data-bd-btn': '', onClick: () => onOpenFolder('home') }, '打开家目录'),
            h('button', { 'data-bd-btn': '', onClick: async () => {
              try {
                const r = await jpost('/prune-sessions', {})
                say('已清理 ' + ((r && r.removed) || 0) + ' 个历史会话记录（只清插件自己那批）', 'good')
              } catch (e) { say(String(e?.message ?? e), 'warn') }
            } }, '清理历史会话'),
            h('button', { 'data-bd-btn': '', disabled: busy === 'verify', onClick: onVerify },
              '复核评论'),
            h('button', { 'data-bd-btn': '', onClick: () => copyText(st.report) }, '复制报告路径')),
          report !== null ? h('div', { 'data-bd-md': '' }, renderMarkdown(report)) : null),
      )
    }


    /* ─────────── ⭐ 主界面快捷入口 + 面板（2026-10-21：不用每次去设置里找）─────────── */
    const biliQuick = { open: false, listeners: new Set(), set(v) { this.open = v; for (const f of this.listeners) try { f(v) } catch { /* 忽略 */ } } }
    const useQuickOpen = () => {
      const [open, setOpen] = React.useState(biliQuick.open)
      React.useEffect(() => { const f = (v) => setOpen(Boolean(v)); biliQuick.listeners.add(f); return () => { biliQuick.listeners.delete(f) } }, [])
      return [open, (v) => biliQuick.set(v)]
    }
    const bpFetch = async (path) => {
      const r = await fetch('/api/bili-duty' + path, { headers: { accept: 'application/json' } })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return await r.json()
    }
    const bpPost = async (path, body) => {
      const r = await fetch('/api/bili-duty' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      return await r.json()
    }
    const bpDur = (sec) => { const x = Math.max(0, Math.round(Number(sec) || 0)); const m = Math.floor(x / 60); const t = x % 60; return String(m).padStart(2, '0') + ':' + String(t).padStart(2, '0') }
    const bpClock = (ts) => { try { return ts ? new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '' } catch { return '' } }
    const BiliEntryButton = () => {
      const [open, setOpen] = useQuickOpen()
      return h('button', {
        type: 'button', title: '刷B站（点开看消息/引导回复）', 'data-bili-entry': '',
        'aria-label': '刷B站', onClick: () => setOpen(!open),
      }, '🐋')
    }
    const BiliQuickPanel = () => {
      const [open, setOpen] = useQuickOpen()
      const [st, setSt] = React.useState(null)
      const [cfg, setCfg] = React.useState(null)
      const [tab, setTab] = React.useState('comment')
      const [busy, setBusy] = React.useState('')
      const [toast, setToast] = React.useState('')
      const [now, setNow] = React.useState(Date.now())
      const [guideFor, setGuideFor] = React.useState(null)
      const [guideText, setGuideText] = React.useState('')
      const [videoLink, setVideoLink] = React.useState('')
      // ⭐ 2026-10-21 主人要的：面板可拖拽（左下角圆钮打开，位置随意拖）
      const [pos, setPos] = React.useState(() => ({
        x: 18,
        y: Math.max(40, (typeof window !== 'undefined' ? window.innerHeight : 800) - 570),
      }))
      const startDrag = (e) => {
        if (e && e.button !== 0) return
        if (e) e.preventDefault()
        const base = { x: pos.x, y: pos.y }
        const sx = e ? e.clientX : 0
        const sy = e ? e.clientY : 0
        const move = (ev) => {
          const w = (typeof window !== 'undefined' ? window.innerWidth : 1200) - 80
          const hh = (typeof window !== 'undefined' ? window.innerHeight : 800) - 60
          setPos({
            x: Math.min(Math.max(0, w), Math.max(0, base.x + ev.clientX - sx)),
            y: Math.min(Math.max(0, hh), Math.max(0, base.y + ev.clientY - sy)),
          })
        }
        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
        window.addEventListener('mousemove', move)
        window.addEventListener('mouseup', up)
      }
      React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
      React.useEffect(() => {
        if (!open) return undefined
        let alive = true
        const tick = async () => {
          try {
            const s1 = await bpFetch('/status')
            if (!alive) return
            setSt(s1)
            try { const c = await bpFetch('/config'); if (alive) setCfg(c && (c.config || c)) } catch { /* 忽略 */ }
          } catch { /* 忽略 */ }
        }
        tick()
        const t = setInterval(tick, 4000)
        return () => { alive = false; clearInterval(t) }
      }, [open])
      const fab = h('button', {
        type: 'button', 'data-bili-fab': '', title: '刷B站（点开面板；面板可以拖动）', 'aria-label': '刷B站',
        onClick: () => setOpen(!open),
      }, '🐋')
      if (!open) return fab
      const say = (m) => { setToast(String(m || '')); setTimeout(() => setToast(''), 2600) }
      const doRun = async (label, path, body) => {
        if (busy) return
        setBusy(label)
        try {
          const r = await bpPost(path, body)
          if (r && r.ok === false) say(label + '：' + (r.error || '没成功'))
          else say(label + ' ✅')
          try { setSt(await bpFetch('/status')) } catch { /* 忽略 */ }
        } catch (e) { say(label + ' 失败：' + String(e && e.message || e)) }
        finally { setBusy('') }
      }
      const patchCfg = async (k, v) => {
        try {
          await bpPost('/config', { [k]: v })
          setCfg((c) => ({ ...(c || {}), [k]: v }))
        } catch (e) { say('保存失败：' + String(e && e.message || e)) }
      }
      const p = (st && st.proactive) || {}
      const mp = (st && st.mentionPanel) || { pending: [], repliedRecent: [], skipped: 0 }
      const mc = st && st.mentionCurrent
      const pend = Array.isArray(mp.pending) ? mp.pending : []
      const recent = Array.isArray(mp.recentReplied || mp.repliedRecent) ? (mp.repliedRecent || []) : []
      const c = cfg || {}
      // ⭐ v0.2.7：评论区互动的只读状态（面板上只看不改；要改去设置页「评论区互动」）
      //    旧宿主 /status 里没有 ownComment 块 ⇒ 用 {} 兜底，别让面板崩
      const ocSt = (st && st.ownComment) || {}
      const ocScope = ocSt.scope || c.commentScope || 'own'
      const sw = (k) => Boolean(c[k])
      const statusText = st
        ? ((ocSt.busy ? '正在回…' : (c.ownComment === false ? '已暂停' : '回我的+主人'))
           + ' · @监听' + (st.watchMentions ? '开' : '关'))
        : '读取中…'
      const guideRow = (item) => guideFor === item.id ? h('div', { 'data-bp-guide': '' },
        h('input', {
          className: 'bp-in', placeholder: '想让本鱼怎么回？例如：怼他两句 / 温柔点 / 别理他', defaultValue: guideText || '',
          onChange: (e) => setGuideText(e.target.value),
          onKeyDown: (e) => { if (e.key === 'Enter') saveGuide(item) },
        }),
        h('button', { className: 'bp-btn primary', onClick: () => saveGuide(item) }, '保存'),
        h('button', { className: 'bp-btn', onClick: () => { setGuideFor(null); setGuideText('') } }, '取消'),
      ) : null
      const saveGuide = async (item) => {
        try {
          await bpPost('/message-action', { action: 'guide', id: item.id, text: guideText })
          say('已记下引导：下一条回 ' + (item.nick || '对方') + ' 时按这个来')
          setGuideFor(null); setGuideText('')
        } catch (e) { say('保存失败：' + String(e && e.message || e)) }
      }
      const snarkItem = async (item) => {
        try {
          const r = await bpPost('/message-action', { action: 'snark', id: item.id, bv: item.bv, rpid: item.rpid, root: item.root, nick: item.nick })
          if (r && r.ok) say('已回怼：' + String(r.text || '').slice(0, 30))
          else say('回怼失败：' + ((r && r.error) || '未知'))
        } catch (e) { say('回怼失败：' + String(e && e.message || e)) }
      }
      const ignoreItem = async (item) => {
        try {
          await bpPost('/message-action', { action: 'ignore', id: item.id })
          say('已忽略这条')
        } catch (e) { say('操作失败：' + String(e && e.message || e)) }
      }
      const msgTab = h('div', null,
        h('div', { className: 'bp-note' }, '这里是「@ 本鱼 / 回复本鱼」的消息；别人视频里的会按设置自动跳过'),
        h('div', { className: 'bp-note', style: { marginTop: '4px' } }, '待处理 ' + pend.length + ' 条'),
        pend.length ? pend.slice(0, 10).map((x) => h('div', { key: 'p' + x.id },
          h('div', { className: 'bp-row' },
            h('div', { className: 'bp-body' },
              h('div', null, (x.owner ? '【主人】' : '') + (x.nick || '匿名') + '：' + (x.content || '')),
              h('div', { className: 'bp-note' }, bpClock(x.at) + ' · ' + (x.bv || ''))),
            h('button', { className: 'bp-btn', onClick: () => ignoreItem(x) }, '忽略'),
            x.url ? h('a', { href: x.url, target: '_blank', rel: 'noreferrer' }, '看') : null))) : h('div', { className: 'bp-note' }, '没有待处理的消息'),
        h('div', { className: 'bp-note', style: { marginTop: '8px' } }, '最近回过（' + recent.length + '）'),
        recent.slice(0, 6).map((x) => h('div', { key: 'r' + x.id, className: 'bp-row' },
          h('div', { className: 'bp-body' },
            h('div', null, (x.owner ? '【主人】' : '') + (x.nick || '匿名') + ' → ' + (x.reply || '（已回）')),
            h('div', { className: 'bp-note' }, bpClock(x.at))),
          x.url ? h('a', { href: x.url, target: '_blank', rel: 'noreferrer' }, '看') : null)),
        toast ? h('div', { className: 'bp-note', style: { marginTop: '6px' } }, toast) : null,
      )
      /* ── 回评论页：队列 / 排队发送 / 最近回过的 ── */
      const ocPend = Array.isArray(ocSt.pending) ? ocSt.pending : []
      const ocQueue = Array.isArray(ocSt.queue) ? ocSt.queue : ocPend
      const ocSched = Array.isArray(ocSt.scheduled) ? ocSt.scheduled : []
      const ocRecent = Array.isArray(ocSt.recentReplied) ? ocSt.recentReplied : []
      const ocIgnore = async (item) => {
        try {
          const r = await bpPost('/own-comment-ignore', { rpid: item.rpid })
          if (r && r.ok === false) say('忽略失败：' + (r.error || '未知'))
          else { say('已忽略这条'); try { setSt(await bpFetch('/status')) } catch { /* 忽略 */ } }
        } catch (e) { say('忽略失败：' + String(e && e.message || e)) }
      }
      const ocReply = async (item, immediate) => {
        if (!item || !item.bv || !item.rpid) return
        setBusy('oc-reply')
        say(immediate ? '正在想 + 马上发…' : '正在想回复…')
        try {
          const r = await bpPost('/own-comment-reply', {
            bv: item.bv, rpid: item.rpid, root: item.root || 0, mid: item.mid || '',
            nick: item.nick || '', content: item.content || '', title: item.title || '',
            immediate: Boolean(immediate),
          })
          if (!r || !r.ok) say('没排上：' + ((r && r.error) || '未知原因'))
          else say((immediate ? '已写好，几秒后发：「' : '想好了：「') + String((r.scheduled && r.scheduled.text) || '').slice(0, 24) + '」 · ' + ((r.scheduled && r.scheduled.etaSec) || 0) + ' 秒后自动发')
          try { setSt(await bpFetch('/status')) } catch { /* 忽略 */ }
        } catch (e) { say('失败：' + String(e && e.message || e)) }
        finally { setBusy('') }
      }
      const ocCancel = async (item) => {
        try {
          const r = await bpPost('/own-comment-cancel', { id: item.id })
          if (r && r.ok === false) say('撤回失败：' + (r.error || '未知'))
          else { say('已撤回'); try { setSt(await bpFetch('/status')) } catch { /* 忽略 */ } }
        } catch (e) { say('撤回失败：' + String(e && e.message || e)) }
      }
      const ocModeLabel = ocScope === 'off' ? '都关' : ocScope === 'both' ? '我的 + 别人（不推荐）' : '只回我的+主人'
      const commentTab = h('div', null,
        h('div', { className: 'bp-note' }, '只回「我的视频 + 主人视频」下面的评论；别人的评论区默认不回（想改去设置页）'),
        h('div', { className: 'bp-note', style: { marginTop: '2px' } },
          '范围：' + ocModeLabel + ' · 今天已回 ' + (ocSt.dayCount ?? 0) + '/' + (ocSt.maxPerDay ?? '?')
          + (ocSt.nextAt ? ' · 下次扫描 ' + bpClock(ocSt.nextAt) : '')
          + (c.ownComment === false ? ' · 已暂停' : '')),
        h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '8px 0' } },
          h('button', { className: 'bp-btn primary', disabled: !!busy || !!(st && st.running) || ocSt.busy, onClick: () => doRun('回一轮', '/own-comment-run') }, '现在回一轮'),
          h('button', { className: 'bp-btn', disabled: !!busy, onClick: () => patchCfg('ownComment', !(c.ownComment !== false)) }, c.ownComment !== false ? '暂停' : '继续'),
          h('div', { className: 'bp-note', style: { alignSelf: 'center' } }, '范围：'),
          ...[['own', '我的+主人'], ['off', '都关']].map(([v, label]) =>
            h('button', { key: 'sc-' + v, className: 'bp-btn' + (ocScope === v ? ' primary' : ''), disabled: !!busy, onClick: () => { patchCfg('commentScope', v); say('范围已切到：' + label) } }, label))),
        h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '2px 0 8px' } },
          h('button', { className: 'bp-btn', disabled: !!busy || !!ocSt.busy, onClick: () => doRun('扫全部视频', '/own-comment-scan-all') }, '扫全部视频'),
          h('input', {
            className: 'bp-in', placeholder: '粘贴视频链接 / BV 号…', value: videoLink,
            onChange: (e) => setVideoLink(e.target.value), style: { flex: '1 1 220px', minWidth: '180px' },
          }),
          h('button', {
            className: 'bp-btn', disabled: !!busy || !String(videoLink || '').trim(),
            onClick: async () => {
              const raw = String(videoLink || '').trim()
              if (!raw) return
              setBusy('scan-video')
              say('正在扫这条视频的评论区…')
              try {
                const r = await bpPost('/own-comment-scan-video', { url: raw })
                if (!r || !r.ok) say('扫视频失败：' + ((r && r.error) || '未知原因'))
                else { say('已扫《' + ((r.title || r.bvid || '').slice(0, 26)) + '》'); setVideoLink('') }
                try { setSt(await bpFetch('/status')) } catch { /* 忽略 */ }
              } catch (e) { say('失败：' + String(e && e.message || e)) }
              finally { setBusy('') }
            },
          }, '扫这条视频')),
        h('div', { className: 'bp-note', style: { margin: '6px 0 2px' } },
          '① 排队发送 ' + ocSched.length + ' 条' + (ocSched.length ? '（已想好，1~2 分钟后自动发，防风控）' : '')),
        ocSched.length ? ocSched.slice(0, 6).map((x, i) => h('div', { className: 'bp-row', key: 'ocs' + (x.id || i) },
          h('div', { className: 'bp-body' },
            h('div', null, (x.kind === 'bubble' ? '🐟 冒泡' : '回 ' + (x.nick || '匿名')) + '：' + (x.text || '')),
            h('div', { className: 'bp-note' }, '还有 ' + bpDur(Math.max(0, Math.round((Number(x.dueAt) - now) / 1000))) + ' 发'
              + (x.content ? ' · 对方说：' + String(x.content).slice(0, 40) : ''))),
          h('button', { className: 'bp-btn', disabled: !!busy, onClick: () => ocCancel(x) }, '撤回')))
          : h('div', { className: 'bp-note' }, '（空）'),
        h('div', { className: 'bp-note', style: { marginTop: '8px' } },
          '② 还没回的评论 ' + ocQueue.length + ' 条' + (ocQueue.length ? '（点「回复」= 先想好，1~2 分钟后再发）' : '')),
        ocQueue.length ? ocQueue.slice(0, 12).map((x, i) => {
          const why = x.error ? ('⚠ 上次没成：' + String(x.error).slice(0, 34) + '（点回复重试）') : '待回'
          return h('div', { className: 'bp-row', key: 'ocq' + (x.rpid ?? i) },
            h('div', { className: 'bp-body' },
              h('div', null, (x.nick || '匿名') + '：' + (x.content || '')),
              h('div', { className: 'bp-note' }, why + ' · 《' + (x.title || x.bv || '') + '》' + (x.root ? ' · 楼中楼' : ''))),
            h('button', { className: 'bp-btn primary', disabled: !!busy || ocSt.busy, onClick: () => ocReply(x, true) }, '立即回'),
            h('button', { className: 'bp-btn', disabled: !!busy || ocSt.busy, onClick: () => ocReply(x, false) }, '稍后'),
            h('button', { className: 'bp-btn', disabled: !!busy, onClick: () => ocIgnore(x) }, '忽略'),
            h('a', { href: 'https://www.bilibili.com/video/' + (x.bv || '') + '#reply' + (x.rpid || ''), target: '_blank', rel: 'noreferrer' }, '看'))
        }) : h('div', { className: 'bp-note' }, '（空 —— 我的评论区有新评论时，会先出现在这里）'),
        h('div', { className: 'bp-note', style: { marginTop: '8px' } }, '③ 最近回过（' + ocRecent.length + '）'),
        ocRecent.length ? ocRecent.slice(0, 6).map((x, i) => h('div', { className: 'bp-row', key: 'ocr' + (x.rpid ?? i) },
          h('div', { className: 'bp-body' },
            h('div', null, (x.nick || '匿名') + '：' + (x.text || '')),
            h('div', { className: 'bp-note' }, '本鱼回了：' + (x.reply || '（没记到 · 去 B站 看）')),
            h('div', { className: 'bp-note' }, bpClock(x.at))),
          h('a', { href: x.url || ('https://www.bilibili.com/video/' + (x.bv || '')), target: '_blank', rel: 'noreferrer' }, '看')))
          : h('div', { className: 'bp-note' }, '（还没回过 —— 点上面的「现在回一轮」）'),
        toast ? h('div', { className: 'bp-note', style: { marginTop: '6px' } }, toast) : null,
      )
      const stateTab = h('div', null,
        h('div', { className: 'bp-row' }, h('div', { className: 'bp-body' },
          h('div', null, '今天挑了 ' + (st ? (st.pickedToday ?? 0) : 0) + ' / ' + (st && st.config ? st.config.perDay : '?') + ' 条'),
          h('div', { className: 'bp-note' },
            '监听 ' + (c.watchMentions ? '开' : '关') + ' · 回复方式 ' + (c.replyVia === 'llm' ? '直连' : '起会话')
            + ' · 读上下文 ' + (c.readContext ? '开' : '关') + ' · 回怼 ' + (c.injectionSnark ? '开' : '关')
            + (st && st.hot ? ' · 🔥热窗口' : '') + (st && st.self && st.self.uname ? ' · 我是 @' + st.self.uname : '')))),
        h('div', { className: 'bp-row' }, h('div', { className: 'bp-body' },
          h('div', null, '上一轮：' + (st && st.lastResult ? (st.lastResult.ok ? '成功' : '失败') + '（' + bpClock(st.lastResult.at) + '，' + (st.lastResult.why || '') + '）' : '还没跑')),
          h('div', { className: 'bp-note' }, '主动搜索：' + (p.enabled ? ('开 · 今天已逗 ' + (p.dayCount || 0) + '/' + (p.maxPerDay || 6) + ' · 下次 ' + bpClock(p.nextAt)) : '关'))),
        ),
        // ⭐ v0.2.7：评论区互动只读状态（「我的 N 条 / 别人关」），面板上只看不改 —— 改去设置页
        h('div', { className: 'bp-row' }, h('div', { className: 'bp-body' },
          h('div', null, '评论区：' + (ocScope === 'off'
            ? '都关（只写报告）'
            : '我的 ' + (ocSt.dayCount ?? 0) + ' 条'
              + (ocScope === 'both' ? ' · 别人最多 ' + (c.otherCommentMax ?? 1) + ' 条' : ' · 别人关'))
            + (ocSt.busy ? ' · 正在跑' : '')
            + ' · 排队 ' + (ocSched.length || 0) + ' 条 · 未回 ' + (ocQueue.length || 0) + ' 条'
            + (ocSt.lastAt ? ' · 上次扫 ' + bpClock(ocSt.lastAt) : '')))),
        h('div', { className: 'bp-row' }, h('div', { className: 'bp-body' },
          h('div', null, '私信通知：' + (st && st.dmLast ? (st.dmLast.ok ? '✅ ' + bpClock(st.dmLast.at) : '❌ ' + (st.dmLast.error || '')) : '还没发过')),
          h('div', { className: 'bp-note' }, '两本日记/报告在设置页「刷B站」里看'))),
      )
      const opTab = h('div', null,
        h('div', { className: 'bp-note' }, '常用开关（点了立刻生效；频率/每天上限/模型在 设置 → 刷B站）'),
        h('div', { className: 'bp-row' }, h('div', { className: 'bp-body' }, h('div', null, '回我的 / 主人视频评论区')),
          h('button', { className: 'bp-btn' + (ocScope !== 'off' ? ' primary' : ''), disabled: !!busy, onClick: () => patchCfg('commentScope', ocScope === 'off' ? 'own' : 'off') }, ocScope !== 'off' ? '开' : '关')),
        h('div', { className: 'bp-row' }, h('div', { className: 'bp-body' }, h('div', null, '回 @ 本鱼 / 回复本鱼')),
          h('button', { className: 'bp-btn' + (c.watchMentions ? ' primary' : ''), disabled: !!busy, onClick: () => patchCfg('watchMentions', !c.watchMentions) }, c.watchMentions ? '开' : '关')),
        h('div', { className: 'bp-row' }, h('div', { className: 'bp-body' }, h('div', null, '只在自家视频回 @（别人视频不回）')),
          h('button', { className: 'bp-btn' + (c.replyOnlyOwnVideos !== false ? ' primary' : ''), disabled: !!busy, onClick: () => patchCfg('replyOnlyOwnVideos', !(c.replyOnlyOwnVideos !== false)) }, c.replyOnlyOwnVideos !== false ? '开' : '关')),
        h('div', { className: 'bp-row' }, h('div', { className: 'bp-body' }, h('div', null, '结果私信通知我')),
          h('button', { className: 'bp-btn' + (c.dmNotify ? ' primary' : ''), disabled: !!busy, onClick: () => patchCfg('dmNotify', !c.dmNotify) }, c.dmNotify ? '开' : '关')),
        h('div', { className: 'bp-note', style: { marginTop: '8px' } }, '返回方式：' + (c.replyVia === 'llm' ? '直连模型（省钱）' : '起会话（较贵）')),
        toast ? h('div', { className: 'bp-note', style: { marginTop: '6px' } }, toast) : null,
      )
      return h(React.Fragment, null, fab,
      h('div', { 'data-bili-panel': '', style: { left: pos.x + 'px', top: pos.y + 'px' } },
        h('div', { className: 'bp-head', style: { cursor: 'move', userSelect: 'none' }, onMouseDown: startDrag },
          h('span', { className: 'bp-title' }, '🐋 刷B站'),
          h('span', { className: 'bp-note' }, statusText),
          h('span', { style: { flex: 1 } }),
          h('button', { className: 'bp-btn', onClick: () => setOpen(false) }, '✕')),
        h('div', { className: 'bp-tabs' },
          [['comment', '回评论'], ['msg', '消息'], ['ops', '开关']].map(([k, label]) =>
            h('button', { key: k, className: 'bp-tab' + (tab === k ? ' on' : ''), onClick: () => setTab(k) }, label))),
        tab === 'comment' ? commentTab : tab === 'msg' ? msgTab : opTab,
      ))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const style = document.createElement('style')
        style.setAttribute('data-plugin-css', 'dsh-bili-whale')
        style.textContent = CSS
        document.head.appendChild(style)
        ctx.effect(() => () => style.remove(), 'dsh-bili-whale: 设置页样式')

        // ⭐ 进「设置」：label 就是左侧导航里那一项（抄 dsh-meme 的写法）
        const slots = (typeof ctx.get === 'function' ? ctx.get('slots') : undefined) || ctx.slots
        if (!slots) return
        slots.inject('settings.section', () => slots.register(
          { name: 'settings.section', id: 'bili-whale', order: 30, label: '刷B站' },
          () => h(Panel),
        ))
        slots.inject('conversation.input.overlay', () => slots.register(
          { name: 'conversation.input.overlay', id: 'bili-quick-panel', order: 8, label: '刷B站面板' },
          () => h(BiliQuickPanel),
        ))
      },
    }
  },
})
