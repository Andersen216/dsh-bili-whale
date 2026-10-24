/**
 * lib/own-comments.mjs —— 「评论区互动」的**纯逻辑**
 * ============================================================================
 * 2026-10-24 主人要的改造：
 *   ① 自己的评论区（主人号 + 本鱼号的视频）主动回人、回答提问、偶尔冒泡 @ 主人；
 *   ② 别人评论区收敛到**最多一句**，而且默认先关掉；
 *   ③ 可以手动指定一条视频（标题关键词或 BV），专门去那条评论区回人。
 *
 * 为什么单独抽一个文件：这几条判定（能不能动别人评论区、该回哪几条、指定视频匹配到哪条）
 * 是**最容易出错也最该单测**的部分。放在这里 ⇒ 不依赖宿主、不联网，`test-own-comments.mjs`
 * 可以直接把边界情况钉死（宿主 index.js 里那堆 async 逻辑反而不好测）。
 *
 * ⚠️ 本文件**只放纯函数**：不读文件、不联网、不 import 宿主任何东西。
 * ============================================================================
 */

/** 新配置字段的默认值（index.js 的 DEFAULTS 直接展开它，别在两处各写一遍） */
export const OWN_COMMENT_DEFAULTS = {
  /** 评论区互动总模式：own=只回我的评论区 · both=我的+别人（别人最多一句）· off=全关 */
  commentScope: 'own',
  /** 主动回「我的评论区」（主人号 + 本鱼号的视频） */
  ownComment: true,
  /** 多久扫一次我的评论区（**秒**；主人要「30 秒扫一次」，我这边的评论区走高频） */
  ownCommentEverySec: 30,
  /** 每次最多扫几条视频的评论区（轮转，公平覆盖） */
  ownCommentMaxVideos: 4,
  /** 每次最多回几条评论 */
  ownCommentMaxPerRun: 2,
  /** 每天最多回几条评论（0 = 不回） */
  ownCommentMaxPerDay: 20,
  /** 只回提问的（默认 false = 谁说话都接，主人要「只要有人说话就可以回应」） */
  ownCommentQuestionOnly: false,
  /** 没新评论时冒个泡（发一条新评论） */
  ownBubble: true,
  /** 每天最多冒泡几条 */
  ownBubbleMaxPerDay: 2,
  /** 冒泡 / 回复时 @ 主人（纯文本 @；真正的通知靠私信兜底） */
  ownCommentAtOwner: true,
  /** 别人评论区最多互动几句（只在 commentScope='both' 时生效） */
  otherCommentMax: 1,
  /** 在别人评论区回话时，自然带一句「替主人被迫营业做宣传」的引导（不硬广、最多一句） */
  otherPromo: true,
  /** 指定视频：标题关键词或 BV（空了 = 自动回你号和本鱼号最近的视频） */
  pinnedVideo: '',
}

export const COMMENT_SCOPES = ['own', 'both', 'off']

const clampInt = (v, lo, hi, dflt) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return dflt
  return Math.max(lo, Math.min(Math.trunc(n), hi))
}

/** 新字段的范围钳制（给 index.js 的 clampPatch 调用：写和读两头都过一遍） */
export function clampOwnCommentPatch(patch) {
  const p = { ...(patch || {}) }
  if ('commentScope' in p) p.commentScope = COMMENT_SCOPES.includes(String(p.commentScope)) ? String(p.commentScope) : 'own'
  if ('ownComment' in p) p.ownComment = Boolean(p.ownComment)
  if ('ownCommentEverySec' in p) p.ownCommentEverySec = clampInt(p.ownCommentEverySec, 20, 3600, 30)
  if ('ownCommentMaxVideos' in p) p.ownCommentMaxVideos = clampInt(p.ownCommentMaxVideos, 1, 10, 4)
  if ('ownCommentMaxPerRun' in p) p.ownCommentMaxPerRun = clampInt(p.ownCommentMaxPerRun, 1, 5, 2)
  if ('ownCommentMaxPerDay' in p) p.ownCommentMaxPerDay = clampInt(p.ownCommentMaxPerDay, 0, 100, 20)
  if ('ownCommentQuestionOnly' in p) p.ownCommentQuestionOnly = Boolean(p.ownCommentQuestionOnly)
  if ('ownBubble' in p) p.ownBubble = Boolean(p.ownBubble)
  if ('ownBubbleMaxPerDay' in p) p.ownBubbleMaxPerDay = clampInt(p.ownBubbleMaxPerDay, 0, 10, 2)
  if ('ownCommentAtOwner' in p) p.ownCommentAtOwner = Boolean(p.ownCommentAtOwner)
  if ('otherCommentMax' in p) p.otherCommentMax = clampInt(p.otherCommentMax, 1, 3, 1)
  if ('otherPromo' in p) p.otherPromo = Boolean(p.otherPromo)
  if ('pinnedVideo' in p) p.pinnedVideo = String(p.pinnedVideo || '').trim().slice(0, 120)
  return p
}

