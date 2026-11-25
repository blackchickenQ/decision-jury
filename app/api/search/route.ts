const ZHIHU_SEARCH_URL = "https://developer.zhihu.com/api/v1/content/zhihu_search"
const ROLES = ["经历核对", "风险核对", "行动核对"]

type ZhihuItem = {
  Title?: string
  ContentText?: string
  Url?: string
  AuthorName?: string
  AuthorBadgeText?: string
}
type CaseFile = {
  decision?: string
  reason?: string
  constraint?: string
}

function buildDemoWitnesses(caseFile: CaseFile) {
  const decision = caseFile.decision || "这个决定"
  const reason = caseFile.reason || "目前只有主观判断"
  const constraint = caseFile.constraint || "时间、金钱和机会成本"
  return [
    {
      name: "演示证人 A",
      tag: "事实核对员",
      role: "经历核对",
      quote: `你把「${reason}」当作成立理由。质询时要先分清：它是已经发生的事实，还是尚未验证的判断？`,
      content: `本案决定是「${decision}」。当前最依赖的理由是「${reason}」。请帮助用户识别其中可观察的事实、主观推测和仍缺少的证据。`,
      sourceUrl: "",
      title: "机制演示",
      isDemo: true,
    },
    {
      name: "演示证人 B",
      tag: "边界核对员",
      role: "风险核对",
      quote: `你设置的底线是「${constraint}」。真正要审的不是风险存不存在，而是哪种信号出现时必须停止。`,
      content: `本案决定是「${decision}」，限制条件是「${constraint}」。请围绕不可逆代价、早期风险信号和结论不适用的情况回答。`,
      sourceUrl: "",
      title: "机制演示",
      isDemo: true,
    },
    {
      name: "演示证人 C",
      tag: "实验核对员",
      role: "行动核对",
      quote: `如果暂时无法证明「${decision}」一定正确，就先设计一个低成本、能推翻它的实验，而不是继续搜集支持意见。`,
      content: `本案决定是「${decision}」。请把讨论转成一个周期短、成本低、结果可观察的验证动作，并说明通过和停止的阈值。`,
      sourceUrl: "",
      title: "机制演示",
      isDemo: true,
    },
  ]
}

function formatWitnesses(items: ZhihuItem[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = item.Url || item.Title || ""
    if (!key || seen.has(key)) return false
    seen.add(key)
    return Boolean(item.ContentText?.trim() || item.Title?.trim())
  }).slice(0, 3).map((item, index) => {
    const content = (item.ContentText || "").replace(/\s+/g, " ").trim().slice(0, 5000)
    const title = (item.Title || "").trim()
    const raw = content || title
    return {
      name: `证人 ${String.fromCharCode(65 + index)}`,
      tag: item.AuthorName || item.AuthorBadgeText || "知乎作者",
      role: ROLES[index],
      quote: raw.length > 180 ? `${raw.slice(0, 180)}……` : raw,
      content: raw,
      sourceUrl: item.Url,
      title,
      isDemo: false,
    }
  })
}

function withDemoFill(witnesses: ReturnType<typeof formatWitnesses>, caseFile: CaseFile, warning: string) {
  const demo = buildDemoWitnesses(caseFile)
  const filled = [...witnesses]
  while (filled.length < 3) {
    const next = demo[filled.length]
    filled.push({ ...next, name: `演示证人 ${String.fromCharCode(65 + filled.length)}` })
  }
  return { witnesses: filled, warning }
}

export async function POST(req: Request) {
  let caseFile: CaseFile = {}
  try {
    const body = await req.json()
    caseFile = body.caseFile || { decision: body.query }
    const query = String(body.query || caseFile.decision || "").trim()
    if (!query) return Response.json({ error: "请输入要审理的决定" }, { status: 400 })

    const secret = process.env.ZHIHU_ACCESS_SECRET
    if (!secret) {
      return Response.json(withDemoFill([], caseFile, "当前未配置知乎检索密钥，三位均为明确标注的演示角色，不会冒充知乎真实回答。"))
    }

    const url = new URL(ZHIHU_SEARCH_URL)
    url.searchParams.set("Query", query.slice(0, 100))
    url.searchParams.set("Count", "8")
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secret}`,
        "X-Request-Timestamp": Math.floor(Date.now() / 1000).toString(),
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) {
      return Response.json(withDemoFill([], caseFile, "知乎检索暂时不可用，本次切换为明确标注的机制演示，不会把演示内容当作真实证词。"))
    }

    const data = await response.json()
    const code = data.Code ?? data.code
    if (code !== undefined && code !== 0) {
      return Response.json(withDemoFill([], caseFile, `知乎检索返回状态 ${code}，本次以演示角色完成流程。`))
    }
    const items: ZhihuItem[] = data.Data?.Items ?? data.data?.items ?? []
    const witnesses = formatWitnesses(items)
    if (witnesses.length < 3) {
      return Response.json(withDemoFill(witnesses, caseFile, `仅找到 ${witnesses.length} 条可用真实证词，空缺席位已用明确标注的演示角色补齐。`))
    }
    return Response.json({ witnesses, warning: "" })
  } catch {
    return Response.json(withDemoFill([], caseFile, "检索网络异常，本次以演示角色完成流程；演示内容不代表真实用户经历。"))
  }
}
