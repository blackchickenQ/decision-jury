"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import LiuKanshan from "../liu-kanshan"

type Mode = "single" | "compare" | "premortem"
type CaseFile = {
  mode: Mode
  decision: string
  reason: string
  constraint: string
  options: string[]
}
type Witness = {
  name: string
  tag: string
  quote: string
  content?: string
  sourceUrl?: string
  title?: string
  role?: string
  isDemo?: boolean
}
type Message = {
  role: "user" | "witness" | "guide"
  text: string
  who?: string
  witnessIndex?: number
  note?: boolean
  coverage?: "direct" | "partial"
}
type Insight = { text: string; witness: string; round: number }
type Strategy = "证据追问" | "适用性异议" | "行动追问"
type DebateData = {
  reply?: string
  takeaway?: string
  coverage?: "direct" | "partial" | "none"
  evidenceQuote?: string
  warning?: string
}
type WitnessResult = {
  witness: Witness
  witnessIndex: number
  data?: DebateData
  error?: string
}

const MODE_NAMES: Record<Mode, string> = { single: "单案对质", compare: "二选一", premortem: "事前验尸" }
const STRATEGIES: Strategy[] = ["证据追问", "适用性异议", "行动追问"]
const EMPTY_CASE: CaseFile = { mode: "single", decision: "", reason: "", constraint: "", options: [] }

function getHints(mode: Mode) {
  if (mode === "compare") {
    return [
      "这段经历更支持 A 还是 B？判断依据是什么？",
      "什么条件出现后，你会反过来支持另一个选项？",
      "我能做一个什么低成本试验来比较 A 和 B？",
    ]
  }
  if (mode === "premortem") {
    return [
      "假设一年后失败了，这段经历能指出哪种最可能的死因？",
      "失败之前，通常会出现哪些可以被观察到的早期信号？",
      "现在做哪件事，能最早排除这个死因？",
    ]
  }
  return [
    "你的经历中，哪个事实最能说明这个决定的关键风险？",
    "我的情况与你的经历有哪些差异？哪些结论不能照搬？",
    "如果要验证你的判断，我最小可以先做哪一步？",
  ]
}

