/**
 * test-own-comments.mjs —— v0.2.7「评论区互动」的**纯离线**单测
 * ============================================================================
 * 覆盖三块（不联网、不调 bili_* 工具、不重启任何东西；时间戳一律用固定参数传入）：
 *   A. `lib/own-comments.mjs` 的纯函数
 *      生效口径（own/both/off）· 配置钳制 · 问句识别 · 挑评论（过滤/计数/排序）
 *      · 挑视频（轮转/指定视频优先）· 指定视频匹配 · 冒泡条件 · 冒泡去重提示
 *   B. 静态一致性（读文件文本断言，防宿主四处漏字段）
 *      index.js（Config schema / POST 白名单 / DEFAULTS / promptFor / 新接口）
 *      · client.js（13 字段 + 两个新接口）· mcp_server.py（--call CLI + 两个内部函数）
 *   C. Python `--call` CLI 冒烟（未知工具 ⇒ exit 2 + 最后一行 JSON 带 error；不需要 B站 凭证）
 *
 * 跑法：
 *   cd "<插件目录>" && node test-own-comments.mjs
 * 期望：全绿（末尾有 pass 数；有 fail 就退出码非 0）。
 *
 * 为什么要有它：这几条判定（能不能动别人评论区、该回哪几条、指定视频命中哪条）
 * 是这次改造里**最容易写错**的部分；宿主 index.js 里那堆 async 逻辑不好测，
 * 纯逻辑全在 lib/own-comments.mjs，边界就在这里钉死。
 * ============================================================================
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  OWN_COMMENT_DEFAULTS,
  COMMENT_SCOPES,
  clampOwnCommentPatch,
  effectiveCommentPolicy,
  isQuestion,
  shouldBubble,
  chooseVideosToScan,
  pickOwnCommentTargets,
  resolvePinnedTarget,
  bubbleAvoidLine,
} from './lib/own-comments.mjs'

const ROOT = dirname(fileURLToPath(import.meta.url))
const readText = (rel) => readFileSync(join(ROOT, rel), 'utf8')

/* ── 固定时间：所有测试都用这个"现在"，绝不读系统时间（可重复） ── */
const NOW = Date.UTC(2026, 9, 24, 2, 0, 0)   // 2026-10-24 02:00:00 UTC，整秒
const DAY = 24 * 3600_000
const HOUR = 3600_000
/** B站评论 ctime 是**秒级**时间戳：相对 NOW 往前 msAgo 毫秒 */
const ctime = (msAgo = 0) => Math.floor((NOW - msAgo) / 1000)

/* 这次新增的 13 个配置字段（schema / DEFAULTS / clampPatch / POST 白名单 / 设置页 四处都要有） */
const NEW_FIELDS = [
  'commentScope', 'ownComment', 'ownCommentEverySec', 'ownCommentMaxVideos',
  'ownCommentMaxPerRun', 'ownCommentMaxPerDay', 'ownCommentQuestionOnly',
  'ownBubble', 'ownBubbleMaxPerDay', 'ownCommentAtOwner',
  'otherCommentMax', 'otherPromo', 'pinnedVideo',
]

/* ────────────────────────── A. 纯函数 ────────────────────────── */

test('A1 effectiveCommentPolicy：own（默认）⇒ 别人评论区一律不动', () => {
  const p = effectiveCommentPolicy({
    commentScope: 'own', ownComment: true,
    autoComment: true, proactive: true, replyToComments: true,
    commentPerRound: 9, proactiveMaxPerRun: 5,
  })
  assert.equal(p.scope, 'own')
  assert.equal(p.own, true)
  assert.equal(p.autoComment, false, 'own 模式下别人评论区的自动评论必须有效关掉')
  assert.equal(p.proactive, false, 'own 模式下主动巡逻必须有效关掉')
  assert.equal(p.replyToComments, false, 'own 模式下回楼中楼必须有效关掉')
  assert.equal(p.commentPerRound, 0)
  assert.equal(p.proactiveMaxPerRun, 0)

  // 空配置 = 默认 own
  assert.equal(effectiveCommentPolicy().scope, 'own')
  assert.equal(effectiveCommentPolicy({}).own, true, 'ownComment 没设过时默认 true')

  // ownComment=false ⇒ 自己评论区也不动（但总模式仍是 own）
  const q = effectiveCommentPolicy({ commentScope: 'own', ownComment: false })
  assert.equal(q.scope, 'own')
  assert.equal(q.own, false)
})

