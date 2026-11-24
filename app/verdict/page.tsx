"use client"

import { useState, useEffect } from "react"
import Link from "next/link"

type Witness = { name: string; tag: string; quote: string; sourceUrl: string }
type VerdictData = { verdict: string; deathCause: string; action: string }

export default function VerdictPage() {
  const [decision, setDecision] = useState("")
  const [witnesses, setWitnesses] = useState<Witness[]>([])
  const [verdict, setVerdict] = useState<VerdictData | null>(null)

  useEffect(() => {
    setDecision(localStorage.getItem("jury_decision") || "")
    try {
      const rawW = localStorage.getItem("jury_witnesses")
      if (rawW) setWitnesses(JSON.parse(rawW))
      
      const rawV = localStorage.getItem("jury_verdict")
      if (rawV) setVerdict(JSON.parse(rawV))
    } catch {}
  }, [])

  return (
    <main className="min-h-screen bg-[#F4F6FB] p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-6">
          <div className="inline-block bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded-full mb-3">裁决书 · Decision Verdict</div>
          <h1 className="text-3xl font-extrabold text-gray-900">{verdict?.verdict || "审理中..."}</h1>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-4">
          <div className="text-xs text-gray-500 mb-1">你的决定</div>
          <div className="text-gray-800 mb-6 font-medium">{decision || "（未填写）"}</div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="text-xs text-red-600 font-semibold mb-1">最可能死因</div>
              <div className="text-lg font-bold text-gray-900">{verdict?.deathCause || "分析中..."}</div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="text-xs text-green-700 font-semibold mb-1">最小验证动作</div>
              <div className="text-sm text-gray-800">{verdict?.action || "分析中..."}</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-4">
          <h2 className="text-sm font-bold text-gray-800 mb-3">证词溯源（来自知乎原文）</h2>
          {witnesses.length === 0 ? (
            <div className="text-sm text-gray-400">未找到证人记录</div>
          ) : (
            <div className="space-y-4">
              {witnesses.map((w, i) => (
                <div key={i} className="border-l-4 border-blue-500 pl-3">
                  <div className="text-xs font-semibold text-gray-700">{w.name} · {w.tag}</div>
                  <div className="text-sm text-gray-600 mb-1 leading-relaxed">{w.quote}</div>
                  <a href={w.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">查看知乎原文 ↗</a>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <Link href="/jury" className="flex-1 text-center bg-white border border-gray-300 text-gray-700 py-3 rounded-xl font-medium hover:bg-gray-50">← 回到对质</Link>
          <Link href="/" className="flex-1 text-center bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700">新的决定</Link>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">本裁决基于知乎公开回答重构的角色对质，不构成个人决策建议。</p>
      </div>
    </main>
  )
}