/**
 * 这一份配置**实际**允许在评论区做什么（别人评论区的闸门就靠它）。
 * 为什么不直接读 cfg.autoComment：主人要的是「一个总开关管住两个地方」——
 * 切到 own 就得把 autoComment / proactive / replyToComments 全部**有效关掉**，
 * 但不能改他原来存的开关值（以后切回 both 还要用）。
 */
export function effectiveCommentPolicy(cfg = {}) {
  const rawScope = String(cfg.commentScope || 'own')
  const scope = COMMENT_SCOPES.includes(rawScope) ? rawScope : 'own'
  const otherMax = clampInt(cfg.otherCommentMax, 1, 3, 1)
  const both = scope === 'both'
  const ownOn = scope !== 'off' && (cfg.ownComment === undefined ? true : Boolean(cfg.ownComment))
  return {
    scope,
    /** 自己评论区能不能动 */
    own: ownOn,
    /** 别人评论区：自动评论（挑中的视频下 @ 主人） */
    autoComment: both && Boolean(cfg.autoComment),
    /** 别人评论区：主动巡逻（去今天挑过的视频评论区逗人） */
    proactive: both && Boolean(cfg.proactive),
    /** 别人评论区：回楼中楼 */
    replyToComments: both && Boolean(cfg.replyToComments),
    /** 每轮最多发几条评论（both 时再被 otherCommentMax 压到 1） */
    commentPerRound: both ? Math.min(clampInt(cfg.commentPerRound, 0, 20, 1), otherMax) : 0,
    /** 主动巡逻每次最多几条（both 时压到 otherCommentMax） */
    proactiveMaxPerRun: both ? Math.min(clampInt(cfg.proactiveMaxPerRun, 1, 5, 2), otherMax) : 0,
    /** 别人评论区一次最多几句 */
    otherMax,
  }
}

/**
 * 是不是「在问问题 / 在求东西」—— 只用来**排优先级**（提问的先回），
 * 以及 ownCommentQuestionOnly 开着时当过滤条件。宁可多认一点，别漏掉真提问。
 */
const QUESTION_RE = /(\?|？|吗|呢|怎么|咋|如何|为什么|为啥|什么|啥|哪个|哪些|谁|哪儿|哪里|能不能|可不可以|会不会|是不是|有没有|要不要|求|请问|问一下|问问|教教|教我|帮我|帮忙|告诉我|推荐|解释|讲讲|说说)/i
export function isQuestion(text) {
  const t = String(text || '')
  if (!t) return false
  return QUESTION_RE.test(t)
}

/**
 * 冒泡条件：今天没到上限、离上次在该视频冒泡够久。
 * ⚠️ 冒泡正文由模型现写（宿主没法预判它写什么），"别重复"交给提示词里带上最近几条。
 */
export function shouldBubble({ enabled, bubblesToday, bubbleMaxPerDay, lastBubbleAt, minGapMs = 12 * 3600_000, now = Date.now() } = {}) {
  if (!enabled) return false
  const max = clampInt(bubbleMaxPerDay, 0, 10, 2)
  if (max <= 0) return false
  if (Number(bubblesToday || 0) >= max) return false
  if (lastBubbleAt && now - Number(lastBubbleAt) < minGapMs) return false
  return true
}

/**
 * 从视频池里挑这次要扫的几条：pinned 永远排最前，其余**最久没查过的先查**（轮转）。
 * videos: [{ bv, kind:'owner'|'self'|'pinned', ... }]
 */
export function chooseVideosToScan({ videos = [], max = 4, lastChecked = {} } = {}) {
  const list = (Array.isArray(videos) ? videos : []).filter((v) => v && v.bv)
  const checkedAt = (v) => Number(lastChecked[v.bv] || 0)
  const sorted = [...list].sort((a, b) => {
    const pa = a.kind === 'pinned' ? 0 : 1
    const pb = b.kind === 'pinned' ? 0 : 1
    if (pa !== pb) return pa - pb
    return checkedAt(a) - checkedAt(b)
  })
  return sorted.slice(0, clampInt(max, 1, 10, 4))
}

/**
 * 把一批评论过滤 + 排序成「这次要回的」。
 * comments: [{ bv, title, kind, rpid, mid, uname, content, ctime, like, rcount }]
 * skipText: 宿主传进来的判定（攻击 / 隐私 / 内容黑名单），返回 true 就跳过
 */
