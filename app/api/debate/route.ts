export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { witness, userMessage, history } = body

    // 防御：如果前端没传证人过来，直接拦下
    if (!witness || !witness.quote || !userMessage) {
      return Response.json(
        { error: "参数缺失", detail: "前端没有正确传入 witness 或 userMessage" },
        { status: 400 }
      )
    }

    // 强化约束：如果没答案，必须回复特定字眼，方便前端识别并换人
        const systemPrompt = `你是一位正在法庭作证的证人。
你唯一的依据是下面这条证词。你只能用证词里的信息回应用户的质疑，绝不能编造证词之外的事实。
【最高指令】：如果用户的问题（哪怕是很具体的细节，比如具体数字、具体时间）没有被证词完全覆盖，你绝对不能自己推测或解释，必须一字不差地只回复：“这一点我的经历里没有答案。”不需要说明任何理由！

证词原文：
${witness.quote}

证词来源：${witness.title || "知乎回答"}`

    const messages = [
      { role: "system", content: systemPrompt },
      ...(history || []).map((m: any) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text,
      })),
      { role: "user", content: userMessage },
    ]

    // 调用大模型
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
          messages,
          temperature: 0.7,
          max_tokens: 200,
        }),
      }
    )

    if (!response.ok) {
      const err = await response.text()
      return Response.json(
        { error: "大模型调用失败", detail: err.slice(0, 300) },
        { status: 502 }
      )
    }

    const data = await response.json()
    const reply = data.choices?.[0]?.message?.content || "这一点我的经历里没有答案。"

    return Response.json({ reply })
  } catch (err: any) {
    return Response.json(
      { error: "对质接口内部错误", detail: err.message || String(err) },
      { status: 500 }
    )
  }
}