test('A2 effectiveCommentPolicy：both ⇒ 别人评论区放开但被 otherCommentMax 压住', () => {
  const p = effectiveCommentPolicy({
    commentScope: 'both', autoComment: true, proactive: true, replyToComments: true,
    commentPerRound: 8, proactiveMaxPerRun: 4, otherCommentMax: 1,
  })
  assert.equal(p.scope, 'both')
  assert.equal(p.own, true)
  assert.equal(p.autoComment, true)
  assert.equal(p.proactive, true)
  assert.equal(p.replyToComments, true)
  assert.equal(p.otherMax, 1)
  assert.equal(p.commentPerRound, 1, 'both 时每轮最多 1 句（被 otherCommentMax 压到 1）')
  assert.equal(p.proactiveMaxPerRun, 1, 'both 时主动巡逻每次最多 1 句')

  // otherCommentMax=2 ⇒ 两处上限都抬到 2
  const q = effectiveCommentPolicy({ commentScope: 'both', commentPerRound: 8, proactiveMaxPerRun: 4, otherCommentMax: 2 })
  assert.equal(q.commentPerRound, 2)
  assert.equal(q.proactiveMaxPerRun, 2)

  // 越界 / 非法值一律钳进合法范围（otherCommentMax 1–3）
  const r = effectiveCommentPolicy({ commentScope: 'both', commentPerRound: 99, proactiveMaxPerRun: 99, otherCommentMax: 99 })
  assert.equal(r.otherMax, 3)
  assert.equal(r.commentPerRound, 3)
  assert.equal(r.proactiveMaxPerRun, 3)
})

test('A3 effectiveCommentPolicy：off ⇒ 全关；非法 commentScope 回退 own', () => {
  const p = effectiveCommentPolicy({
    commentScope: 'off', ownComment: true,
    autoComment: true, proactive: true, replyToComments: true,
    commentPerRound: 5, proactiveMaxPerRun: 5,
  })
  assert.equal(p.scope, 'off')
  assert.equal(p.own, false)
  assert.equal(p.autoComment, false)
  assert.equal(p.proactive, false)
  assert.equal(p.replyToComments, false)
  assert.equal(p.commentPerRound, 0)
  assert.equal(p.proactiveMaxPerRun, 0)

  for (const bad of ['OWN', 'while', '', null, undefined, 1, {}]) {
    const q = effectiveCommentPolicy({ commentScope: bad })
    assert.equal(q.scope, 'own', `非法 commentScope=${JSON.stringify(bad)} 必须回退 own`)
  }
  assert.deepEqual(COMMENT_SCOPES, ['own', 'both', 'off'])
})

