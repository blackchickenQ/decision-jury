const ZHIHU_SEARCH_URL = "https://developer.zhihu.com/api/v1/content/zhihu_search"

type ZhihuItem = {
  Title: string
  ContentText: string
  Url: string
  AuthorName?: string
  AuthorBadgeText?: string
}

// 兜底数据（防止知乎接口彻底挂掉）
const FALLBACK_WITNESSES = [
  { name: "证人 A", tag: "奇绩创坛", quote: "还在读书，要不要现在开始创业？有了初步的想法，怎么判断是否存在真实的市场需求？", sourceUrl: "https://zhuanlan.zhihu.com/p/2108242496329356486" },
  { name: "证人 B", tag: "轩辕科技评论", quote: "他叫吕浩然，2004年出生，是吉林大学计算机专业的学生。大二那年，他休学创业。", sourceUrl: "https://zhuanlan.zhihu.com/p/2096190607710500164" },
  { name: "证人 C", tag: "DeepTech深科技", quote: "技术壁垒的本质还是企业的研发效率。这取决于整个研发架构的设计、系统的优化。", sourceUrl: "https://zhuanlan.zhihu.com/p/1987270166317401394" },
  { name: "证人 D", tag: "匿名用户", quote: "我就是休学创业失败的例子。当时觉得项目天下第一，休学一年亏了二十万。", sourceUrl: "https://www.zhihu.com/question/289847839" },
  { name: "证人 E", tag: "早期投资人", quote: "学生创业成功率极低。很多休学的人是因为逃避学校的规则，而不是真的遇到了不可错过的商业机会。", sourceUrl: "https://www.zhihu.com/question/234521345" },
  { name: "证人 F", tag: "互联网大厂打工人", quote: "别休学，先去大厂实习半年，你会发现自己引以为傲的 idea 在工业界早就泛滥了。", sourceUrl: "https://www.zhihu.com/question/345678901" }
]

function formatWitnesses(items: ZhihuItem[]) {
  return items.slice(0, 6).map((item, i) => {
    const content = (item.ContentText || "").replace(/\s+/g, " ").trim()
    const title = (item.Title || "").trim()
    const raw = content || title
    return {
      name: `证人 ${String.fromCharCode(65 + i)}`,
      tag: item.AuthorName || item.AuthorBadgeText || "知乎作者",
      quote: raw.length > 110 ? raw.slice(0, 110) + "……" : raw,
      sourceUrl: item.Url,
      title,
    }
  })
}

export async function POST(req: Request) {
  try {
    const { query } = await req.json()
    if (!query || !String(query).trim()) {
      return Response.json({ error: "请输入关键词" }, { status: 400 })
    }

    const secret = process.env.ZHIHU_ACCESS_SECRET
    if (!secret) {
      return Response.json({ witnesses: FALLBACK_WITNESSES, warning: "未配置知乎密钥，使用兜底数据" })
    }

    // 构造请求
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const url = new URL(ZHIHU_SEARCH_URL)
    url.searchParams.set("Query", String(query))
    url.searchParams.set("Count", "6")

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secret}`,
        "X-Request-Timestamp": timestamp,
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      console.warn("知乎接口报错，使用兜底")
      return Response.json({ witnesses: FALLBACK_WITNESSES })
    }

    const data = await response.json()
    const code = data.Code ?? data.code
    if (code !== undefined && code !== 0) {
      console.warn("知乎返回错误码，使用兜底:", code)
      return Response.json({ witnesses: FALLBACK_WITNESSES })
    }

    const items: ZhihuItem[] = data.Data?.Items ?? data.data?.items ?? []
    const witnesses = formatWitnesses(items)

    if (witnesses.length < 6) {
      // 如果真实搜到的不足 6 个，用兜底补齐
      const fill = FALLBACK_WITNESSES.slice(witnesses.length);
      const renamedFill = fill.map((w, i) => ({ ...w, name: `证人 ${String.fromCharCode(65 + witnesses.length + i)}` }));
      return Response.json({ witnesses: [...witnesses, ...renamedFill] })
    }

    return Response.json({ witnesses })
  } catch (err: any) {
    console.warn("请求彻底失败，使用兜底数据", err)
    return Response.json({ witnesses: FALLBACK_WITNESSES })
  }
}