const ZHIHU_SEARCH_URL = "https://developer.zhihu.com/api/v1/content/zhihu_search"

type ZhihuItem = {
  Title: string
  ContentText: string
  Url: string
  AuthorName?: string
  AuthorBadgeText?: string
}

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
      return Response.json(
        { error: "知乎密钥未配置", detail: "请在环境变量中设置 ZHIHU_ACCESS_SECRET" },
        { status: 500 }
      )
    }

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
      const errText = await response.text()
      return Response.json(
        { error: "知乎搜索接口返回错误", detail: errText.slice(0, 300) },
        { status: 502 }
      )
    }

    const data = await response.json()

    // 知乎 API 外层可能有 Code 字段，也可能直接返回 Data
    const code = data.Code ?? data.code
    if (code !== undefined && code !== 0) {
      return Response.json(
        { error: data.Message || data.message || "知乎搜索失败", detail: JSON.stringify(data).slice(0, 300) },
        { status: 502 }
      )
    }

    const items: ZhihuItem[] = data.Data?.Items ?? data.data?.items ?? []
    const witnesses = formatWitnesses(items)

    if (witnesses.length === 0) {
      return Response.json(
        { error: "知乎没有找到相关经历，换一个关键词试试" },
        { status: 404 }
      )
    }

    return Response.json({ witnesses })
  } catch (err: any) {
    return Response.json(
      { error: "搜索接口内部错误", detail: err.message },
      { status: 500 }
    )
  }
}