"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function Home() {
  const router = useRouter()
  const [decision, setDecision] = useState("")
  const [reason, setReason] = useState("")

  const handleSubmit = () => {
    if (!decision.trim()) {
      alert("请先写下你要做的决定")
      return
    }
    localStorage.setItem("jury_decision", decision)
    localStorage.setItem("jury_reason", reason)
    router.push("/jury")
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#0A1E42] via-[#123A7A] to-[#0066FF] flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">决策陪审团</h1>
          <p className="text-blue-200 text-lg">把走过同样路的人，请上证人席</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            你要做什么决定？
          </label>
          <textarea
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
            placeholder="例如：我想休学去做出海 AI 工具"
            className="w-full border border-gray-300 rounded-xl p-4 h-28 mb-6 text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />

          <label className="block text-sm font-semibold text-gray-700 mb-2">
            你为什么觉得能成？（这是靶子）
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例如：海外用户愿意付费，我技术还行"
            className="w-full border border-gray-300 rounded-xl p-4 h-28 mb-6 text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />

          <button
            onClick={handleSubmit}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-xl transition-colors"
          >
            传唤证人 →
          </button>
        </div>

        <p className="text-center text-blue-200 text-sm mt-6">
          每条证词可溯源到知乎原文 · 不预测未来，只呈现真实经历
        </p>
      </div>
    </main>
  )
}