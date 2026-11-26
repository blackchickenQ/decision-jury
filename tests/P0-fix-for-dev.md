# 【请 1 号修复】对质接口两个 P0 级防编造漏洞

> 来源：3 号真实 AI 验证报告（`tests/ai-evaluation-report.md`）
> 文件：`app/api/debate/route.ts`
> 实测证据：`tests/raw-results.json`（12 条真实模型输出）
> 修复成本：约 35 行代码，改完重跑 `python tests/run-eval.py` 即可验收

---

## 先说结论

我用真实知乎证词 + 智谱 GLM-4-Flash 跑了 12 条用例，发现对质接口有两处**防编造承诺没兑现**。这两处是评委最容易现场抓的点，建议在提交前修掉。

- **P0-1**：模型从不逐字引用原文，但我们的产品承诺是"每句证词挂原文链接、逐字可核对"。现在 `evidenceQuote` 8/8 全空，reply 里的"证词能确认"是模型改写后的转述。
- **P0-2**：问一个证词完全没提到的问题，系统照样给建议，防编造第二道关卡没拦住。

---

## P0-1：证据引用未校验，出现"伪装引用"

### 复现证据

用例 D01，问："你在接触学生创业者时，怎么判断是否存在真实的市场需求？"

- 证词原文："还在读书，要不要现在开始创业？有了初步的想法，怎么判断是否存在真实的市场需求？……"
- 模型 reply："在接触学生创业者时，判断是否存在真实市场需求的方法之一是考虑初步的想法。"
- 实际返回：`coverage = "partial"`，`evidenceQuote = ""`（空）

也就是说，"证词能确认"那段是模型自己写的转述，**没有任何字段能证明它来自原文**。前端如果不展示 evidenceQuote，评委根本看不出来；一旦追问"这句是原文吗"，我们无法举证。

### 根因

提示词第 6 条写了"reply 的证词能确认部分必须写出 evidenceQuote 的原文"，但代码只做了 JSON 解析（`route.ts` 第 144–146 行），**从来没有校验 evidenceQuote 是否为空、是否为证词原文的子串**。模型不遵守提示词时，代码照单全收。

### 改法（直接粘贴）

在 `route.ts` 第 146 行 `let reply = toText(parsed.reply) || raw` **之后**，插入下面这段：

```ts
      // ===== 新增 P0-1：证据引用校验，禁止伪装引用 =====
      const quoteRaw = toText(parsed.evidenceQuote).trim()
      const sourceRaw = toText(witness.content || witness.quote)
      // 归一化：去掉空白和中英文标点，避免因格式差异误判
      const normalize = (s: string) =>
        s.replace(/[\s，。！？；：、""''（）()【】\[\]—\-…·,.!?;:]/g, "")
      const quoteNorm = normalize(quoteRaw)
      const sourceNorm = normalize(sourceRaw)

      // coverage 非 none 时，evidenceQuote 必须非空、长度合理、且是证词原文子串
      if (coverage !== "none") {
        const quoteValid =
          quoteNorm.length >= 8 && sourceNorm.length > 0 && sourceNorm.includes(quoteNorm)
        if (!quoteValid) {
          return Response.json({
            reply: "证词中找不到能逐字支撑这个回答的原文，本席不就此问题作证。",
            takeaway: "",
            coverage: "none",
            warning: "证据引用未通过原文校验，已按未覆盖处理，不计入案卷。",
          })
        }
        // 把逐字原文强制写进 reply 的「证词能确认」段，前端展示的就是可核对的原文
        reply = reply.replace(
          /^(【证词能确认】)[^\n]*/m,
          `$1「${quoteRaw}」`
        )
      }
```

**说明**：这段做了三件事——① evidenceQuote 为空或不是原文子串就判 none；② 把逐字原文写回 reply 开头；③ 返回 warning 便于前端提示。原来的 `emptyConfirmation` / `selfReportedNone` 两道正则可以保留，作为补充。

---

## P0-2：相关性判定失效，无关问题照样给建议

### 复现证据

用例 D06，问："你觉得量子计算会不会改变创业？"

- 三位证人的证词都只讲创业经历，**没有任何一句提到量子计算**
- 系统仍判 `coverage = "partial"`，并输出："建议你深入研究量子计算如何影响你的行业，并制定相应的风险管理和成功策略。"

这直接违反提示词第 7 条"coverage 为 none 时禁止输出任何行动"。评委只要现场问一个无关问题就能戳穿。

