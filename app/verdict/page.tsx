"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import LiuKanshan from "../liu-kanshan"

type Witness = { name: string; tag: string; quote: string; sourceUrl?: string; role?: string; isDemo?: boolean }
type ExperimentStep = { title: string; detail: string; metric: string }
type VerdictData = {
  verdict: string
  summary: string
  deathCause: string
  action: string
  successMetric: string
  stopCondition: string
  reviewDate: string
  conditions: string[]
  experimentSteps: ExperimentStep[]
  dissent: string
  warning?: string
}
type CaseFile = { mode?: string; decision?: string; reason?: string; constraint?: string; options?: string[] }

export default function VerdictPage() {
  const [caseFile, setCaseFile] = useState<CaseFile>({})
  const [witnesses, setWitnesses] = useState<Witness[]>([])
  const [verdict, setVerdict] = useState<VerdictData | null>(null)
  const [checked, setChecked] = useState<boolean[]>([])
  const [copyStatus, setCopyStatus] = useState("")

  useEffect(() => {
    const initialize = window.setTimeout(() => {
    try {
      const rawCase = localStorage.getItem("jury_case")
      if (rawCase) setCaseFile(JSON.parse(rawCase))
      else setCaseFile({ decision: localStorage.getItem("jury_decision") || "", reason: localStorage.getItem("jury_reason") || "" })
      const rawWitnesses = localStorage.getItem("jury_witnesses")
      if (rawWitnesses) setWitnesses(JSON.parse(rawWitnesses))
      const rawVerdict = localStorage.getItem("jury_verdict")
      if (rawVerdict) {
        const parsed = JSON.parse(rawVerdict) as VerdictData
        setVerdict(parsed)
        setChecked((parsed.conditions || []).map(() => false))
      }
    } catch {
      setCopyStatus("案卷读取不完整，请返回重新审理")
    }
    }, 0)
    return () => window.clearTimeout(initialize)
  }, [])

  const completed = checked.filter(Boolean).length
  const copyVerdict = async () => {
    if (!verdict) return
    const text = `【决策陪审团 · 行动裁决】\n决定：${caseFile.decision || "未填写"}\n裁决：${verdict.verdict}\n核心风险：${verdict.deathCause}\n最小验证：${verdict.action}\n通过指标：${verdict.successMetric}\n停止条件：${verdict.stopCondition}\n复盘：${verdict.reviewDate}`
    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus("裁决摘要已复制")
    } catch {
      setCopyStatus("复制受限，可以使用打印保存")
    }
  }

  return (
    <main className="verdict-shell">
      <header className="verdict-header no-print">
        <Link className="brand" href="/"><span className="brand-mark">决</span><span>决策陪审团<small>ACTION VERDICT</small></span></Link>
        <div><button type="button" onClick={() => void copyVerdict()}>复制摘要</button><button type="button" onClick={() => window.print()}>打印 / 保存</button></div>
      </header>
      {copyStatus && <div className="copy-status no-print">{copyStatus}</div>}

      <article className="verdict-document">
        <div className="verdict-topline"><span>DECISION JURY · 行动裁决书</span><span>{verdict?.reviewDate || "14 天后复盘"}</span></div>
        <section className="verdict-hero">
          <div className="verdict-heading"><span className="file-kicker">THE COURT HAS REACHED A VERDICT</span><h1>{verdict?.verdict || "正在整理裁决……"}</h1><p>{verdict?.summary || "正在读取本案证据与看山笔记。"}</p></div>
          <div className="verdict-mascot"><LiuKanshan pose="verdict" /><span>刘看山<br />证据引导员</span></div>
        </section>

        {verdict?.warning && <div className="verdict-warning">{verdict.warning}</div>}

        <section className="verdict-case">
          <span>本案决定</span><h2>{caseFile.decision || "未填写"}</h2>
          {caseFile.options?.length === 2 && <div><p><b>A</b>{caseFile.options[0]}</p><p><b>B</b>{caseFile.options[1]}</p></div>}
          <footer><span>待检验理由：{caseFile.reason || "未填写"}</span><span>底线：{caseFile.constraint || "未填写"}</span></footer>
        </section>

        <section className="verdict-diagnosis">
          <div className="diagnosis-main"><span>01 / 最可能的失败根因</span><h3>{verdict?.deathCause || "分析中……"}</h3></div>
          <div className="dissent-card"><span>少数意见</span><p>{verdict?.dissent || "任何经验都有适用边界，本裁决也不例外。"}</p></div>
        </section>

        <section className="experiment-section">
          <div className="section-heading"><span>02 / 最小验证实验</span><h2>接下来 7 天，不追加信念，只补充证据</h2></div>
          <div className="action-highlight"><span>最小动作</span><p>{verdict?.action || "分析中……"}</p></div>
          <div className="experiment-steps">
            {(verdict?.experimentSteps || []).map((step, index) => (
              <div className="experiment-step" key={`${step.title}-${index}`}><b>{String(index + 1).padStart(2, "0")}</b><div><h3>{step.title}</h3><p>{step.detail}</p><span>留下证据：{step.metric}</span></div></div>
            ))}
          </div>
        </section>

        <section className="threshold-grid">
          <div className="threshold pass"><span>03 / 通过指标</span><h3>达到它，才小步加码</h3><p>{verdict?.successMetric || "分析中……"}</p></div>
          <div className="threshold stop"><span>04 / 停止条件</span><h3>碰到它，就停止或转向</h3><p>{verdict?.stopCondition || "分析中……"}</p></div>
        </section>

        <section className="conditions-section">
          <div className="conditions-heading"><div><span>05 / 执行协议</span><h2>完成后逐项勾选</h2></div><strong>{completed} / {checked.length || 3}</strong></div>
          <div className="condition-progress"><span style={{ width: `${checked.length ? (completed / checked.length) * 100 : 0}%` }} /></div>
          <div className="condition-list">
            {(verdict?.conditions || []).map((condition, index) => (
              <label key={condition} className={checked[index] ? "checked" : ""}>
                <input type="checkbox" checked={Boolean(checked[index])} onChange={() => setChecked((previous) => previous.map((value, itemIndex) => itemIndex === index ? !value : value))} />
                <span>{condition}</span>
              </label>
            ))}
          </div>
          <p className="review-note">复盘提醒：{verdict?.reviewDate || "14 天后"}，带着原始记录回来，不凭印象修改结论。</p>
        </section>

        <section className="evidence-section">
          <div className="section-heading"><span>06 / 证词溯源</span><h2>结论可以争论，来源必须能核对</h2></div>
          <div className="evidence-list">
            {witnesses.map((witness, index) => (
              <div className="evidence-item" key={`${witness.name}-${index}`}><b>{String(index + 1).padStart(2, "0")}</b><div><span>{witness.name} · {witness.role || "经历核对"} · {witness.tag}</span><p>{witness.quote}</p>{witness.sourceUrl && !witness.isDemo ? <a href={witness.sourceUrl} target="_blank" rel="noreferrer">查看知乎原文 ↗</a> : <small>演示角色，无真实原文</small>}</div></div>
            ))}
          </div>
        </section>

        <footer className="document-footer"><span>本裁决基于公开回答重构角色与用户输入生成，不冒充原作者，不构成医疗、法律或投资建议。</span><span>决策陪审团 · 先开庭，再决定</span></footer>
      </article>

      <div className="verdict-actions no-print"><Link href="/jury">← 返回对质</Link><Link className="new-case" href="/">审理新决定 →</Link></div>
    </main>
  )
}
