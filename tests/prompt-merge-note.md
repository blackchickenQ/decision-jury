# Prompt 合并说明 · 必读（给 1 号）

> 背景：`docs/产品设计.md`（2 号，接口对齐版）与 `tests/P0-fix-for-dev.md`（3 号，实测修复）都要改 `/api/debate`。
> 两份单独看都对，但**直接照抄会互相抵消**。本文件说明如何合并成一次改动。

---

## ⚠️ 一个必须先说清的漏洞

`docs/产品设计.md` 第 3.3 节给了一份新的证人 System Prompt，**输出格式里没有 `evidenceQuote` 字段**：

```
reply / takeaway / coverage / inBoundary        ← 2 号的 3.3 输出格式
```

但现有 `app/api/debate/route.ts` 第 103 行的 prompt 是**有**这个字段的：

```
coverage / evidenceQuote / reply / takeaway
```

**后果**：如果 1 号用 2 号的 3.3 prompt 整体替换现有 prompt，`evidenceQuote` 会从返回结构里消失。那么：

- 3 号在 `tests/ai-evaluation-report.md` 里发现的 **P0-1（逐字引用 8/8 全空）就失去了修复对象**——不是被修好，而是字段直接没了；
- 评委现场点"这句是不是原文"时，产品的"可溯源"承诺无处兑现。

**责任说明**：这个漏洞源自 3 号之前写的 `tests/接口对齐说明.md` 只列了 API 契约字段，漏标了 `evidenceQuote` 这个 prompt 内部字段，2 号照着写自然没带上。不是 2 号的问题，是两份文档之间缺了一层衔接。**所以以本文件为准。**

---

## ✅ 合并方案（一次改完，不返工）

### 第 1 步：用 2 号的 prompt，但输出格式补两个字段

保留 2 号 3.3 节的全部铁律（视角 humanize、boundary 机制、防串供、否认真人——这些都比旧 prompt 好），**只把输出格式替换为**：

```json
{
  "relevance": "0=完全无关 / 1=沾边 / 2=部分相关 / 3=直接命中",
  "evidenceQuote": "逐字引用证词中支撑本回答的原句；coverage=none 时留空字符串",
  "coverage": "direct / partial / none",
  "inBoundary": "用户质疑环境变化时，原经验是否仍适用；否则 false",
  "reply": "正文，可含【证词能确认】【对你的启发】两段；none 时只写缺失说明，不给建议",
  "takeaway": "刘看山可记入案卷的一句话；none 时留空字符串"
}
```

新增的两个字段作用：

| 字段 | 来自 | 解决什么 |
|---|---|---|
| `evidenceQuote` | 现有 prompt + 3 号 P0-1 | 逐字引用，可点回原文 |
| `relevance` | 3 号 P0-2 | 无关问题（如"量子计算会不会改变创业"）判 0，服务端直接短路 |

### 第 2 步：代码侧保留 3 号的两道校验（不要删）

在 `app/api/debate/route.ts` 解析 JSON 之后、返回之前，加两道服务端校验：

```ts
// P0-2：完全无关的问题直接判 none（相关性是语义判断，正则兜底不住）
if (parsed.relevance === 0) {
  return Response.json({
    reply: "证词中找不到能回答这个问题的具体经历，本席不就此问题作证，也不强行给出建议。",
    takeaway: "",
    coverage: "none",
    evidenceQuote: "",
    inBoundary: false,
  });
}

// P0-1：evidenceQuote 必须是证词原文子串，否则逐字引用承诺不成立
const quote = toText(parsed.evidenceQuote);
const norm = (s: string) => s.replace(/[\s，。！？；：、"'“”‘’（）()]/g, "");
if (parsed.coverage !== "none" && (!quote || !norm(witness.content || "").includes(norm(quote)))) {
  return Response.json({
    reply: "证词中找不到能逐字支持这个回答的原文，本席不就此问题作证。",
    takeaway: "",
    coverage: "none",
    evidenceQuote: "",
    inBoundary: false,
  });
}
```

> 注意：2 号 prompt 里的 `testimony` / `perspective` 是**新增输入字段**（由 search 返回），debate 接口目前只把 witness 对象透传给模型，不需要改校验逻辑。前端按 2 号说的"先读新字段、读不到用旧字段兜底"即可。

### 第 3 步：2 号的 6 个增量字段照加，与 P0 修复不冲突

`docs/产品设计.md` 第 5 节列的 6 个字段（`perspective`、`testimony`、`inBoundary`、`verdictType`、`basis`、`disclaimer`）**全部可以加**，和上面的校验互不干扰。加完记得让前端做兼容读取。

---

## 验收标准（合并后跑一遍）

```bash
python tests/run-eval.py
```

预期：

- **D06**（无关问题）→ `coverage=none`，且 reply 不给建议 ← 验证 relevance 短路
- **D01**（命中原文）→ `evidenceQuote` 非空，且是证词原文子串 ← 验证 P0-1
- **D08**（大样本）→ action 中无 >20 的人数 ← 验证既有压制逻辑
- 综合评分从 62 升到 85+

---

## 一句话给 1 号

> 2 号的产品设计可以用，但第 3.3 节 prompt 缺了 `evidenceQuote`，直接替换会让逐字引用字段消失、P0-1 白修。按 `tests/prompt-merge-note.md` 把 `evidenceQuote` 和 `relevance` 两个字段加回输出格式，代码侧保留 P0 两道校验，然后跑 `python tests/run-eval.py` 验收。2 号的 6 个增量字段照常加，互不冲突。
