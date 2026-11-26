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
  evidenceQuote?: string
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

function parseJsonObject(rawContent: string): Record<string, unknown> {
  const cleaned = rawContent.replace(/```json|```/gi, "").trim()
  const start = cleaned.indexOf("{")
  if (start < 0) throw new Error("No JSON object")
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < cleaned.length; index += 1) {
    const char = cleaned[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') { inString = true; continue }
    if (char === "{") depth += 1
    if (char === "}") {
      depth -= 1
      if (depth === 0) {
        const objectText = cleaned.slice(start, index + 1).replace(/,\s*([}\]])/g, "$1")
        return JSON.parse(objectText) as Record<string, unknown>
      }
      if (depth < 0) throw new Error("Unexpected closing brace")
    }
  }
  throw new Error("Incomplete JSON object")
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

// 未覆盖的统一文案：措辞不含“建议/应该/可以”等字眼，避免被误读成仍在给行动建议
const NO_COVERAGE_REPLY = "证词中找不到能回答这个问题的具体经历，本席不就此问题作证。"

// 独立的相关性审查：实测让“负责生成完整回答”的模型顺带自报 relevance 分数并不可靠，
// 它对证词完全无关的“量子计算”也一律打 2 分并凑一句原文当引用。
// 因此拆出一次专门判定，与正式生成并发执行，延迟几乎不变。
// 返回 false = 证词完全不涉及问题主题，应判未覆盖；null = 审查不可用，放行给后续防线。
async function judgeRelevance(witness: Witness, userMessage: string): Promise<boolean | null> {
  try {
    const judgeSystem = `你是「决策陪审团」的相关性审查员。只做一件事：判断给定证词能否就用户的问题作证。

输出 false（无关）的唯一情形：问题引入了证词完全没涉及的新领域或新概念（例：证词只讲校园创业，问题却问量子计算、考研备考、天体物理），证词里没有任何一句经历事实能支撑回答。

其余一律输出 true，尤其包括这些围绕证词本身展开的问法：问经历中的关键风险、问「我的情况与你的经历有哪些差异」、问最小验证的第一步、问怎么判断市场需求、追问具体数字（证词没写数字也不算无关，交给后续证据校验处理）。

只输出 JSON，不要 markdown：
{"covered": true 或 false, "reason": "证词中最贴近问题的一句逐字原文；若无关则写「证词未涉及该主题」"}`
    const response = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.ZHIPU_API_KEY}`,
      },
      body: JSON.stringify({
        model: "glm-4-flash",
        messages: [
          { role: "system", content: judgeSystem },
          { role: "user", content: `【完整证词】${witness.content || witness.quote}\n【用户问题】${userMessage}` },
        ],
        temperature: 0,
        max_tokens: 160,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) return null
    const data = await response.json()
    const parsed = parseJsonObject(String(data.choices?.[0]?.message?.content || ""))
    if (parsed.covered === false || parsed.covered === "false") return false
    if (parsed.covered === true || parsed.covered === "true") return true
    return null
  } catch {
    return null
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

必须先做相关性判定，再写回答：
- 第一步：先给 relevance 打分（0=证词完全没提到这个问题的核心概念；1=勉强沾边；2=部分相关；3=直接覆盖）。
- 第二步：在证词里找一句能直接支撑本问题回答的原文。找不到，就把 coverage 设为 "none"，evidenceQuote 留空，reply 只写一句“证词未覆盖这个问题”，不给任何启发、建议或行动步骤。
- 第三步：找到了，把这句原文逐字写进 evidenceQuote，再基于它回答。relevance 为 0 时，coverage 必须为 "none"，reply 只写一句缺失说明，禁止任何启发、建议或行动。

必须遵守：
1. 【经历事实】只能来自给定证词，不得补充数字、人物、事件或心理活动。
2. 【对本案的启发】允许进行谨慎推理，但必须使用“如果……那么……”或“这可能意味着……”明确标记为推理。
3. 用户问的是应用方法时，可以基于证词给出低成本核对思路，不得假装这是原作者说过的话。
4. 不要把用户提供的决定、理由或底线误写成证人的亲身经历。
5. 仅当 coverage 不为 none 且本轮策略是“行动追问”时，才给出包含对象、数量、期限和观察指标的一步动作；禁止只说“做市场调研”“收集数据”“找用户聊聊”而不给执行规格。
6. reply 的“证词能确认”部分必须写出 evidenceQuote 的原文，不能留空或只写标题。
7. coverage 为 none 时，禁止输出任何行动、数量或执行规格。
8. 回应控制在 240 字以内，语气温和、直接，不端着，不喊口号。

只输出 JSON，不要使用 markdown：
{
  "relevance": "0-3 的整数：0=证词完全没提到这个问题的核心概念；1=勉强沾边；2=部分相关；3=直接覆盖",
  "coverage": "direct（证词直接覆盖）/ partial（只能部分启发）/ none（证词中找不到能回答该问题的经历事实）",
  "evidenceQuote": "逐字引用证词中支撑本回答的原句；none 时留空字符串",
  "reply": "给用户的完整回应，可用换行分为“证词能确认”和“对你的启发”两部分；none 时只写一句缺失说明",
  "takeaway": "刘看山可记入案卷的一句话，说明这条回应改变了什么判断，50 字以内；none 时留空字符串"
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

    // 相关性审查与正式生成并发发起，避免串行增加等待
    const relevancePromise = judgeRelevance(witness, userMessage)
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
    // ===== P0-2：独立相关性审查判定无关，直接判未覆盖，不给模型凑答案的机会 =====
    const covered = await relevancePromise
    if (covered === false) {
      return Response.json({ reply: NO_COVERAGE_REPLY, takeaway: "", coverage: "none" })
    }
    const raw = String(data.choices?.[0]?.message?.content || "").replace(/```json|```/g, "").trim()
    try {
      const parsed = parseJsonObject(raw)
      const coverage = ["direct", "partial", "none"].includes(String(parsed.coverage)) ? String(parsed.coverage) : "partial"
      // 模型自报 0 分也直接判未覆盖（保留方案原有的第一道防线）
      const relevance = Number(parsed.relevance)
      if (Number.isFinite(relevance) && relevance === 0) {
        return Response.json({ reply: NO_COVERAGE_REPLY, takeaway: "", coverage: "none" })
      }
      let reply = toText(parsed.reply) || raw
      // ===== P0-1：证据引用校验，禁止伪装引用 =====
      const quoteRaw = toText(parsed.evidenceQuote).trim()
      const sourceRaw = toText(witness.content || witness.quote)
      // 归一化：去掉空白和中英文标点，避免因格式差异误判
      const normalize = (s: string) => s.replace(/[\s，。！？；：、""''（）()【】\[\]—\-…·,.!?;:]/g, "")
      const quoteNorm = normalize(quoteRaw)
      const sourceNorm = normalize(sourceRaw)
      if (coverage !== "none") {
        const quoteValid = quoteNorm.length >= 8 && sourceNorm.length > 0 && sourceNorm.includes(quoteNorm)
        if (!quoteValid) {
          return Response.json({
            reply: "证词中找不到能逐字支撑这个回答的原文，本席不就此问题作证。",
            takeaway: "",
            coverage: "none",
            warning: "这位证人的证词缺少可逐字引用的原文，本轮未纳入案卷。",
          })
        }
        // 把逐字原文强制写进 reply 的「证词能确认」段，前端展示的就是可核对的原文
        reply = reply.replace(/^(【?证词能确认】?)[：:]?[^\n]*/m, `$1「${quoteRaw}」`)
      }
      // 模型偶会空着「证词能确认」段却硬凑一段通用建议，这种情况按未覆盖处理，不强行入卷
      const emptyConfirmation = /证词能确认[：:]?\s*(?:对你的启发|【执行规格】|$)/m.test(reply)
      const selfReportedNone = /证词(未覆盖|中?没有|里?没有|不涉及)|没有相关经历|找不到能回答|未覆盖这个问题/.test(reply.slice(0, 40))
      if (coverage === "none" || emptyConfirmation || selfReportedNone) {
        return Response.json({ reply: NO_COVERAGE_REPLY, takeaway: "", coverage: "none" })
      }
      // ===== P1-2：非行动追问策略不应给执行规格 =====
      if (strategy !== "行动追问") {
        reply = reply.replace(/在\s*\d+\s*天内[^\n。]*?(?:记录|指标)[^\n。]*[。]?/g, "")
      }
      // ===== P1-1：大样本压制处理所有匹配 =====
      if (strategy === "行动追问") {
        reply = reply.replace(/(\d{2,})\s*(位|名|个|人)/g, (match, num, unit) =>
          Number(num) > 20 ? `5-10 ${unit}` : match
        )
      }
      const hasExecutionSpec = /\d+\s*(天|位|名|个|次|页|条|元|%|小时|周)/.test(reply)
      if (strategy === "行动追问" && !hasExecutionSpec) {
        reply += "\n\n【执行规格】把动作限定为 7 天、1 个渠道、5 位直接相关对象；提前写下 1 项可观察行为指标，只记录实际选择、试用、付费或一手证明，不把口头称赞算作通过。"
      }
      return Response.json({
        reply,
        takeaway: toText(parsed.takeaway) || "这段经历提供了一个待验证的判断，仍需核对它是否适用于你。",
        coverage,
        evidenceQuote: quoteRaw,
      })
    } catch {
      return Response.json({
        reply: raw || "本次回应未能整理成有效证词，无法确认与本问题的相关性。",
        takeaway: "",
        coverage: "none",
        warning: "有 1 位证人的回应未能整理，已按未覆盖处理，不计入案卷。",
      })
    }
  } catch {
    return Response.json({ error: "对质接口内部错误", detail: "审理暂时中断，请原样重试" }, { status: 500 })
  }
}