test('A4 clampOwnCommentPatch：13 个字段全部按契约钳制', () => {
  const p = clampOwnCommentPatch({
    commentScope: 'both', ownComment: 0,
    ownCommentEverySec: 99999, ownCommentMaxVideos: 0, ownCommentMaxPerRun: 99,
    ownCommentMaxPerDay: -5, ownCommentQuestionOnly: 1,
    ownBubble: 0, ownBubbleMaxPerDay: 99, ownCommentAtOwner: 0,
    otherCommentMax: 0, otherPromo: 0, pinnedVideo: '  指定视频  ',
  })
  assert.equal(p.commentScope, 'both')
  assert.equal(p.ownComment, false)
  assert.equal(p.ownCommentEverySec, 3600, 'ownCommentEverySec 上限 3600 秒')
  assert.equal(clampOwnCommentPatch({ ownCommentEverySec: 1 }).ownCommentEverySec, 20, 'ownCommentEverySec 下限 20 秒')
  assert.equal(p.ownCommentMaxVideos, 1, 'ownCommentMaxVideos 下限 1')
  assert.equal(p.ownCommentMaxPerRun, 5, 'ownCommentMaxPerRun 上限 5')
  assert.equal(p.ownCommentMaxPerDay, 0, 'ownCommentMaxPerDay 下限 0')
  assert.equal(p.ownCommentQuestionOnly, true)
  assert.equal(p.ownBubble, false)
  assert.equal(p.ownBubbleMaxPerDay, 10, 'ownBubbleMaxPerDay 上限 10')
  assert.equal(p.ownCommentAtOwner, false)
  assert.equal(p.otherCommentMax, 1, 'otherCommentMax 下限 1')
  assert.equal(p.otherPromo, false)
  assert.equal(p.pinnedVideo, '指定视频', 'pinnedVideo 要 trim')

  // 默认值也核对一遍（等于 lib 里那份 OWN_COMMENT_DEFAULTS）
  assert.equal(OWN_COMMENT_DEFAULTS.commentScope, 'own')
  assert.equal(OWN_COMMENT_DEFAULTS.ownCommentEverySec, 30, '我的评论区默认 30 秒扫一次')
  assert.equal(OWN_COMMENT_DEFAULTS.ownCommentMaxVideos, 4)
  assert.equal(OWN_COMMENT_DEFAULTS.ownCommentMaxPerRun, 2)
  assert.equal(OWN_COMMENT_DEFAULTS.ownCommentMaxPerDay, 20)
  assert.equal(OWN_COMMENT_DEFAULTS.ownBubbleMaxPerDay, 2)
  assert.equal(OWN_COMMENT_DEFAULTS.otherCommentMax, 1)
})

test('A5 clampOwnCommentPatch：非法值回默认、pinnedVideo 截断、别的字段原样带过', () => {
  const d = clampOwnCommentPatch({
    commentScope: 'zzz',
    ownCommentEverySec: 'abc', ownCommentMaxVideos: NaN, ownCommentMaxPerRun: Infinity,
    ownCommentMaxPerDay: 'x', ownBubbleMaxPerDay: 'abc', otherCommentMax: '?',
    pinnedVideo: 'x'.repeat(500),
  })
  assert.equal(d.commentScope, 'own')
  assert.equal(d.ownCommentEverySec, 30)
  assert.equal(d.ownCommentMaxVideos, 4)
  assert.equal(d.ownCommentMaxPerRun, 2)
  assert.equal(d.ownCommentMaxPerDay, 20)
  assert.equal(d.ownBubbleMaxPerDay, 2)
  assert.equal(d.otherCommentMax, 1)
  assert.equal(d.pinnedVideo.length, 120, 'pinnedVideo 最长 120 字')

  // 只处理认识的键；其它字段原样带过（persistCfg 还要用）
  const keep = clampOwnCommentPatch({ perDay: 7, ownCommentEverySec: '60' })
  assert.equal(keep.perDay, 7)
  assert.equal(keep.ownCommentEverySec, 60, '数字字符串要转成数字（秒）')

  // 空 / 没传 / null 都安全
  assert.deepEqual(clampOwnCommentPatch(), {})
  assert.deepEqual(clampOwnCommentPatch({}), {})
  assert.equal(clampOwnCommentPatch({ pinnedVideo: null }).pinnedVideo, '')
})

test('A6 isQuestion：问句 / 求推荐 / 求助 → true；闲聊 → false', () => {
  const yes = [
    '这个怎么弄？', '求推荐一个入门教程', '帮帮我', 'up主能教教我吗',
    '有没有源码', '这个工具叫啥', '请问怎么安装', '会不会有风险', '能不能出一期视频',
  ]
  const no = ['人好鱼坏', '哈哈好可爱', '来了来了', '已三连', '', '   ', null, undefined]
  for (const t of yes) assert.equal(isQuestion(t), true, `应该认成提问：${JSON.stringify(t)}`)
  for (const t of no) assert.equal(isQuestion(t), false, `不该认成提问：${JSON.stringify(t)}`)
})