export default function JuryPage() {
  const router = useRouter()
  const chatEnd = useRef<HTMLDivElement>(null)
  const [caseFile, setCaseFile] = useState<CaseFile>(EMPTY_CASE)
  const [messages, setMessages] = useState<Message[]>([])
  const [witnesses, setWitnesses] = useState<Witness[]>([])
  const [insights, setInsights] = useState<Insight[]>([])
  const [activeWitness, setActiveWitness] = useState(0)
  const [asked, setAsked] = useState(0)
  const [input, setInput] = useState("")
  const [strategy, setStrategy] = useState<Strategy>("证据追问")
  const [loading, setLoading] = useState(true)
  const [isTyping, setIsTyping] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [warning, setWarning] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    const initialize = window.setTimeout(() => {
    if (cancelled) return
    let currentCase = EMPTY_CASE
    try {
      const rawCase = localStorage.getItem("jury_case")
      if (rawCase) currentCase = { ...EMPTY_CASE, ...JSON.parse(rawCase) }
      else {
        const decision = localStorage.getItem("jury_decision") || ""
        currentCase = { ...EMPTY_CASE, decision, reason: localStorage.getItem("jury_reason") || "" }
      }
    } catch {
      router.replace("/")
      return
    }

    if (!currentCase.decision) {
      router.replace("/")
      return
    }
    setCaseFile(currentCase)

    try {
      const cachedWitnesses = JSON.parse(localStorage.getItem("jury_witnesses") || "[]")
      const cachedMessages = JSON.parse(localStorage.getItem("jury_messages") || "[]")
      const cachedInsights = JSON.parse(localStorage.getItem("jury_insights") || "[]")
      if (cachedWitnesses.length && cachedMessages.length) {
        setWitnesses(cachedWitnesses)
        setMessages(cachedMessages)
        setInsights(cachedInsights)
        setAsked(Number(localStorage.getItem("jury_asked") || 0))
        setWarning(localStorage.getItem("jury_warning") || "")
        setLoading(false)
        return
      }
    } catch {
      localStorage.removeItem("jury_messages")
    }

    fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: currentCase.decision, caseFile: currentCase }),
    })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "证人传唤失败")
        const fetchedWitnesses = Array.isArray(data.witnesses) ? data.witnesses : []
        if (!fetchedWitnesses.length) throw new Error("没有找到可审理的证词，请换一个更具体的决定")
        setWitnesses(fetchedWitnesses)
        setWarning(data.warning || "")
        const opening = currentCase.mode === "compare"
          ? "A、B 两个选项都已入卷。别急着选边，先问清每段经历支持什么、又在什么条件下会反转。"
          : currentCase.mode === "premortem"
            ? "现在假设这个决定已经失败。我们不安慰当事人，只找死因、早期信号和还能补救的动作。"
            : "三位证人已经到席。每个问题都会同题交给所有证人，只把相关回答整理入卷；不知道怎么问，就点我推荐的问题。"
        setMessages([{ role: "guide", text: opening }])
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "网络错误，请重试"))
      .finally(() => setLoading(false))
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(initialize)
    }
  }, [router])

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [messages, isTyping])

  useEffect(() => {
    if (loading || !caseFile.decision || !witnesses.length) return
    localStorage.setItem("jury_witnesses", JSON.stringify(witnesses))
    localStorage.setItem("jury_messages", JSON.stringify(messages))
    localStorage.setItem("jury_insights", JSON.stringify(insights))
    localStorage.setItem("jury_asked", String(asked))
    localStorage.setItem("jury_warning", warning)
  }, [asked, caseFile.decision, insights, loading, messages, warning, witnesses])

  const sendQuestion = async (question: string, method: Strategy = strategy) => {
    const text = question.trim()
    if (!text || !witnesses.length || isTyping || isGenerating) return
    const nextAsked = asked + 1
    setInput("")
    setError("")
    setMessages((previous) => [...previous, { role: "user", text: `【${method}】${text}` }])
    setIsTyping(true)

    try {
      const results: WitnessResult[] = await Promise.all(witnesses.map(async (currentWitness, witnessIndex) => {
        try {
          const response = await fetch("/api/debate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              witness: currentWitness,
              userMessage: text,
              history: messages.slice(-6),
              caseFile,
              strategy: method,
              round: Math.min(nextAsked, 3),
            }),
          })
          const data = await response.json() as DebateData & { detail?: string; error?: string }
          if (!response.ok) throw new Error(data.detail || data.error || "对质暂时失败")
          return { witness: currentWitness, witnessIndex, data }
        } catch (reason: unknown) {
          return {
            witness: currentWitness,
            witnessIndex,
            error: reason instanceof Error ? reason.message : "回应失败",
          }
        }
      }))

      const noCoverage = (reply: string) =>
        /证词(未覆盖|中?没有|里?没有|不涉及)|没有相关经历|未覆盖这个问题/.test(reply.slice(0, 40)) ||
        (reply.length <= 60 && /(没有|无法|未)(回答|覆盖|涉及|提供|找到)|经历里没有|证词中?(没有|未)|不知道/.test(reply))
      const suitable = results.filter((result) => {
        const reply = result.data?.reply?.trim() || ""
        if (!reply || result.data?.coverage === "none" || noCoverage(reply)) return false
        return !/^(这一点我的经历里没有答案|没有答案|无法回答|不知道)[。！\s]*$/.test(reply)
      }).sort((a, b) => {
        if (a.data?.coverage === b.data?.coverage) return a.witnessIndex - b.witnessIndex
        return a.data?.coverage === "direct" ? -1 : 1
      })
      const failed = results.filter((result) => result.error).length
      const additions: Message[] = []
      const newInsights: Insight[] = []

      suitable.forEach((result) => {
        const data = result.data as DebateData
        const takeaway = data.takeaway || "这条经历只能作为局部证据，仍需结合你的限制条件判断。"
        additions.push(
          {
            role: "witness",
            text: data.reply || "",
            who: result.witness.name,
            witnessIndex: result.witnessIndex,
            coverage: data.coverage === "direct" ? "direct" : "partial",
          },
          { role: "guide", text: `${result.witness.name}：${takeaway}`, note: true },
        )
        newInsights.push({ text: takeaway, witness: result.witness.name, round: nextAsked })
      })

      if (suitable.length) {
        const notCovered = Math.max(0, witnesses.length - suitable.length - failed)
        additions.push({
          role: "guide",
          text: `本轮已同题核对 ${witnesses.length} 位证人，采纳 ${suitable.length} 份相关回应${notCovered > 0 ? `，${notCovered} 位证人的经历未覆盖此问题` : ""}${failed > 0 ? `，${failed} 位回应失败` : ""}。只有入卷证据会参与最终裁决。`,
        })
        setMessages((previous) => [...previous, ...additions])
        setInsights((previous) => [...previous, ...newInsights])
        setAsked(nextAsked)
        const modelWarning = results.map((result) => result.data?.warning).filter(Boolean)[0]
        if (modelWarning) setWarning(modelWarning)
      } else {
        const notice = failed === witnesses.length
          ? "本轮证人回应均失败，问题没有计入回合。请稍后原样重试。"
          : `${witnesses.length} 位证人的经历都没有覆盖这个问题，因此没有强行生成回答，本轮也不计入回合。可以换成更贴近证词经历的问题。`
        setMessages((previous) => [...previous, { role: "guide", text: notice }])
        if (failed) setError("部分或全部证人回应失败，可以原样重试；已成功回应仍会被保留。")
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "对质失败，请重试")
      setMessages((previous) => [...previous, { role: "guide", text: "这次发问没有入卷，可以原样重试，或先换一个问题。" }])
    } finally {
      setIsTyping(false)
    }
  }

  const handleObjection = () => {
    setStrategy("适用性异议")
    setInput("我认为这些经历未必适用于我，因为我的情况是 ")
  }

  const handleVerdict = async () => {
    if (!asked || isGenerating || isTyping) return
    setIsGenerating(true)
    setError("")
    try {
      const response = await fetch("/api/verdict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseFile, decision: caseFile.decision, messages, witnesses, insights }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "裁决生成失败")
      localStorage.setItem("jury_verdict", JSON.stringify(data))
      router.push("/verdict")
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "生成裁决失败，请重试")
      setIsGenerating(false)
    }
  }

  const hints = getHints(caseFile.mode)
  const currentRound = Math.min(asked + 1, 3)
  const guideText = asked >= 3
    ? "三回合已经完成。现在不该继续堆信息，该把证据变成行动阈值了。"
    : asked > 0
      ? `已完成 ${asked} 回合，采纳 ${insights.length} 条证据。下一回合，试着换一种质询策略。`
      : "每个问题都会询问全部证人。我会只保留相关回应，并整理成能用于裁决的笔记。"

  return (
    <main className="jury-shell">
      <header className="jury-header">
        <Link className="brand" href="/"><span className="brand-mark">决</span><span>决策陪审团<small>HEARING ROOM</small></span></Link>
        <div className="hearing-status"><span className="live-dot" />{MODE_NAMES[caseFile.mode]}审理中</div>
        <Link className="text-link" href="/">退出本案</Link>
      </header>

      <section className="case-strip">
        <div><span>本案决定</span><strong>{caseFile.decision || "正在读取案卷……"}</strong></div>
        <div className="case-reason"><span>待检验的核心理由</span><p>{caseFile.reason || "未填写"}</p></div>
        {caseFile.options?.length === 2 && <div className="case-options"><span>A</span>{caseFile.options[0]}<span>B</span>{caseFile.options[1]}</div>}
      </section>

      {warning && <div className="notice-bar"><strong>审理提示</strong>{warning}</div>}
      {error && <div className="error-bar" role="alert">{error}<button onClick={() => setError("")}>知道了</button></div>}

      {loading ? (
        <section className="summoning-panel">
          <LiuKanshan pose="thinking" />
          <div><span className="file-kicker">SUMMONING WITNESSES</span><h1>刘看山正在传唤证人</h1><p>寻找与「{caseFile.decision}」相关的知乎真实经历，并把原文装订进案卷。</p><div className="loading-line"><span /></div></div>
        </section>
      ) : (
        <div className="jury-layout">
          <aside className="witness-panel">
            <div className="panel-heading"><span>WITNESSES</span><h2>证人席</h2><p>同题询问全部证人，点击仅查看证词</p></div>
            <div className="witness-list">
              {witnesses.map((witness, index) => (
                <div
                  role="button"
                  tabIndex={0}
                  key={`${witness.name}-${index}`}
                  className={`witness-card ${index === activeWitness ? "active" : ""}`}
                  onClick={() => setActiveWitness(index)}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setActiveWitness(index) }}
                >
                  <div className="witness-card-top"><span>{witness.name}</span><b>{String(index + 1).padStart(2, "0")}</b></div>
                  <div className="witness-role">{witness.role || "经历核对"}{witness.isDemo && <i>演示</i>}</div>
                  <strong>{witness.tag}</strong>
                  <p>{witness.quote}</p>
                  {witness.sourceUrl && !witness.isDemo
                    ? <a href={witness.sourceUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>知乎原文 ↗</a>
                    : <small>无真实原文 · 仅演示机制</small>}
                </div>
              ))}
            </div>
          </aside>

          <section className="hearing-panel">
            <div className="hearing-panel-head">
              <div><span>ROUND {currentRound} / 3</span><h2>同题交叉质询 · {witnesses.length} 位证人</h2></div>
              <button type="button" onClick={handleObjection} disabled={isTyping}>质疑适用性</button>
            </div>

            <div className="chat-stream">
              {messages.map((message, index) => (
                <div key={index} className={`message-row ${message.role} ${message.note ? "note" : ""}`}>
                  {message.role === "guide" && <div className="guide-avatar">{message.note ? "笔" : "刘"}</div>}
                  <div className="message-bubble">
                    {message.role === "witness" && <span className="message-who">{message.who} · {message.coverage === "direct" ? "直接相关" : "部分相关"}</span>}
                    {message.role === "guide" && <span className="message-who">{message.note ? "刘看山的看山笔记" : "刘看山 · 主持"}</span>}
                    <p>{message.text}</p>
                    {message.role === "witness" && message.witnessIndex !== undefined && witnesses[message.witnessIndex]?.sourceUrl && !witnesses[message.witnessIndex]?.isDemo && (
                      <a href={witnesses[message.witnessIndex]?.sourceUrl} target="_blank" rel="noreferrer">核对这段知乎原文 ↗</a>
                    )}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="message-row witness"><div className="message-bubble typing"><span className="message-who">刘看山正在收集 {witnesses.length} 位证人的回应</span><div><i /><i /><i /></div></div></div>
              )}
              <div ref={chatEnd} />
            </div>

            <div className="question-workbench">
              <div className="guide-questions"><span>刘看山推荐这样问（将询问全部证人）</span><div>{hints.map((hint, index) => <button type="button" key={hint} disabled={isTyping} onClick={() => { setStrategy(STRATEGIES[index]); void sendQuestion(hint, STRATEGIES[index]) }}>{hint}</button>)}</div></div>
              <div className="strategy-tabs">{STRATEGIES.map((item) => <button type="button" key={item} className={strategy === item ? "active" : ""} onClick={() => setStrategy(item)}>{item}</button>)}</div>
              <div className="question-input">
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") void sendQuestion(input) }}
                  placeholder={`以「${strategy}」向全部 ${witnesses.length} 位证人发问……`}
                  disabled={isTyping || isGenerating}
                />
                <button type="button" onClick={() => void sendQuestion(input)} disabled={!input.trim() || isTyping || isGenerating}>发问</button>
              </div>
              <button className="ask-for-me" type="button" disabled={isTyping} onClick={() => { const index = asked % 3; setStrategy(STRATEGIES[index]); void sendQuestion(hints[index], STRATEGIES[index]) }}>不知道怎么问？让刘看山替我追问</button>
            </div>
          </section>

          <aside className="notes-panel">
            <div className="judge-companion"><LiuKanshan pose={asked >= 3 ? "verdict" : "guide"} /><div><span>刘看山 · 证据引导员</span><p>{guideText}</p></div></div>
            <div className="round-progress">
              {[0, 1, 2].map((index) => <div key={index} className={index < asked ? "done" : index === asked ? "current" : ""}><span>{index < asked ? "✓" : index + 1}</span><p>{["核对事实", "挑战边界", "形成行动"][index]}</p></div>)}
            </div>
            <div className="notes-heading"><span>看山笔记</span><b>{insights.length} 条入卷</b></div>
            <div className="insight-list">
              {!insights.length && <div className="empty-notes">每一轮回答都会被压缩成一条可用于裁决的证据，不再让对话散掉。</div>}
              {insights.map((insight, index) => <div className="insight-card" key={`${insight.round}-${index}`}><span>证据 {String(index + 1).padStart(2, "0")} · {insight.witness}</span><p>{insight.text}</p></div>)}
            </div>
            <button className="verdict-cta" type="button" disabled={!asked || isGenerating || isTyping} onClick={() => void handleVerdict()}>
              {isGenerating ? "刘看山正在合议……" : asked >= 3 ? "出具行动裁决 →" : `提前合议（已问 ${asked}/3）→`}
            </button>
            <p className="notes-footnote">建议完成三回合；证据足够时也可提前裁决。</p>
          </aside>
        </div>
      )}
    </main>
  )
}
