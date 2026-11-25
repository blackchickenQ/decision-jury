"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import LiuKanshan from "./liu-kanshan"

type Mode = "single" | "compare" | "premortem"

const MODES: { id: Mode; index: string; name: string; description: string }[] = [
  { id: "single", index: "01", name: "单案对质", description: "一个决定，三轮质疑，找到最关键的验证动作" },
  { id: "compare", index: "02", name: "二选一", description: "让经验分别支持 A / B，再找出反转条件" },
  { id: "premortem", index: "03", name: "事前验尸", description: "假设一年后已经失败，倒推死因和早期信号" },
]

const PRESETS: { label: string; mode: Mode; decision: string; reason: string; constraint: string; options?: string[] }[] = [
  {
    label: "休学做出海 AI 工具",
    mode: "single",
    decision: "我想休学一年，全职做一款面向海外用户的 AI 工具",
    reason: "海外用户付费意愿更高，我也有独立开发能力",
    constraint: "最多能承受一年时间和 5 万元投入，不能接受无法复学",
  },
  {
    label: "大厂 offer 还是初创团队",
    mode: "compare",
    decision: "毕业后，我应该选择大厂 offer，还是加入早期 AI 创业团队",
    reason: "大厂更稳定，初创团队可能带来更快成长",
    constraint: "需要承担房租，希望两年内形成不可替代的能力",
    options: ["先去大厂，在成熟体系里积累", "加入初创团队，承担更高不确定性"],
  },
  {
    label: "辞职考研的事前验尸",
    mode: "premortem",
    decision: "我准备辞职，脱产半年备考计算机研究生",
    reason: "学历提升能帮助我转向算法岗位，目前工作成长有限",
    constraint: "存款只够支撑半年，不能接受既没考上又失去职业连续性",
  },
]