export function pickOwnCommentTargets({
  comments = [],
  selfUid = '',
  ownerUid = '',
  doneIds = [],
  personDone = {},
  max = 2,
  now = Date.now(),
  questionOnly = false,
  maxAgeDays = 14,
  skipText = () => false,
} = {}) {
  const self = String(selfUid || '')
  const owner = String(ownerUid || '')
  const done = new Set((doneIds || []).map(String))
  const pd = personDone || {}
  const maxAgeMs = Math.max(1, Number(maxAgeDays) || 14) * 24 * 3600_000
  const picked = []
  const skipped = { self: 0, owner: 0, done: 0, person: 0, old: 0, attack: 0, notQuestion: 0, empty: 0 }

  for (const c of Array.isArray(comments) ? comments : []) {
    if (!c || !c.rpid) { skipped.empty++; continue }
    const text = String(c.content || '').trim()
    if (!text) { skipped.empty++; continue }
    if (self && String(c.mid || '') === self) { skipped.self++; continue }
    // 主人自己留的话不算"路人说话" —— 回主人有专门的 @ 监听那条路，这里不抢（免得自己跟自己聊）
    if (owner && String(c.mid || '') === owner) { skipped.owner++; continue }
    if (done.has(String(c.rpid))) { skipped.done++; continue }
    const personKey = `${c.bv}:${c.mid}`
    if (c.mid && pd[personKey]) { skipped.person++; continue }
    const t = Number(c.ctime || 0) * 1000
    if (t && now - t > maxAgeMs) { skipped.old++; continue }
    if (skipText(text)) { skipped.attack++; continue }
    if (questionOnly && !isQuestion(text)) { skipped.notQuestion++; continue }
    picked.push({ ...c })
  }

  // 排序：提问优先 → 新到的优先 → 点赞多的优先（同分时稳一点）
  const score = (c) => {
    const q = isQuestion(c.content) ? 1000 : 0
    const ageH = Math.max(0, (now - Number(c.ctime || 0) * 1000) / 3600_000)
    const fresh = Math.max(0, 200 - ageH * 2)
    const like = Math.min(120, Math.max(0, Number(c.like || 0)) * 10)
    return q + fresh + like
  }
  picked.sort((a, b) => score(b) - score(a))
  return { picked: picked.slice(0, clampInt(max, 1, 5, 2)), skipped }
}

/** 视频标题 / BV 的宽松比对（去空白、去《》、忽略大小写） */
const norm = (s) => String(s || '').replace(/[《》「」"“”\s]/g, '').toLowerCase()

/**
 * 「指定视频」匹配：输入可能是 BV，也可能是标题关键词。
 * pools: { owner: [...], self: [...], search: [...] }，每项 { bvid, title, mid?, uid? }
 * 返回 { video, error }：video 形如 { bvid, title, uid, kind }；匹配不到时 error 是人话。
 */
export function resolvePinnedTarget(input, { owner = [], self = [], search = [] } = {}) {
  const raw = String(input || '').trim()
  if (!raw) return { video: null, error: '还没填指定视频' }

  const pools = [
    { kind: 'owner', list: owner || [] },
    { kind: 'self', list: self || [] },
    { kind: 'pinned', list: search || [] },
  ]
  const toVideo = (v, kind) => ({
    bvid: String(v.bvid || v.bv || ''),
    title: String(v.title || ''),
    uid: Number(v.mid || v.uid || 0) || 0,
    kind,
  })
  const all = []
  for (const { kind, list } of pools) for (const v of list) if (v && (v.bvid || v.bv)) all.push({ v, kind })

  // ① 直接给 BV
  const bvm = /^(BV[0-9A-Za-z]{10})$/i.exec(raw)
  if (bvm) {
    const want = bvm[1].toLowerCase()
    const hit = all.find(({ v }) => String(v.bvid || v.bv).toLowerCase() === want)
    if (hit) return { video: toVideo(hit.v, hit.kind), error: '' }
    // 池子里没有也算命中 —— 用户明确给了 BV，后面照样能拉评论（kind 未知按 pinned 处理）
    return { video: { bvid: bvm[1], title: '', uid: 0, kind: 'pinned' }, error: '' }
  }

  // ② 标题精确匹配 → ③ 互相包含
  const want = norm(raw)
  const exact = all.find(({ v }) => norm(v.title) === want)
  if (exact) return { video: toVideo(exact.v, exact.kind), error: '' }
  const fuzzy = all.find(({ v }) => {
    const t = norm(v.title)
    return t && (t.includes(want) || (want.length >= 4 && want.includes(t)))
  })
  if (fuzzy) return { video: toVideo(fuzzy.v, fuzzy.kind), error: '' }

  return {
    video: null,
    error: `在你号和本鱼号的视频里没找到「${raw}」。可以填标题里的几个字，或者直接贴 BV 号。`,
  }
}

/**
 * 冒泡文案的"别重复"提示：把最近几条原文拼进提示词，让模型自己避开。
 * （纯字符串处理，放这里是为了跟其它提示词拼装逻辑分开测。）
 */
export function bubbleAvoidLine(recent = []) {
  const texts = (Array.isArray(recent) ? recent : [])
    .map((x) => {
      // 对象只认 text 字段（宿主老版本只记了 {at,bv} ⇒ 宁可跳过，也不能把 [object Object] 喂给模型）
      if (x && typeof x === 'object') return String(x.text || '').trim()
      return String(x || '').trim()
    })
    .filter(Boolean)
    .slice(-5)
  if (!texts.length) return ''
  return `\n⚠️ 之前冒泡说过的（**换个说法，别重复**）：${texts.map((t) => `「${t}」`).join('、')}\n`
}