/** 造一条宿主传进来的评论（字段与 index.js 里拼出来的一致） */
const mkComment = (over = {}) => ({
  bv: 'BV1', title: '测试视频', kind: 'owner', rpid: 1, mid: '111',
  nick: '路人', content: '你好', ctime: ctime(60_000), like: 0, ...over,
})

test('A7 pickOwnCommentTargets：自己/主人/回过的/同一人/旧评论/攻击话术/空评论 全跳过，计数对得上', () => {
  const comments = [
    mkComment({ rpid: 1, mid: '1001', content: '本鱼自己留的' }),                    // self
    mkComment({ rpid: 2, mid: '2002', content: '主人自己留的' }),                    // owner
    mkComment({ rpid: 3, mid: '3003', content: '回过的' }),                          // done
    mkComment({ rpid: 4, mid: '4004', bv: 'BV9', content: '同一人回过的' }),         // personDone
    mkComment({ rpid: 5, mid: '5005', content: '十五天前的旧话', ctime: ctime(15 * DAY) }), // old
    mkComment({ rpid: 6, mid: '6006', content: '加我微信聊' }),                       // attack
    mkComment({ rpid: 0, mid: '0000', content: '没有 rpid 的' }),                      // empty（无 rpid）
    mkComment({ rpid: 7, mid: '7007', content: '   ' }),                              // empty（空内容）
    mkComment({ rpid: 8, mid: '8008', content: '哈哈好可爱' }),                        // 正常
    mkComment({ rpid: 9, mid: '9009', content: '这个怎么弄？' }),                      // 正常（提问）
  ]
  const r = pickOwnCommentTargets({
    comments, selfUid: '1001', ownerUid: '2002',
    doneIds: ['3'], personDone: { 'BV9:4004': NOW },
    now: NOW, max: 5, skipText: (t) => t.includes('微信'),
  })
  assert.deepEqual(r.skipped, { self: 1, owner: 1, done: 1, person: 1, old: 1, attack: 1, notQuestion: 0, empty: 2 })
  assert.deepEqual(r.picked.map((c) => c.rpid), [9, 8], '只留两条正常的，且提问排最前')
})

test('A8 pickOwnCommentTargets：questionOnly=true 时只留提问', () => {
  const r = pickOwnCommentTargets({
    comments: [
      mkComment({ rpid: 11, mid: '1', content: '哈哈好可爱' }),
      mkComment({ rpid: 12, mid: '2', content: '求推荐一个教程' }),
    ],
    now: NOW, questionOnly: true, max: 5,
  })
  assert.deepEqual(r.picked.map((c) => c.rpid), [12])
  assert.equal(r.skipped.notQuestion, 1)
})

test('A9 pickOwnCommentTargets：max 截断、14 天边界、personDone 按 bv 区分', () => {
  // max 截断：6 条只回 3 条；max 超过 5 按 5 算
  const many = Array.from({ length: 6 }, (_, i) => mkComment({ rpid: 100 + i, mid: String(900 + i), content: '来了来了' }))
  assert.equal(pickOwnCommentTargets({ comments: many, now: NOW, max: 3 }).picked.length, 3)
  assert.equal(pickOwnCommentTargets({ comments: many, now: NOW, max: 99 }).picked.length, 5)

  // 正好 14 天：留着；14 天多 1 秒：跳过
  const boundary = pickOwnCommentTargets({
    comments: [mkComment({ rpid: 201, mid: '1', content: '正好十四天', ctime: ctime(14 * DAY) })],
    now: NOW, max: 5,
  })
  assert.equal(boundary.picked.length, 1, '正好 14 天的评论不该被当成"旧"')
  assert.equal(boundary.skipped.old, 0)
  const tooOld = pickOwnCommentTargets({
    comments: [mkComment({ rpid: 202, mid: '2', content: '十四天零一秒', ctime: ctime(14 * DAY + 1000) })],
    now: NOW, max: 5,
  })
  assert.equal(tooOld.picked.length, 0)
  assert.equal(tooOld.skipped.old, 1)

  // personDone 的记账键是 bv:mid —— 同一个人在别的视频下还能回
  const p = pickOwnCommentTargets({
    comments: [
      mkComment({ rpid: 301, mid: '444', bv: 'BV1', content: '同一个人' }),
      mkComment({ rpid: 302, mid: '444', bv: 'BV2', content: '同一个人在别的视频' }),
    ],
    personDone: { 'BV1:444': NOW }, now: NOW, max: 5,
  })
  assert.deepEqual(p.picked.map((c) => c.rpid), [302])
  assert.equal(p.skipped.person, 1)
})

