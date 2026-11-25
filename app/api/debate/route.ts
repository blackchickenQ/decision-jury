type Witness = {
  name?: string
  tag?: string
  quote?: string
  content?: string
  title?: string
  isDemo?: boolean
}
type HistoryMessage = { role: string; who?: string; text: string }

type DebateResult = {
  reply: string
  takeaway: string
  coverage: "direct" | "partial" | "none"
  warning?: string
}

function toText(value: unknown): string {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join("\n")
  if (value && typeof value === "object") {
    return Object.entries(value).map(([key, item]) => `【${key}】${toText(item)}`).join("\n")
  }
  return ""
}

function fallbackAnswer(witness: Witness, userMessage: string, warning?: string): DebateResult {
  const evidence = (witness.content || witness.quote || "暂无可用证词").slice(0, 240)
  return {
    reply: `我先把能确认的内容与推测分开。现有材料是：“${evidence}”\n\n针对「${userMessage}」，它能提供方向，但不能替代你的事实核对。请继续追问适用条件，或换一位证人交叉验证。`,
    takeaway: "把这段内容当作待核对的线索，而不是已经成立的结论；关键假设仍需真实行动验证。",
    coverage: "partial",
    warning,
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const witness: Witness = body.witness
    const userMessage = String(body.userMessage || "").trim()
    const caseFile = body.caseFile || {}
    const strategy = String(body.strategy || "证据追问")
    const history: HistoryMessage[] = Array.isArray(body.history) ? body.history.slice(-6) : []

    if (!witness?.quote || !userMessage) {
      return Response.json({ error: "参数缺失", detail: "需要证词和问题才能开始对质" }, { status: 400 })
    }
    if (!process.env.ZHIPU_API_KEY) {
      return Response.json(fallbackAnswer(witness, userMessage, "模型密钥未配置，当前为证词整理模式，回答不会新增事实。"))
    }

    const systemPrompt = `你是决策陪审团中的一名证人，正在帮助用户审清一个真实决定。
你的职责不是机械地说“不知道”，也不是替用户做决定，而是把证词变成有用的证据。

必须遵守：
1. 【经历事实】只能来自给定证词，不得补充数字、人物、事件或心理活动。
2. 【对本案的启发】允许进行谨慎推理，但必须使用“如果……那么……”或“这可能意味着……”明确标记为推理。
3. 用户问的是应用方法时，可以基于证词给出低成本核对思路，不得假装这是原作者说过的话。
4. 不要把用户提供的决定、理由或底线误写成证人的亲身经历。
5. 如果本轮策略是“行动追问”，必须给出包含对象、数量、期限和观察指标的一步动作；禁止只说“做市场调研”“收集数据”“找用户聊聊”而不给执行规格。
6. 若证词与问题无关，指出缺少哪类信息，同时给一个能继续审下去的追问，不要只回答“不知道”。
7. 回应控制在 240 字以内，语气温和、直接，不端着，不喊口号。

只输出 JSON，不要使用 markdown：
{
  "reply": "给用户的完整回应，可用换行分为“证词能确认”和“对你的启发”两部分",
  "takeaway": "刘看山可记入案卷的一句话，说明这条回应改变了什么判断，50 字以内",
  "coverage": "direct（证词直接覆盖）/ partial（只能部分启发）/ none（基本无关）"
}`

    const userPrompt = `【本案决定】${caseFile.decision || "未提供"}
【用户最依赖的理由】${caseFile.reason || "未提供"}
【用户底线】${caseFile.constraint || "未提供"}
【备选选项】${Array.isArray(caseFile.options) ? caseFile.options.join(" / ") : "无"}
【本轮策略】${strategy}
【证人身份】${witness.name || "证人"}，${witness.tag || "知乎作者"}
【证词标题】${witness.title || "知乎回答"}
【完整证词】${witness.content || witness.quote}
【最近对质】${history.map((item) => `${item.who || item.role}: ${item.text}`).join("\n")}
【用户本轮问题】${userMessage}
【行动追问的额外输出要求】如果本轮策略是行动追问，reply 必须包含“在 7 天内，通过哪个渠道，接触多少位什么对象，完成什么动作，记录哪一项行为指标”。不要只列调研、制作、分析等抽象步骤。`

    const response = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.ZHIPU_API_KEY}`,
      },
      body: JSON.stringify({
        model: "glm-4-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.35,
        max_tokens: 650,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(30000),
    })
    if (!response.ok) {
      return Response.json(fallbackAnswer(witness, userMessage, "模型审理暂时不可用，本轮已降级为证词整理，不会新增经历事实。"))
    }

    const data = await response.json()
    const raw = String(data.choices?.[0]?.message?.content || "").replace(/```json|```/g, "").trim()
    try {
      const parsed = JSON.parse(raw)
      let reply = toText(parsed.reply) || raw
      const largeSample = reply.match(/(\d{2,})\s*(位|名|个|人)/)
      if (strategy === "行动追问" && largeSample && Number(largeSample[1]) > 20) {
        reply = reply.replace(largeSample[0], `5-10 ${largeSample[2]}`)
      }
      const hasExecutionSpec = /\d+\s*(天|位|名|个|次|页|条|元|%|小时|周)/.test(reply)
      if (strategy === "行动追问" && !hasExecutionSpec) {
        reply += "\n\n【执行规格】把动作限定为 7 天、1 个渠道、5 位直接相关对象；提前写下 1 项可观察行为指标，只记录实际选择、试用、付费或一手证明，不把口头称赞算作通过。"
      }
      return Response.json({
        reply,
        takeaway: toText(parsed.takeaway) || "这段经历提供了一个待验证的判断，仍需核对它是否适用于你。",
        coverage: ["direct", "partial", "none"].includes(parsed.coverage) ? parsed.coverage : "partial",
      })
    } catch {
      return Response.json({
        reply: raw || fallbackAnswer(witness, userMessage).reply,
        takeaway: "证人提供了一条新线索；请把它当作待验证证据，而不是最终决定。",
        coverage: "partial",
      })
    }
  } catch {
    return Response.json({ error: "对质接口内部错误", detail: "审理暂时中断，请原样重试" }, { status: 500 })
  }
}