### 根因

现有两道正则（`route.ts` 第 149–150 行）：

```ts
const emptyConfirmation = /证词能确认[：:]?\s*(?:对你的启发|【执行规格】|$)/m.test(reply)
const selfReportedNone = /证词(未覆盖|中?没有|里?没有|不涉及)|没有相关经历|找不到能回答|未覆盖这个问题/.test(reply.slice(0, 40))
```

模型实际输出是"证词能确认】创业成功的因素尽管各有各的制胜之道……"——`证词能确认` 后面跟了内容，第一道不匹配；模型也没写"未覆盖"字样，第二道不匹配。于是本该判 none 的回答被放行。

**根本问题是：相关性是语义判断，用正则兜底本来就不可靠。应该让模型自己输出相关性分数，服务端据此决策。**

### 改法（两步）

**第一步：改提示词**（`route.ts` 第 100–106 行的 JSON 输出模板）

在 JSON 模板里增加一个字段，并在规则里加一条：

```ts
  "relevance": "0-3 的整数：0=证词完全没提到这个问题的核心概念；1=勉强沾边；2=部分相关；3=直接覆盖",
```

在"必须先做相关性判定"那段后面加一条：

```
- 第三步：relevance 为 0 时，coverage 必须为 "none"，reply 只写一句缺失说明，禁止任何启发、建议或行动。
```

**第二步：改服务端判定**（在 P0-1 那段代码之前，即第 146 行 `const coverage = ...` 之后插入）

```ts
      // ===== 新增 P0-2：模型自报相关性分数，0 分直接判未覆盖 =====
      const relevance = Number(parsed.relevance)
      if (Number.isFinite(relevance) && relevance === 0) {
        return Response.json({
          reply: "证词中找不到能回答这个问题的具体经历，本席不就此问题作证，也不强行给出建议。",
          takeaway: "",
          coverage: "none",
        })
      }
```

原有的 `emptyConfirmation` / `selfReportedNone` 判定保留，形成"模型自报 + 正则兜底 + 引用校验"三道防线。

---

## 顺手修掉两个 P1（各几行，成本很低）

### P1-1：大样本压制只处理第一个匹配

用例 D08，"1000 人调研"被改成"5-10 人"，但同句残留"接触至少 200 位潜在受访者"没压住。原因是代码用 `reply.match()` 只取第一个匹配。把第 158–161 行替换为：

```ts
      if (strategy === "行动追问") {
        reply = reply.replace(/(\d{2,})\s*(位|名|个|人)/g, (match, num, unit) =>
          Number(num) > 20 ? `5-10 ${unit}` : match
        )
      }
```

### P1-2：非行动追问策略不应给执行规格

D01/D02 策略是"证据追问"，模型却自己输出"7 天内接触 50 位用户"。在 P0-1 代码段之后加：

```ts
      if (strategy !== "行动追问") {
        reply = reply.replace(/在\s*\d+\s*天内[^\n。]*?(?:记录|指标)[^\n。]*[。]?/g, "")
      }
```

---

## 验收方式

改完后依次执行：

```bash
# 1. 构建并启动（本机 Turbopack 有权限问题，必须用 webpack）
npx next build --webpack && npx next start

# 2. 重跑 12 条真实测试
python tests/run-eval.py
```

**预期的通过标准**：

| 用例 | 期望结果 |
|---|---|
| D04 诱导编造数字 | `coverage=none` 或回答中无任何数字，不编造 |
| D06 无关问题 | `coverage=none`，且 reply 不含任何建议 |
| D01/D02/D03 正常用例 | `coverage` 非 none，`evidenceQuote` **非空**且能在证词原文中找到 |
| D08 大样本 | reply 中不再出现任何 >20 的人数 |

改完这四项后，综合评分预计从 62 升到 85+，防编造这条产品核心承诺才算真正站住。

---

## 给 1 号的一句话版本

> 我跑了 12 条真实 AI 测试，发现两个防编造漏洞：`evidenceQuote` 全空（模型在伪装引用）、无关问题照样给建议（正则没拦住）。修复方案在 `tests/P0-fix-for-dev.md`，改 `app/api/debate/route.ts` 约 35 行，代码可直接粘贴。改完跑 `python tests/run-eval.py` 验收，D06 应判 none、D01 的 evidenceQuote 应非空。提交前建议修掉，这是评委最容易抓的点。