test('A10 pickOwnCommentTargets：提问优先；都是闲聊时新到的优先', () => {
  // 提问（1 分钟前）vs 闲聊（2 小时前）：提问排前
  const quiz = mkComment({ rpid: 401, mid: '1', content: '求推荐一个教程', ctime: ctime(60_000) })
  const chat = mkComment({ rpid: 402, mid: '2', content: '哈哈好可爱', ctime: ctime(2 * HOUR) })
  const r = pickOwnCommentTargets({ comments: [chat, quiz], now: NOW, max: 5 })
  assert.equal(r.picked[0].rpid, 401, '提问要排在纯闲聊前面')

  // 都是闲聊：新到的优先（旧的那条点赞更多也不该翻上来）
  const newer = mkComment({ rpid: 411, mid: '3', content: '来了来了', ctime: ctime(10 * 60_000) })
  const older = mkComment({ rpid: 412, mid: '4', content: '哈哈好可爱', ctime: ctime(3 * DAY), like: 2 })
  const r2 = pickOwnCommentTargets({ comments: [older, newer], now: NOW, max: 5 })
  assert.equal(r2.picked[0].rpid, 411)
})

test('A11 chooseVideosToScan：pinned 永远第一，其后最久没查的先查，max 截断，空数组安全', () => {
  const videos = [
    { bv: 'BVowner1', kind: 'owner' },
    { bv: 'BVself1', kind: 'self' },
    { bv: 'BVpin', kind: 'pinned' },
    { bv: 'BVowner2', kind: 'owner' },
    { bv: 'BVnever', kind: 'owner' },
    null, { bv: '' },
  ]
  const all = chooseVideosToScan({
    videos, max: 5,
    lastChecked: { BVowner1: 100, BVself1: 300, BVowner2: 200, BVpin: 50 },
  })
  assert.deepEqual(all.map((v) => v.bv), ['BVpin', 'BVnever', 'BVowner1', 'BVowner2', 'BVself1'],
    'pinned 第一；其余按 lastChecked 升序（没查过的当 0 最优先）')

  assert.deepEqual(
    chooseVideosToScan({ videos, max: 2, lastChecked: {} }).map((v) => v.bv),
    ['BVpin', 'BVowner1'],
  )
  assert.deepEqual(chooseVideosToScan({ videos: [], max: 4 }), [])
  assert.deepEqual(chooseVideosToScan(), [])
  assert.equal(chooseVideosToScan({ videos, max: 99, lastChecked: {} }).length, 5, 'max 越界钳在 1–10')
})

const poolsFixture = () => ({
  owner: [{ bvid: 'BV1xx411c7mD', title: '【教程】如何用 DSH 做插件', mid: 111 }],
  self: [{ bvid: 'BV1yy411c7mE', title: '我的评论区日常', mid: 222 }],
  search: [{ bvid: 'BV1zz411c7mF', title: '全站搜到的视频' }],
})

