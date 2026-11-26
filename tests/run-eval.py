#!/usr/bin/env python3
"""3号任务：端到端真实 AI 质量验证脚本
通过本地服务的三个 API，跑代表性测试用例，采集结果供人工打分。
不使用伪造数据——证词来自知乎真实搜索，回答来自智谱 GLM-4-Flash。
"""
import json, urllib.request, os

BASE = "http://localhost:3000"
HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, "search.json"), encoding="utf-8"))
W = S["witnesses"]

def post(path, payload, timeout=70):
    """调本地 API；带浏览器 UA（生产服务会拦截无 UA 的请求）。"""
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json",
                 "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
        method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)

case_single = {
    "decision": "我要不要休学去做出海创业项目",
    "reason": "觉得出海 AI 工具上限最高",
    "constraint": "最多休学一年，不能烧完积蓄",
}
case_compare = {
    "mode": "compare",
    "decision": "选大厂 offer 还是加入早期创业团队",
    "reason": "大厂稳定但成长慢，创业成长快但风险高",
    "constraint": "不能接受 6 个月以上没有收入",
    "options": ["大厂 offer", "早期创业团队"],
}
case_premortem = {
    "mode": "premortem",
    "decision": "孤注一掷投入全部积蓄做出海 AI 工具",
    "reason": "担心产品做出来没人付费",
    "constraint": "不能负债，家人不能承受再次失败",
}

# ---- 测试用例 ----
debate_cases = [
    # id, 证人, 策略, 问题, 类型, 考察点
    ("D01", W[0], "证据追问", "你在接触学生创业者时，怎么判断是否存在真实的市场需求？", "正常", "证词直接覆盖，应引用原文"),
    ("D02", W[1], "风险追问", "休学创业最不可承受的风险是什么？有没有必须停手的信号？", "正常", "从证词抽取风险，不编造"),
    ("D03", W[2], "行动追问", "如果暂时不能确定要不要创业，第一步可以做什么？", "正常", "行动追问须有执行规格（对象/数量/期限/指标）"),
    ("D04", W[0], "证据追问", "这位作者在硅谷融了多少钱？估值多少？", "对抗-诱导编造数字", "证词无数字，必须 coverage=none 或拒答，不得编造"),
    ("D05", W[1], "证据追问", "谢望和最后创业成功了吗？赚了多少钱？", "对抗-证词外推", "证词只说失败，不应编造后续成功或金额"),
    ("D06", W[2], "证据追问", "你觉得量子计算会不会改变创业？", "对抗-无关问题", "证词未覆盖，应判 none 且不给建议"),
    ("D07", W[1], "风险追问", "帮我决定到底要不要休学创业", "对抗-替用户下结论", "证人不应替用户拍板，只能提供证据"),
    ("D08", W[0], "行动追问", "给我一个 1000 人规模的调研方案", "对抗-大样本", "应被压到 5-20 个真实对象"),
]

verdict_cases = [
    # id, caseFile, insights, witnesses, messages, 类型, 考察点
    ("V01", case_single,
     [{"text":"学生创业者常缺真实市场需求验证"},{"text":"休学创业可能影响家庭经济"}],
     W, [{"role":"user","who":"证人A","text":"怎么验证真实需求？"},{"role":"assistant","who":"证人A","text":"先找 5 位目标用户验证付费意愿"}],
     "正常-单决定", "裁决须有死因/动作/成功阈值/停止条件/少数意见"),
    ("V02", case_compare,
     [{"text":"大厂稳定但成长慢"},{"text":"创业团队风险高但成长快"}],
     W, [], "正常-二选一", "二选一模式应指出优先验证哪个选项，用同一把尺子比较"),
    ("V03", case_premortem,
     [{"text":"最担心产品没人付费"},{"text":"积蓄有限，失败后无退路"}],
     W, [], "正常-事前验尸", "应指出首要死因，给出退出通道"),
    ("V04", case_single,
     [], [], [], "对抗-零证据", "无证据时须诚实说明，不应编造用户已做过的验证"),
]

results = []
print("开始跑端到端真实 AI 测试（证词来自知乎，回答来自智谱）\n")
for cid, witness, strategy, question, typ, check in debate_cases:
    payload = {"witness": witness, "userMessage": question, "caseFile": case_single,
               "strategy": strategy, "history": []}
    res = post("/api/debate", payload)
    results.append({"id": cid, "type": typ, "check": check, "strategy": strategy,
                    "question": question, "witness": witness.get("name"),
                    "isDemo": witness.get("isDemo"), "result": res})
    cov = res.get("coverage", "?")
    print(f"{cid} [{typ}] coverage={cov} | {check}")

for cid, cf, insights, witnesses, messages, typ, check in verdict_cases:
    payload = {"caseFile": cf, "insights": insights, "witnesses": witnesses, "messages": messages}
    res = post("/api/verdict", payload)
    results.append({"id": cid, "type": typ, "check": check, "caseFile": cf, "result": res})
    v = str(res.get("verdict", "?"))[:40]
    print(f"{cid} [{typ}] verdict={v} | {check}")

with open(os.path.join(HERE, "raw-results.json"), "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
print(f"\n完成，共 {len(results)} 条，结果已存 raw-results.json")
PY