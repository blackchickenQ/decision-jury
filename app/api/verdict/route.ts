type CaseFile = {
  mode?: "single" | "compare" | "premortem"
  decision?: string
  reason?: string
  constraint?: string
  options?: string[]
}
type ExperimentStep = { title: string; detail: string; metric: string }
type JsonObject = Record<string, unknown>

function parseJsonObject(rawContent: string): JsonObject {
  const cleaned = rawContent.replace(/```json|```/gi, "").trim()
  const start = cleaned.indexOf("{")
  const end = cleaned.lastIndexOf("}")
  if (start < 0 || end <= start) throw new Error("No JSON object")
  const objectText = cleaned.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1")
  return JSON.parse(objectText) as JsonObject
}

function toText(value: unknown): string {
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join("；")
  if (value && typeof value === "object") return Object.values(value).map(toText).filter(Boolean).join("；")
  return ""
}

type Verdict = {
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

function fallbackVerdict(caseFile: CaseFile, insights: { text?: string }[]): Verdict {
  const decision = caseFile.decision || "这个决定"
  const reason = caseFile.reason || "核心假设尚未被验证"
  if (caseFile.mode === "compare") {
    const optionA = caseFile.options?.[0] || "选项 A"
    const optionB = caseFile.options?.[1] || "选项 B"
    const action = `用 7 天分别找 2 位经历过「${optionA}」和 2 位经历过「${optionB}」的人，用同一张清单核对日常职责、反馈机制、实际代价和两年后的能力出口，并向两边各确认 1 份可核对的岗位或路径说明。`
    const successMetric = "A、B 两边各取得至少 2 份可交叉核对的一手信息，并能用同一条个人目标解释当前取舍"
    const stopCondition = `若任何一方无法说清实际职责和考核方式，就暂不选择；若它触碰「${caseFile.constraint || "你的底线"}」，直接排除该选项`
    return {
      verdict: "先同尺比较，再在 A / B 之间选择",
      summary: `当前比较仍可能停留在标签想象。先把「${optionA}」与「${optionB}」放到同一张证据表，再决定哪边更值得。`,
      deathCause: `只比较「${optionA}」和「${optionB}」的外部标签，没有核对具体职责、直属环境与个人底线`,
      action,
      successMetric,
      stopCondition,
      reviewDate: "14 天后复盘",
      conditions: ["A、B 两边使用完全相同的问题清单", "每边至少核对 2 个独立信息来源", "按个人目标选择，不按外界标签和单一个案选择"],
      experimentSteps: [
        { title: "统一比较尺", detail: `把「${reason}」拆成职责、成长、收入、风险和退出路径五栏，不因选项不同而改变问题。`, metric: "1 张可同时填写 A、B 的空白比较表" },
        { title: "双边交叉核对", detail: action, metric: "A、B 各 2 份访谈记录和 1 份路径说明" },
        { title: "做一次反向选择", detail: `分别写下“为什么不选 A”和“为什么不选 B”，检查理由是否来自事实。${stopCondition}。`, metric: "1 条有证据支持的排除理由和 1 个当前优先项" },
      ],
      dissent: "如果出现一个明显更好的直属负责人或具体岗位内容，它可能比 A / B 的类型标签更值得优先选择。",
      warning: "模型裁决暂不可用，当前使用二选一专属的比较实验模板。",
    }
  }
  if (caseFile.mode === "premortem") {
    const action = `用 7 天做一次“失败退出演练”：完成 1 次限时现实检验，核对 3 个关键时间节点，并联系 2 位直接相关人士确认失败后的返岗、复学或转向条件。`
    const successMetric = "得到 1 份当前差距数据、1 张逐周资源预算表，以及至少 1 条经过本人或机构确认的可执行退出路径"
    const stopCondition = `若现实检验显示差距无法在给定期限内弥补，或预算与退出路径触碰「${caseFile.constraint || "你的底线"}」，取消重注，改为低成本并行方案`
    return {
      verdict: "先排除首要死因，再决定是否重注",
      summary: `本案按“「${decision}」已经失败”倒推。眼下最重要的不是增强信心，而是验证最致命假设，并提前留下退出通道。`,
      deathCause: `最担心的结果是「${reason}」，但目前还缺少早期信号、现实差距数据和可执行的失败衔接方案`,
      action,
      successMetric,
      stopCondition,
      reviewDate: "14 天后复盘",
      conditions: ["先假设失败已经发生，不用成功愿望修改死因", "每个死因必须对应一个可观察的早期信号", "在投入前确认至少 1 条真实可行的退出路径"],
      experimentSteps: [
        { title: "还原失败时间线", detail: `写下「${decision}」从第一个坏信号到最终失败的 3 个节点，标出最早可干预的位置。`, metric: "3 个按时间排列、可被观察的失败节点" },
        { title: "验证首要死因", detail: action, metric: "1 份现实差距数据、2 份外部确认记录" },
        { title: "预留下一个复活点", detail: `把预算、期限和退出动作写死。${stopCondition}。`, metric: "1 张包含停止线和退出动作的逐周计划" },
      ],
      dissent: "事前验尸可能放大风险而低估学习收益；如果本次投入很小且即使失败也有明确收获，可以允许更宽松的通过线。",
      warning: "模型裁决暂不可用，当前使用事前验尸专属的失败排查模板。",
    }
  }
  const action = `用 7 天为「${decision}」完成一次低成本真实核对：接触 3 位直接相关的人，观察他们是否已经为同类问题付出过时间、金钱或持续行动。`
  const successMetric = "至少 2 位目标对象给出可验证的实际承诺，而不只是口头鼓励"
  const stopCondition = `如果无人愿意采取实际行动，或结果触碰「${caseFile.constraint || "你的底线"}」，暂停加码并重新界定问题`
  const verdict = "有条件通过，先验证再投入"
  return {
    verdict,
    summary: insights.length
      ? `本案已形成 ${insights.length} 条看山笔记。当前证据不足以支持一次性重注，但足够支持一次有停止线的低成本试验。`
      : "当前信息不足以直接下重注，建议先把主观判断改写成可证伪的实验。",
    deathCause: `把「${reason}」直接当成已成立事实，忽略适用条件与反向证据`,
    action,
    successMetric,
    stopCondition,
    reviewDate: "14 天后复盘",
    conditions: ["验证对象与本案真正相关，而不是只问身边的朋友", "记录支持证据，也主动记录反证和沉默", "结果达到通过阈值才追加时间或金钱"],
    experimentSteps: [
      { title: "把假设写下来", detail: `将「${reason}」改写成一个包含对象、行为和期限的可观察判断。`, metric: "一句话说清：谁在什么情况下会做什么" },
      { title: "完成真实核对", detail: action, metric: "留下 3 份原始记录，至少主动寻找 1 条反证" },
      { title: "按阈值做决定", detail: `通过标准：${successMetric}。停止条件：${stopCondition}。`, metric: "达到则小步加码，未达到则停止或改写假设" },
    ],
    dissent: "这份裁决不是鼓励或反对你做决定，而是反对在没有验证阈值的情况下一次性投入全部资源。",
    warning: "模型裁决暂不可用，当前为基于案卷生成的结构化行动模板。",
  }
}

export async function POST(req: Request) {
  let caseFile: CaseFile = {}
  let insights: { text?: string }[] = []
  try {
    const body = await req.json()
    caseFile = body.caseFile || { decision: body.decision, mode: "single", options: [] }
    insights = Array.isArray(body.insights) ? body.insights : []
    const witnesses = Array.isArray(body.witnesses) ? body.witnesses : []
    const messages = Array.isArray(body.messages) ? body.messages : []
    const fallback = fallbackVerdict(caseFile, insights)
    if (!process.env.ZHIPU_API_KEY) {
      return Response.json({ ...fallback, warning: "模型密钥未配置，当前展示结构化行动模板；接入模型后会结合对质记录细化。" })
    }

    const systemPrompt = `你是决策陪审团的主审官，刘看山负责宣读你的裁决。
你的目标不是评价用户是否勇敢，而是把对质结果变成一份低成本、可验证、有停止线的行动方案。
只能把证词中存在的经历当事实；可以清楚标注推理。不得虚构用户已经做过的验证。
方案必须适合一个普通个人在七天内、用很低的成本完成。不要把需要团队、大额投放或上千样本才能做的事情写成最小实验。
输出必须是 JSON，不要 markdown，不要多余解释：
{
  "verdict": "短而明确的裁决标题；二选一应指出当前优先验证哪个选项，事前验尸应指出首要死因",
  "summary": "80 字以内，概括哪些证据支持、哪些证据仍缺失",
  "deathCause": "最可能导致决定失败或后悔的根因，不堆砌多个名词",
  "action": "7 天内可完成的一个最小真实验证动作，要有对象、数量和方式；适合个人执行，优先 3–20 个真实对象或小额流量，不要默认要求 1000 人等大样本",
  "successMetric": "可观察、可记录的通过阈值，不能使用‘感觉不错’；阈值是本次团队约定的止损线，不得冒充行业基准",
  "stopCondition": "明确的停止或转向条件，并结合用户底线",
  "reviewDate": "14 天后复盘",
  "conditions": ["3 条执行验证时必须遵守的条件"],
  "experimentSteps": [
    {"title": "步骤名", "detail": "具体怎么做", "metric": "本步留下什么证据"},
    {"title": "步骤名", "detail": "具体怎么做", "metric": "本步留下什么证据"},
    {"title": "步骤名", "detail": "具体怎么做", "metric": "本步留下什么证据"}
  ],
  "dissent": "一条少数意见：说明本裁决最可能在哪种情况下失效"
}`

    const userPrompt = `【审理模式】${caseFile.mode || "single"}
【决定】${caseFile.decision || "未提供"}
【成立理由或最担心的失败】${caseFile.reason || "未提供"}
【底线】${caseFile.constraint || "未提供"}
【A / B 选项】${Array.isArray(caseFile.options) ? caseFile.options.join(" / ") : "无"}
【看山笔记】${insights.map((item, index) => `${index + 1}. ${item.text || ""}`).join("\n")}
【证词库】${witnesses.map((witness: { name?: string; tag?: string; quote?: string }) => `${witness.name || "证人"}（${witness.tag || "作者"}）：${witness.quote || ""}`).join("\n")}
【对质记录】${messages.map((message: { role?: string; who?: string; text?: string }) => `${message.who || message.role}: ${message.text || ""}`).join("\n")}`

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
        temperature: 0.25,
        max_tokens: 1800,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(40000),
    })
    if (!response.ok) return Response.json(fallback)

    const data = await response.json()
    const raw = String(data.choices?.[0]?.message?.content || "").replace(/```json|```/g, "").trim()
    try {
      const parsed = parseJsonObject(raw)
      const modelAction = toText(parsed.action)
      const modelMetric = toText(parsed.successMetric)
      const parsedConditions = Array.isArray(parsed.conditions) ? parsed.conditions.map(toText).filter((item) => item.length > 5).slice(0, 3) : []
      const parsedSteps: ExperimentStep[] = Array.isArray(parsed.experimentSteps) ? parsed.experimentSteps.slice(0, 3).map((item: unknown) => {
        const step = item && typeof item === "object" ? item as Record<string, unknown> : {}
        return { title: toText(step.title), detail: toText(step.detail), metric: toText(step.metric) }
      }) : []
      const placeholders = ["步骤名", "具体怎么做", "本步留下什么证据"]
      const irreversibleStep = parsedSteps.some((step) => /加入团队|开始实际工作|辞职|休学|全职|投入全部/.test(`${step.title}${step.detail}`))
      const validSteps = !irreversibleStep && parsedSteps.length === 3 && parsedSteps.every((step) =>
        step.title.length > 1 && step.detail.length > 8 && step.metric.length > 4 &&
        !placeholders.includes(step.title) && !placeholders.includes(step.detail) && !placeholders.includes(step.metric)
      )
      const sampleSizes = [...modelAction.matchAll(/(\d+)\s*(?:位|名|个|人|用户|访客)/g)].map((match) => Number(match[1]))
      const validAction = modelAction.length > 20 && /\d+\s*(天|位|名|个|次|页|条|元|%|小时|周)/.test(modelAction) && sampleSizes.every((size) => size <= 20)
      const validMetric = modelMetric.length > 8 && /\d/.test(modelMetric)
      const usedFallback = !validAction || !validMetric || !validSteps || parsedConditions.length < 3
      return Response.json({
        verdict: toText(parsed.verdict) || fallback.verdict,
        summary: toText(parsed.summary) || fallback.summary,
        deathCause: toText(parsed.deathCause) || fallback.deathCause,
        action: validAction ? modelAction : fallback.action,
        successMetric: validMetric ? modelMetric : fallback.successMetric,
        stopCondition: toText(parsed.stopCondition) || fallback.stopCondition,
        reviewDate: fallback.reviewDate,
        conditions: parsedConditions.length === 3 ? parsedConditions : fallback.conditions,
        experimentSteps: validSteps ? parsedSteps : fallback.experimentSteps,
        dissent: toText(parsed.dissent) || fallback.dissent,
        warning: usedFallback ? "部分模型内容未通过可执行性检查，已用本案专属行动方案补齐。" : undefined,
      })
    } catch {
      return Response.json({ ...fallback, warning: "模型返回格式异常，已使用结构化行动模板完成裁决。" })
    }
  } catch {
    return Response.json({ ...fallbackVerdict(caseFile, insights), warning: "裁决服务暂时异常，已保留完整行动模板。" })
  }
}