test('A12 resolvePinnedTarget：BV / 精确标题 / 模糊包含 / 找不到给人话', () => {
  const pools = poolsFixture()

  // ① 直接给 BV：命中池内 ⇒ 带 kind / uid
  const byBv = resolvePinnedTarget('BV1xx411c7mD', pools)
  assert.equal(byBv.error, '')
  assert.deepEqual(byBv.video, { bvid: 'BV1xx411c7mD', title: '【教程】如何用 DSH 做插件', uid: 111, kind: 'owner' })

  // BV 大小写不敏感；池子里没有的 BV 也认（kind 按 pinned 处理）
  assert.equal(resolvePinnedTarget('bv1yy411c7me', pools).video.kind, 'self')
  const outside = resolvePinnedTarget('BV1aa411c7mG', pools)
  assert.deepEqual(outside.video, { bvid: 'BV1aa411c7mG', title: '', uid: 0, kind: 'pinned' })
  assert.equal(outside.error, '')

  // ② 标题精确匹配（《》/「」/空白/大小写会被忽略）
  assert.equal(resolvePinnedTarget('我的评论区日常', pools).video.kind, 'self')
  assert.equal(resolvePinnedTarget('《我的评论区日常》', pools).video.bvid, 'BV1yy411c7mE')

  // ③ 标题模糊：输入是标题的一部分（或反过来，输入更长但包住整个标题）
  assert.equal(resolvePinnedTarget('如何用 DSH', pools).video.bvid, 'BV1xx411c7mD')
  assert.equal(resolvePinnedTarget('【教程】如何用 DSH 做插件 第二期', pools).video.bvid, 'BV1xx411c7mD')

  // ④ 找不到 ⇒ video=null + 人话 error
  const miss = resolvePinnedTarget('根本不存在的视频标题', pools)
  assert.equal(miss.video, null)
  assert.match(miss.error, /没找到/)

  // ⑤ 空输入
  const empty = resolvePinnedTarget('', pools)
  assert.equal(empty.video, null)
  assert.equal(empty.error, '还没填指定视频')
})

test('A13 resolvePinnedTarget：owner 池优先于 self / search；旧字段名 bv 也认', () => {
  const pools = {
    owner: [{ bvid: 'BV1aa411c7mG', title: '同名视频', mid: 11 }],
    self: [{ bvid: 'BV1aa411c7mG', title: '同名视频', mid: 22 }],
    search: [{ bvid: 'BV1bb411c7mH', title: '同名视频' }],
  }
  assert.equal(resolvePinnedTarget('同名视频', pools).video.kind, 'owner')
  assert.equal(resolvePinnedTarget('BV1aa411c7mG', pools).video.uid, 11)

  // 全站 search 池命中的 kind 记为 pinned
  const viaSearch = resolvePinnedTarget('BV1bb411c7mH', {
    owner: [], self: [], search: [{ bvid: 'BV1bb411c7mH', title: '搜到的' }],
  })
  assert.equal(viaSearch.video.kind, 'pinned')

  // 旧字段名 bv（没有 bvid）也要认
  const old = resolvePinnedTarget('BV1cc411c7mJ', { owner: [{ bv: 'BV1cc411c7mJ', title: '老格式' }] })
  assert.equal(old.video.bvid, 'BV1cc411c7mJ')
  assert.equal(old.video.kind, 'owner')
  assert.equal(old.video.uid, 0)
})

test('A14 shouldBubble：关着 / 到上限 / 12 小时冷却 / 正常可冒泡', () => {
  const base = { enabled: true, bubblesToday: 0, bubbleMaxPerDay: 2 }
  assert.equal(shouldBubble({ ...base, enabled: false }), false)
  assert.equal(shouldBubble(base), true, '没冒过、额度还在 ⇒ 可以冒')
  assert.equal(shouldBubble({ ...base, bubblesToday: 2 }), false, '到每天上限了')
  assert.equal(shouldBubble({ ...base, bubbleMaxPerDay: 0 }), false, '每天上限 0 = 不冒')
  assert.equal(shouldBubble({ ...base, bubbleMaxPerDay: 'abc' }), true, '非法上限按默认 2 兜底')

  // 同一条视频 12 小时冷却
  assert.equal(shouldBubble({ ...base, now: NOW, lastBubbleAt: NOW - 11 * HOUR }), false)
  assert.equal(shouldBubble({ ...base, now: NOW, lastBubbleAt: NOW - 12 * HOUR }), true, '正好 12 小时可以冒')
  assert.equal(shouldBubble({ ...base, now: NOW, lastBubbleAt: NOW - 12 * HOUR + 1 }), false)
  assert.equal(shouldBubble({ ...base, now: NOW, lastBubbleAt: NOW - 13 * HOUR }), true)

  // 自定义冷却
  assert.equal(shouldBubble({ ...base, now: NOW, lastBubbleAt: NOW - 30 * 60_000, minGapMs: HOUR }), false)
  assert.equal(shouldBubble({ ...base, now: NOW, lastBubbleAt: NOW - 2 * HOUR, minGapMs: HOUR }), true)

  // 什么都不传也安全
  assert.equal(shouldBubble(), false)
})

