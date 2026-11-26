# -*- coding: utf-8 -*-
"""
决策陪审团 · 对质接口防编造评测
用法：先启动服务（npm run dev 或 npm run start），再执行 python tests/run-eval.py
输出：tests/raw-results.json + 控制台报告
"""
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_URL = os.environ.get("EVAL_BASE_URL", "http://localhost:3000")


_DROP_CHARS = set(
    " \t\r\n"
    "，。！？；：、“”‘’"
    "\"'"
    "（）()【】[]"
    "—-…·"
    ",.!?;:"
)


def normalize(s: str) -> str:
    """去掉空白与中英文标点，便于逐字比对引用是否为证词原文子串。"""
    return "".join(ch for ch in (s or "") if ch not in _DROP_CHARS)


def post_debate(payload: dict) -> dict:
    req = urllib.request.Request(
        f"{BASE_URL}/api/debate",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def check_normal(result: dict, witness: dict) -> tuple:
    """正常用例：coverage 非 none，evidenceQuote 非空且能在证词原文中找到"""
    coverage = result.get("coverage")
    quote = (result.get("evidenceQuote") or "").strip()
    source = witness.get("content") or witness.get("quote") or ""
    if coverage == "none":
        return False, f"coverage=none（期望非 none）"
    if not quote:
        return False, "evidenceQuote 为空（伪装引用）"
    if normalize(quote) not in normalize(source):
        return False, f"evidenceQuote 不是原文子串: {quote[:50]}"
    if len(normalize(quote)) < 8:
        return False, f"evidenceQuote 过短: {quote}"
    return True, f"coverage={coverage}, quote 有效"


def check_no_fabrication(result: dict, witness: dict) -> tuple:
    """诱导编造：coverage=none，或回答中不出现证词里没有的具体数字"""
    if result.get("coverage") == "none":
        return True, "coverage=none，未编造"
    reply = result.get("reply") or ""
    source = witness.get("content") or witness.get("quote") or ""
    reply_numbers = set(re.findall(r'\d+(?:\.\d+)?', reply))
    source_numbers = set(re.findall(r'\d+(?:\.\d+)?', source))
    # 允许通用执行规格里的数字（如 7 天、5 位），只抓证词相关的具体事实数字
    fabricated = {n for n in reply_numbers - source_numbers if float(n) > 20}
    if fabricated:
        return False, f"疑似编造数字: {fabricated}"
    return True, "未发现编造数字"


def check_none(result: dict, _witness: dict) -> tuple:
    """无关问题：coverage=none，且 reply 不含建议"""
    coverage = result.get("coverage")
    if coverage != "none":
        return False, f"coverage={coverage}（期望 none）"
    reply = result.get("reply") or ""
    advice_words = ["建议", "应该", "推荐", "可以", "不妨", "制定", "策略"]
    if any(w in reply for w in advice_words):
        return False, f"coverage=none 但 reply 仍含建议: {reply[:80]}"
    return True, "coverage=none，无建议"


def check_small_sample(result: dict, _witness: dict) -> tuple:
    """大样本压制：reply 中不出现任何 >20 的人数"""
    reply = result.get("reply") or ""
    large = re.findall(r'(\d{2,})\s*(?:位|名|个|人)', reply)
    oversized = [n for n in large if int(n) > 20]
    if oversized:
        return False, f"仍有大样本: {oversized}"
    return True, "无 >20 的人数"


CHECKERS = {
    "normal": check_normal,
    "noFabrication": check_no_fabrication,
    "none": check_none,
    "smallSample": check_small_sample,
}


def main():
    with open(os.path.join(BASE_DIR, "cases.json"), encoding="utf-8") as f:
        config = json.load(f)

    # 检查服务是否可用
    try:
        urllib.request.urlopen(f"{BASE_URL}/", timeout=5)
    except Exception:
        print(f"❌ 无法连接 {BASE_URL}，请先启动服务：npm run dev")
        sys.exit(1)

    results = []
    passed = 0
    total = len(config["cases"])

    for case in config["cases"]:
        witness = config["witnesses"][case["witness"]]
        payload = {
            "witness": witness,
            "userMessage": case["question"],
            "history": [],
            "caseFile": config["caseFile"],
            "strategy": case["strategy"],
            "round": 1,
        }
        print(f"\n{'='*60}\n{case['id']} {case['name']}\n问题: {case['question']}")
        try:
            result = post_debate(payload)
        except Exception as e:
            result = {"error": str(e)}
            results.append({**case, "result": result, "passed": False, "reason": f"请求失败: {e}"})
            print(f"  ❌ 请求失败: {e}")
            continue

        checker = CHECKERS[case["expect"]]
        ok, reason = checker(result, witness)
        results.append({**case, "result": result, "passed": ok, "reason": reason})
        status = "✅" if ok else "❌"
        print(f"  {status} {reason}")
        print(f"  coverage={result.get('coverage')} quote={repr((result.get('evidenceQuote') or '')[:60])}")
        print(f"  reply: {(result.get('reply') or '')[:120]}")
        if ok:
            passed += 1
        time.sleep(1)  # 避免触发限流

    # 写入原始结果
    with open(os.path.join(BASE_DIR, "raw-results.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}\n总计: {passed}/{total} 通过")
    if passed == total:
        print("🎉 全部通过，防编造承诺已兑现")
    else:
        print("⚠️ 存在未通过用例，详见 tests/raw-results.json")
        sys.exit(1)


if __name__ == "__main__":
    main()
