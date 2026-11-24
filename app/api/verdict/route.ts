export async function POST(req: Request) {
  try {
    const { decision, messages, witnesses } = await req.json()

    // 把前端的对话历史提取出来，方便大模型理解
    const chatHistory = messages.map((m: any) => `${m.role === 'user' ? '用户' : m.who}: ${m.text}`).join("\n")
    const witnessQuotes = witnesses.map((w: any) => `【${w.name}】(${w.tag}) 曾说：${w.quote}`).join("\n")

    const systemPrompt = `你是一个冷酷但有经验的“决策陪审团”主审官。用户面对一个决定时，你负责根据证人的证词和用户的辩论，出具一张裁决书。
你的输出必须是一个 JSON 格式，不要包含任何 markdown 标记（如 \`\`\`json ），不要有多余的废话。

JSON 结构要求：
{
  "verdict": "有条件通过" 或 "驳回" 或 "批准",
  "deathCause": "一句简短的死因归类（如：获客成本、机会成本、技术风险、需求不真实）",
  "action": "一个具体的、两周内能完成的最小验证动作（如：两周内找 3 个目标用户聊一聊，看他们是否愿意预付定金）"
}`

    const userPrompt = `用户的决定：${decision}
    
证人证词库：
${witnessQuotes}

双方对质记录：
${chatHistory}

请根据以上信息，给出裁决 JSON。`

    const response = await fetch(
      "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.ZHIPU_API_KEY}`,
        },
        body: JSON.stringify({
          model: "glm-4-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.3, // 降低温度，让格式更稳定
        }),
      }
    )

    if (!response.ok) {
      throw new Error("大模型裁决调用失败")
    }

    const data = await response.json()
    let content = data.choices?.[0]?.message?.content || ""
    
    // 清理可能多余的 markdown 标记
    content = content.replace(/```json/g, "").replace(/```/g, "").trim()
    
    const verdictData = JSON.parse(content)
    return Response.json(verdictData)

  } catch (err: any) {
    // 如果大模型解析失败，给一个保底的裁决
    return Response.json({
      verdict: "有条件通过",
      deathCause: "暂无法判定（大模型解析失败）",
      action: "建议先做一次真实用户访谈。"
    })
  }
}