test('A15 bubbleAvoidLine：拼接最近冒泡原文 + 提示换个说法别重复', () => {
  assert.equal(bubbleAvoidLine([]), '')
  assert.equal(bubbleAvoidLine(), '')

  const line = bubbleAvoidLine(['鲸鱼娘今天也在摸鱼', { text: '主人好呀' }, '', null, '   '])
  assert.match(line, /别重复/)
  assert.match(line, /「鲸鱼娘今天也在摸鱼」/)
  assert.match(line, /「主人好呀」/)
  assert.ok(!line.includes('null'))

  // 只带最近 5 条（更早的不用再避）
  const many = ['一', '二', '三', '四', '五', '六', '七'].map((t) => `冒泡${t}`)
  const tail = bubbleAvoidLine(many)
  assert.ok(!tail.includes('「冒泡一」'))
  assert.ok(!tail.includes('「冒泡二」'))
  assert.ok(tail.includes('「冒泡三」'))
  assert.ok(tail.includes('「冒泡七」'))
  assert.equal((tail.match(/「/g) || []).length, 5)
})

/* ────────────────── B. 静态一致性（防宿主四处漏字段） ────────────────── */

test('B1 index.js 的 Config schema 里有 13 个新字段', () => {
  const src = readText('index.js')
  assert.equal(NEW_FIELDS.length, 13, '契约里就是 13 个字段')
  for (const k of NEW_FIELDS) {
    assert.match(src, new RegExp(`\\b${k}\\s*:\\s*z\\.`), `index.js 的 Config schema 缺字段：${k}`)
  }
})

test('B2 index.js 的 POST /api/bili-duty/config 白名单包含这 13 个字段', () => {
  const src = readText('index.js')
  const marker = "if (req.method === 'POST' && path === '/api/bili-duty/config') {"
  const start = src.indexOf(marker)
  assert.ok(start >= 0, '找不到 POST /api/bili-duty/config 分支')
  const end = src.indexOf('const wasProactive', start)
  assert.ok(end > start, '找不到白名单的结尾（const wasProactive）')
  const block = src.slice(start, end)
  for (const k of NEW_FIELDS) {
    assert.ok(block.includes(`'${k}'`), `POST /config 白名单漏了字段：${k}（设置页改了会静默不生效）`)
  }
})

test('B3 index.js：DEFAULTS 展开 OWN_COMMENT_DEFAULTS；promptFor 走 effectiveCommentPolicy', () => {
  const src = readText('index.js')
  assert.match(src, /\.\.\.OWN_COMMENT_DEFAULTS/, 'DEFAULTS 必须用 ...OWN_COMMENT_DEFAULTS 展开（别两处各写一遍默认值）')
  assert.match(src, /import\s*\{[\s\S]*?OWN_COMMENT_DEFAULTS[\s\S]*?\}\s*from\s*'\.\/lib\/own-comments\.mjs'/)

  // promptFor 的函数体：从声明到下一个顶层 const 之前
  const start = src.indexOf('const promptFor = ')
  assert.ok(start >= 0, '找不到 promptFor')
  const rest = src.slice(start)
  const next = rest.search(/\n  const \w/)
  const body = next < 0 ? rest : rest.slice(0, next)
  assert.ok(body.includes('effectiveCommentPolicy(cfg)'), 'promptFor 必须走 effectiveCommentPolicy(cfg) 的有效口径')
  assert.ok(!body.includes('cfg.autoComment'), 'promptFor 里不许裸读 cfg.autoComment（own/off 时别人评论区要真的不动）')
})

