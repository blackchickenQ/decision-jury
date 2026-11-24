"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

type Witness = {
  name: string
  tag: string
  quote: string
  sourceUrl: string
  title?: string
}

type Message = { role: "user" | "witness" | "guide"; text: string; who?: string }

export default function JuryPage() {
  const router = useRouter()
  const [decision, setDecision] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [witnesses, setWitnesses] = useState<Witness[]>([])
  const [activeWitness, setActiveWitness] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isTyping, setIsTyping] = useState(false)

  useEffect(() => {
    const d = localStorage.getItem("jury_decision") || ""
    const reason = localStorage.getItem("jury_reason") || ""
    setDecision(d)
    setMessages([{ role: "guide", text: "正在从知乎传唤证人……" }])

    const query = d || reason || "休学创业"
    fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setError(data.error || "搜索失败")
          setMessages([{ role: "guide", text: "证人传唤失败。" }])
          return
        }
        setWitnesses(data.witnesses)
        localStorage.setItem("jury_witnesses", JSON.stringify(data.witnesses))
        setMessages([{ role: "guide", text: `法庭已开庭，共传唤 ${data.witnesses.length} 位证人。请点击上方卡片选择你要质问的证人。` }])
      })
      .catch(() => {
        setError("网络错误，请重试")
        setMessages([{ role: "guide", text: "证人传唤失败。" }])
      })
      .finally(() => setLoading(false))
  }, [])

  // 点击切换证人时的主持词
  const handleSelectWitness = (index: number) => {
    if (index === activeWitness || isTyping) return
    setActiveWitness(index)
    setMessages((prev) => [
      ...prev,
      { role: "guide", text: `传唤 ${witnesses[index].name} 到证人席。` }
    ])
  }

  // 核心逻辑：向指定证人提问，并在答不上来时自动流转
  const askWitness = async (wIndex: number, text: string, visited: number[] = []) => {
    const currentWitness = witnesses[wIndex]
    setIsTyping(true)

    try {
      const res = await fetch("/api/debate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          witness: currentWitness,
          userMessage: text,
          history: [], // 传空历史，专注于回答当前这个问题
        }),
      })

      let data;
      try {
        data = await res.json()
      } catch {
        throw new Error("接口崩溃，未返回 JSON")
      }

      if (!res.ok) throw new Error(data.detail || data.error)

      setIsTyping(false)
      
      // 证人作答
      setMessages((prev) => [
        ...prev,
        { role: "witness", text: data.reply, who: currentWitness.name },
      ])

      // 判断是否答不上来
            const noAnswerKeywords = ["没有答案", "没有覆盖", "没提到", "未提及", "不知道", "不清楚", "没有具体", "不了解"];
      const isNoAnswer = noAnswerKeywords.some((kw) => data.reply.includes(kw));

      if (isNoAnswer) {
        const newVisited = [...visited, wIndex]
        
        // 找下一个没被问过的证人
        let nextIndex = (wIndex + 1) % witnesses.length
        while (newVisited.includes(nextIndex) && newVisited.length < witnesses.length) {
          nextIndex = (nextIndex + 1) % witnesses.length
        }

        // 如果 6 个证人都被问了一圈，就停止
        if (newVisited.length >= witnesses.length) {
          setTimeout(() => {
            setMessages((prev) => [...prev, { role: "guide", text: "现有证人均无法回答此问题，建议换个角度提问。" }])
          }, 800)
          return
        }

        const nextWitness = witnesses[nextIndex]

        // 延迟刘看山主持换人
        setTimeout(() => {
          setMessages((prev) => [
            ...prev,
            { role: "guide", text: `${currentWitness.name} 无法回答此问题。已自动传唤 ${nextWitness.name}。` }
          ])
          
          // 高亮新证人
          setActiveWitness(nextIndex)
          
          // 新证人自动作答
          setTimeout(() => {
            setMessages((prev) => [
              ...prev,
              { role: "guide", text: `请 ${nextWitness.name} 就此问题作答。` }
            ])
            askWitness(nextIndex, text, newVisited)
          }, 800)

        }, 500)
      }

    } catch (err: any) {
      setIsTyping(false)
      setMessages((prev) => [
        ...prev,
        { role: "witness", text: `【对质失败】${err.message}`, who: currentWitness.name },
      ])
    }
  }

  const handleSend = () => {
    if (!input.trim() || witnesses.length === 0 || isTyping) return
    const userMsg = input
    setInput("")
    // 添加用户消息
    setMessages((prev) => [...prev, { role: "user", text: userMsg }])
    // 开始连环质问
    askWitness(activeWitness, userMsg)
  }

  const handleVerdict = async () => {
    setMessages((prev) => [...prev, { role: "guide", text: "双方对质结束，本庭即将出具裁决书。" }])
    setIsGenerating(true)
    
    setTimeout(async () => {
      try {
        const res = await fetch("/api/verdict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, messages, witnesses })
        })
        const data = await res.json()
        localStorage.setItem("jury_verdict", JSON.stringify(data))
        router.push("/verdict")
      } catch {
        alert("生成裁决失败，请重试")
        setIsGenerating(false)
      }
    }, 1000)
  }

  return (
    <main className="min-h-screen bg-[#F4F6FB] p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold flex-none">刘</div>
          <div>
            <div className="text-xs text-gray-500">刘看山 · 法庭引导员</div>
            <div className="text-sm font-medium text-gray-800">法庭已开庭，请选择证人发问</div>
          </div>
        </div>

        {decision && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
            <div className="text-xs text-blue-600 mb-1">你的决定</div>
            <div className="text-sm text-gray-800">{decision}</div>
          </div>
        )}

        {loading && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500 mb-4">
            <div className="inline-block w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2 align-middle"></div>
            正在从知乎传唤证人……
          </div>
        )}

        {!loading && witnesses.length > 0 && (
          <div className="grid md:grid-cols-3 gap-3 mb-4">
            {witnesses.map((w, i) => (
              <div 
                key={i} 
                onClick={() => handleSelectWitness(i)}
                className={`cursor-pointer bg-white rounded-xl border p-4 transition-all ${
                  i === activeWitness ? "border-blue-500 ring-2 ring-blue-100 shadow-md" : "border-gray-200 opacity-70 hover:opacity-100"
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <div className="text-sm font-bold text-gray-800">{w.name}</div>
                  {i === activeWitness && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">正在被质问</span>}
                </div>
                <div className="text-xs text-gray-500 mb-2">{w.tag}</div>
                <p className="text-xs text-gray-600 leading-relaxed mb-2 line-clamp-4 hover:line-clamp-none transition-all" title="悬浮查看完整证词">
                  {w.quote}
                </p>
                <a href={w.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                  查看知乎原文 ↗
                </a>
              </div>
            ))}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4 h-[350px] overflow-y-auto flex flex-col">
          {messages.map((m, i) => (
            <div key={i} className={`mb-3 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "guide" && (
                <div className="inline-block bg-blue-50 text-blue-700 text-sm px-3 py-1.5 rounded-lg max-w-[85%] border border-blue-100">
                  🦊 <span className="font-semibold">刘看山：</span>{m.text}
                </div>
              )}
              {m.role === "user" && (
                <div className="inline-block bg-blue-600 text-white text-sm px-4 py-2 rounded-xl rounded-tr-sm max-w-[85%]">{m.text}</div>
              )}
              {m.role === "witness" && (
                <div className="inline-block bg-gray-100 text-gray-800 text-sm px-4 py-2 rounded-xl rounded-tl-sm max-w-[85%]">
                  <span className="text-xs text-gray-500 block mb-0.5">{m.who}</span>
                  {m.text}
                </div>
              )}
            </div>
          ))}
          
          {isTyping && (
            <div className="flex justify-start mb-2">
              <div className="inline-block bg-gray-100 text-gray-800 text-sm px-4 py-2 rounded-xl rounded-tl-sm">
                <span className="text-xs text-gray-500 block mb-0.5">{witnesses[activeWitness]?.name}</span>
                <div className="flex space-x-1 items-center h-4">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0.4s" }}></div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 mb-4">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={`向 ${witnesses[activeWitness]?.name || "证人"} 发问...`}
            disabled={!witnesses.length || isGenerating || isTyping}
            className="flex-1 border border-gray-300 rounded-xl px-4 py-3 text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
          />
          <button 
            onClick={handleSend} 
            disabled={!witnesses.length || isGenerating || isTyping} 
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 rounded-xl font-medium disabled:bg-gray-300 transition-colors"
          >
            发送
          </button>
        </div>

        <button 
          onClick={handleVerdict} 
          disabled={isGenerating || isTyping}
          className="w-full bg-gray-900 hover:bg-black text-white font-semibold py-4 rounded-xl disabled:bg-gray-500 transition-colors"
        >
          {isGenerating ? "主审官正在合议..." : "结束质询，出具裁决 →"}
        </button>
      </div>
    </main>
  )
}