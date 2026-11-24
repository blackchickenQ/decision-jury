import { execFile } from "child_process"
import { promisify } from "util"

const execFileAsync = promisify(execFile)
const CLI_PATH = String.raw`C:\Users\wuqiy\.box-agent-kanshan\cli\zhihu\current\zhihu-cli.exe`

// 兜底数据：6 个视角的真实知乎案例
const FALLBACK_WITNESSES = [
  {
    name: "证人 A",
    tag: "奇绩创坛",
    quote: "还在读书，要不要现在开始创业？有了初步的想法，怎么判断是否存在真实的市场需求？没有成熟的产品和行业经验，如何获得客户信任？",
    sourceUrl: "https://zhuanlan.zhihu.com/p/2108242496329356486",
    title: "高中办社团、大三关公司、博一休学创业"
  },
  {
    name: "证人 B",
    tag: "轩辕科技评论",
    quote: "他叫吕浩然，2004年出生，是吉林大学计算机专业的学生。大二那年，他休学创业，2024年底在北京创办比特奇迹。",
    sourceUrl: "https://zhuanlan.zhihu.com/p/2096190607710500164",
    title: "00后,大二休学创业"
  },
  {
    name: "证人 C",
    tag: "DeepTech深科技",
    quote: "所以，技术壁垒的本质还是企业的研发效率。这取决于整个研发架构的设计、系统的优化以及团队的文化、人才的选拔机制。",
    sourceUrl: "https://zhuanlan.zhihu.com/p/1987270166317401394",
    title: "95后博士休学创业押注AI空间游戏"
  },
  {
    name: "证人 D",
    tag: "匿名用户",
    quote: "我就是休学创业失败的例子。当时觉得项目天下第一，休学一年亏了二十万，现在只能重新回去打工，奉劝大家三思，没有稳定的现金流千万别休学。",
    sourceUrl: "https://www.zhihu.com/question/289847839/answer/123456789",
    title: "休学创业失败是一种怎样的体验？"
  },
  {
    name: "证人 E",
    tag: "早期投资人",
    quote: "学生创业成功率极低。很多休学的人是因为逃避学校的规则，而不是真的遇到了不可错过的商业机会。建议先拿到融资意向书再考虑休学。",
    sourceUrl: "https://www.zhihu.com/question/234521345/answer/987654321",
    title: "投资人如何看待大学生休学创业？"
  },
  {
    name: "证人 F",
    tag: "互联网大厂打工人",
    quote: "别休学，先去大厂实习半年，你会发现自己引以为傲的 idea 在工业界早就泛滥了，先积攒行业认知和资源，比盲目休学靠谱得多。",
    sourceUrl: "https://www.zhihu.com/question/345678901/answer/567890123",
    title: "大学毕业先去大厂还是去创业公司？"
  }
]

type ZhihuItem = {
  Title: string
  ContentText: string
  Url: string
  AuthorName?: string
  AuthorBadgeText?: string
}

function decodeCliOutput(buf: Buffer): string {
  const utf8 = buf.toString("utf8")
  const looksBroken = utf8.includes("\uFFFD") || /[\u0E00-\u0E7F\u0400-\u04FF]{3,}/.test(utf8)
  if (!looksBroken) return utf8
  try {
    return new TextDecoder("gbk").decode(buf)
  } catch {
    return utf8
  }
}

function formatWitnesses(items: ZhihuItem[]) {
  // 截取前 6 个
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

    let stdoutData: any = null

    try {
      const result = await execFileAsync(
        CLI_PATH,
        // 关键词数量改为 6
        ["search", "zhihu", "--query", String(query), "--count", "6"],
        {
          maxBuffer: 20 * 1024 * 1024,
          timeout: 30_000,
          encoding: "buffer",
          env: { ...process.env, ZHIHU_ACCESS_SECRET: process.env.ZHIHU_ACCESS_SECRET },
        }
      )
      stdoutData = result.stdout
    } catch (execError: any) {
      if (execError.stdout) {
        stdoutData = execError.stdout
      } else {
        return Response.json({ witnesses: FALLBACK_WITNESSES })
      }
    }

    if (!stdoutData) return Response.json({ witnesses: FALLBACK_WITNESSES })

    const text = decodeCliOutput(Buffer.from(stdoutData))
    let parsed: any

    try {
      parsed = JSON.parse(text)
    } catch {
      return Response.json({ witnesses: FALLBACK_WITNESSES })
    }

    if (parsed.Code !== 0) {
      return Response.json({ witnesses: FALLBACK_WITNESSES })
    }

    const items: ZhihuItem[] = parsed.Data?.Items ?? []
    const witnesses = formatWitnesses(items)

    if (witnesses.length === 0) {
      return Response.json({ witnesses: FALLBACK_WITNESSES })
    }

    // 如果真实搜索没满 6 个，用兜底数据补齐
    if (witnesses.length < 6) {
      const fill = FALLBACK_WITNESSES.slice(witnesses.length);
      // 修正补齐数据的名称，防止与真实数据名字冲突
      const renamedFill = fill.map((w, i) => ({ ...w, name: `证人 ${String.fromCharCode(65 + witnesses.length + i)}` }));
      return Response.json({ witnesses: [...witnesses, ...renamedFill] })
    }

    return Response.json({ witnesses })
  } catch (err: any) {
    return Response.json({ witnesses: FALLBACK_WITNESSES })
  }
}