test('B4 index.js：ownCommentTick / runOwnCommentRound / 两个新 POST 接口都存在', () => {
  const src = readText('index.js')
  assert.ok(src.includes('const runOwnCommentRound'), '缺 runOwnCommentRound')
  assert.ok(src.includes('const ownCommentTick'), '缺 ownCommentTick（定时巡逻）')
  assert.ok(src.includes('/api/bili-duty/own-comment-run'), '缺「现在去回一轮」接口')
  assert.ok(src.includes('/api/bili-duty/pinned-resolve'), '缺「指定视频解析」接口')
})

test('B5 mcp_server.py：末尾有 --call CLI；两个宿主专用函数存在且没加 @tool()', () => {
  const src = readText('vendor/bilibili-mcp/mcp_server.py')
  const tail = src.slice(-1400)
  assert.match(tail, /if __name__ == "__main__":/, '末尾必须有启动分支')
  assert.match(tail, /"--call" in sys\.argv/, '启动分支要拦截 --call（CLI 模式）')
  assert.match(tail, /_cli_main\(\)/, '要在 __main__ 里调 _cli_main()')
  assert.match(src, /def _cli_main\(\)/, '缺 _cli_main 入口')

  // 函数定义前不许有 @tool() 之类的装饰器（它们只给宿主 CLI 用，不进 MCP 工具表）
  const decoratorsBefore = (marker) => {
    const idx = src.indexOf(marker)
    assert.ok(idx >= 0, `mcp_server.py 找不到：${marker}`)
    const lines = src.slice(0, idx).split('\n')
    const dec = []
    for (let i = lines.length - 1; i >= 0; i--) {
      const t = lines[i].trim()
      if (!t || t.startsWith('#')) continue
      if (t.startsWith('@')) { dec.push(t); continue }
      break
    }
    return dec
  }
  for (const fn of ['async def space_videos(', 'async def comments_time_batch(']) {
    assert.ok(src.includes(fn), `mcp_server.py 缺 ${fn}`)
    assert.deepEqual(decoratorsBefore(fn), [], `${fn} 不许加 @tool()（它只走 --call CLI，不注册成 MCP 工具）`)
  }
})

test('B6 client.js：13 个 config 字段 + /own-comment-run + /pinned-resolve 都出现', () => {
  const src = readText('client.js')
  for (const k of NEW_FIELDS) assert.ok(src.includes(k), `client.js 设置页缺字段：${k}`)
  assert.ok(src.includes('/own-comment-run'), 'client.js 缺「现在去回一轮」的请求')
  assert.ok(src.includes('/pinned-resolve'), 'client.js 缺「指定视频」解析的请求')
})

/* ────────────────── C. Python CLI 冒烟（离线，不需要凭证） ────────────────── */

test('C1 Python --call CLI 冒烟：未知工具 ⇒ exit 2 + 最后一行 JSON 带 error', (t) => {
  const PY = '/Users/andersen/.dsh/bili-duty/.venv/bin/python'
  if (!existsSync(PY)) {
    t.skip(`本机没有 ${PY}（还没装主依赖？），跳过 Python 冒烟`)
    return
  }
  const script = join(ROOT, 'vendor/bilibili-mcp/mcp_server.py')
  assert.ok(existsSync(script), `缺 ${script}`)
  const r = spawnSync(PY, [script, '--call', '__definitely_not_a_tool__', '--args', '{}'], {
    cwd: join(ROOT, 'vendor/bilibili-mcp'),
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  })
  assert.equal(r.error, undefined, `起不了 python：${r.error?.message || ''}`)
  assert.equal(
    r.status, 2,
    `未知工具应该 exit 2，实际 status=${r.status}；stderr=${String(r.stderr || '').slice(-500)}`,
  )
  const lines = String(r.stdout || '').trim().split(/\r?\n/).filter(Boolean)
  const last = lines.at(-1) || ''
  let j
  try {
    j = JSON.parse(last)
  } catch {
    assert.fail(`stdout 最后一行不是 JSON：${JSON.stringify(last.slice(0, 300))}`)
  }
  assert.equal(typeof j, 'object')
  assert.equal(j.ok, false)
  assert.ok(j.error, `JSON 里要有 error 人话：${last}`)
})