export default function Home() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>("single")
  const [decision, setDecision] = useState("")
  const [reason, setReason] = useState("")
  const [constraint, setConstraint] = useState("")
  const [options, setOptions] = useState(["", ""])
  const [error, setError] = useState("")

  const activeMode = MODES.find((item) => item.id === mode) ?? MODES[0]

  const fillPreset = (preset: (typeof PRESETS)[number]) => {
    setMode(preset.mode)
    setDecision(preset.decision)
    setReason(preset.reason)
    setConstraint(preset.constraint)
    setOptions(preset.options ?? ["", ""])
    setError("")
  }

  const handleSubmit = () => {
    if (!decision.trim()) {
      setError("先写下你正在犹豫的决定，或者点一个示例快速开庭。")
      return
    }
    if (!reason.trim()) {
      setError("再补一条你最依赖的理由，陪审团才知道该质疑什么。")
      return
    }
    if (mode === "compare" && (!options[0].trim() || !options[1].trim())) {
      setError("二选一需要写清楚 A、B 两个选项。")
      return
    }

    const caseFile = {
      mode,
      decision: decision.trim(),
      reason: reason.trim(),
      constraint: constraint.trim(),
      options: mode === "compare" ? options.map((item) => item.trim()) : [],
      createdAt: new Date().toISOString(),
    }
    localStorage.setItem("jury_case", JSON.stringify(caseFile))
    localStorage.setItem("jury_decision", caseFile.decision)
    localStorage.setItem("jury_reason", caseFile.reason)
    localStorage.removeItem("jury_verdict")
    localStorage.removeItem("jury_insights")
    localStorage.removeItem("jury_messages")
    localStorage.removeItem("jury_witnesses")
    localStorage.removeItem("jury_warning")
    localStorage.setItem("jury_asked", "0")
    router.push("/jury")
  }

  return (
    <main className="home-shell">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="决策陪审团首页">
          <span className="brand-mark">决</span>
          <span>决策陪审团<small>DECISION JURY</small></span>
        </Link>
        <div className="header-meta"><span>知乎黑客松 S3</span><span>数字伙伴实验室</span></div>
      </header>

      <section className="home-hero">
        <div className="hero-story">
          <div className="eyebrow"><span />不是替你决定，而是让决定经得起追问</div>
          <h1>别急着问<br />“会不会成”。<br /><em>先开庭，再决定。</em></h1>
          <p className="hero-lead">把知乎里走过相似道路的人请上证人席。刘看山带你完成三回合对质，把一团犹豫，审成一份可以执行、可以复盘的行动裁决。</p>
          <div className="companion-note">
            <LiuKanshan pose="guide" />
            <div><strong>刘看山 · 证据引导员</strong><p>我不站队，只站在证据这一边。不知道该怎么问时，把问题交给我。</p></div>
          </div>
        </div>

        <div className="case-intake-wrap">
          <div className="case-intake">
            <div className="file-heading">
              <div><span className="file-kicker">NEW CASE / 新建案件</span><h2>今天，要审什么决定？</h2></div>
              <span className="file-number">№ 001</span>
            </div>

            <div className="mode-switch" aria-label="选择审理玩法">
              {MODES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={mode === item.id ? "active" : ""}
                  onClick={() => { setMode(item.id); setError("") }}
                >
                  <span>{item.index}</span>{item.name}
                </button>
              ))}
            </div>
            <p className="mode-description">{activeMode.description}</p>

            <label className="field-label" htmlFor="decision"><span>1</span>{mode === "compare" ? "你在哪两个选项之间犹豫？" : mode === "premortem" ? "哪件事值得做一次事前验尸？" : "你正在考虑什么决定？"}</label>
            <textarea
              id="decision"
              value={decision}
              onChange={(event) => setDecision(event.target.value)}
              placeholder={mode === "premortem" ? "例如：我准备辞职，脱产半年备考" : "例如：我想休学一年，全职做一款出海 AI 工具"}
              rows={3}
            />

            {mode === "compare" && (
              <div className="option-grid">
                <label><span className="option-tag">A</span><input value={options[0]} onChange={(event) => setOptions([event.target.value, options[1]])} placeholder="第一个选项" /></label>
                <label><span className="option-tag">B</span><input value={options[1]} onChange={(event) => setOptions([options[0], event.target.value])} placeholder="第二个选项" /></label>
              </div>
            )}

            <label className="field-label" htmlFor="reason"><span>2</span>{mode === "premortem" ? "如果失败，你最怕它毁在哪里？" : "你最依赖的成立理由是什么？"}<small>这是本次质询的靶子</small></label>
            <textarea
              id="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={mode === "premortem" ? "例如：最怕既没考上，又失去职业连续性" : "例如：海外用户愿意付费，我也有独立开发能力"}
              rows={2}
            />

            <label className="field-label" htmlFor="constraint"><span>3</span>你的底线或限制是什么？<small>选填，但很重要</small></label>
            <input
              id="constraint"
              value={constraint}
              onChange={(event) => setConstraint(event.target.value)}
              placeholder="例如：最多投入一年和 5 万元，不能接受无法复学"
            />

            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-cta" type="button" onClick={handleSubmit}><span>让刘看山开庭</span><b>→</b></button>
            <p className="intake-footnote">预计 3–5 分钟 · 证词保留原文链接 · 你可以随时提出异议</p>
          </div>

          <div className="preset-row">
            <span>没想好怎么写？试一个</span>
            <div>{PRESETS.map((preset) => <button key={preset.label} type="button" onClick={() => fillPreset(preset)}>{preset.label}</button>)}</div>
          </div>
        </div>
      </section>

      <section className="how-it-works" aria-label="审理流程">
        <div className="how-title"><span>HOW IT WORKS</span><h2>不是聊天，是一场有结局的对质</h2></div>
        <ol>
          <li><b>01</b><div><strong>传唤真实经历</strong><p>围绕决定检索知乎回答，证词与原文绑定，不用虚构成功学。</p></div></li>
          <li><b>02</b><div><strong>三回合交叉质询</strong><p>核对事实、挑战适用性、索要行动。看山每轮记下一条关键证据。</p></div></li>
          <li><b>03</b><div><strong>带走行动裁决</strong><p>得到最小实验、通过指标、停止条件，十四天后回来复盘。</p></div></li>
        </ol>
      </section>

      <footer className="site-footer"><span>决策陪审团 · 让经验接受追问，让选择回到你手中</span><span>公开回答重构角色，不冒充原作者，不构成专业建议</span></footer>
    </main>
  )
}
