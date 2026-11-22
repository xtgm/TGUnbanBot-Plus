# tc033 Worker 错误日志分析与修复报告

- 统计窗口：2026-11-19 00:00Z ~ 2026-11-22 23:00Z（3 天）
- 数据来源：Cloudflare Workers Observability Telemetry Query API
  （`POST /accounts/{id}/workers/observability/telemetry/query`，`queryId:""`）
- 筛选条件：`$workers.scriptName = tc033` 且 `$metadata.level = error`
- 实际抓取：**61 组 / 521 条**（Dashboard 显示 466 条，差异来自滚动 72h 窗口边界）
- 生成时间：2026-11-22 15:20 (CST) / 07:20Z；最后更新 07:40Z（第五批部署后复验）

## 一、按类别汇总

| 编号 | 类别 | 条数 | 组数 |
|---|---|---:|---:|
| A | 内容待核核验未完成 | 206 | 4 |
| B | 第⑥层 LLM 深度判定调用失败 | 131 | 4 |
| C | 主模型降级到备用模型 | 86 | 4 |
| D | 广告链接解析超时 | 51 | 13 |
| E | 头像 OCR / 补学 | 10 | 10 |
| F | 文本向量生成失败 | 8 | 8 |
| G | D1 过载 / 内部错误 | 8 | 8 |
| H | 入群名单拦截 / 检测 | 5 | 3 |
| I | 获取群组信息失败 | 2 | 1 |
| J | 外部请求超时 | 4 | 2 |
| K | 删除群内命令消息失败 | 3 | 2 |
| Z | 其他 | 7 | 2 |
| | **合计** | **521** | **61** |

## 二、完整错误清单（61 组，按条数降序）

| # | 条数 | 类别 | 日志首行 |
|---:|---:|---|---|
| 1 | 198 | A | `[内容待核] 核验未完成: Error: 广告处置尚未完成：部分目标未成功; stack=Error: 广告处置尚未完成：部分目标未成功` |
| 2 | 104 | B | `[广告检测·深度判定] 调用失败:     at runAdLLMModel (_worker.js:28274:23)` |
| 3 | 39 | C | `[广告检测] 主模型调用失败，改走备用 @cf/zai-org/glm-5.3-flash → @cf/deepseek-ai/deepseek-v4.1-flash-1017:     at Ai._parseError (cloudflare-internal:ai-api:220:24)` |
| 4 | 35 | C | `[广告检测] 主模型调用失败，改走备用 @cf/zai-org/glm-5.3-flash → @cf/deepseek-ai/deepseek-v4.1-flash-1017:     at Ai._parseError (cloudflare-internal:ai-api:220:24)` |
| 5 | 14 | B | `[广告检测·深度判定] 调用失败:     at runAdLLMModel (_worker.js:28274:23)` |
| 6 | 12 | B | `[广告检测·深度判定] 调用失败:     at runAdLLMModel (_worker.js:28274:23)` |
| 7 | 9 | D | `[广告检测·链接] 解析失败 handle=zxxhm1: The operation was aborted due to timeout` |
| 8 | 9 | D | `[广告检测·链接] 解析失败 handle=tangxin_girl: The operation was aborted due to timeout` |
| 9 | 9 | D | `[广告检测·链接] 解析失败 handle=addlist: The operation was aborted due to timeout` |
| 10 | 9 | C | `[广告检测] 主模型调用失败，改走备用 @cf/zai-org/glm-5.3-flash → @cf/deepseek-ai/deepseek-v4.1-flash-1017:     at Ai._parseError (cloudflare-internal:ai-api:220:24)` |
| 11 | 8 | D | `[广告检测·链接] 解析失败 handle=ywpzr: The operation was aborted due to timeout` |
| 12 | 6 | A | `[内容待核] 核验未完成: Error: 广告处置尚未完成：部分目标未成功; stack=Error: 广告处置尚未完成：部分目标未成功` |
| 13 | 5 | Z | `tc033` |
| 14 | 5 | D | `[广告检测·链接] 解析失败 handle=bydbfankui: The operation was aborted due to timeout` |
| 15 | 3 | D | `[广告检测·链接] 解析失败 handle=xiaogbaby_bot: The operation was aborted due to timeout` |
| 16 | 3 | C | `[广告检测] 主模型调用失败，改走备用 @cf/zai-org/glm-5.3-flash → @cf/deepseek-ai/deepseek-v4.1-flash-1017:     at Ai._parseError (cloudflare-internal:ai-api:220:24)` |
| 17 | 2 | I | `获取群组信息失败:` |
| 18 | 2 | H | `入群后的名单拦截或核验失败，等待 Webhook 重投` |
| 19 | 2 | J | `[自动清积压] 执行失败: TimeoutError: The operation was aborted due to timeout` |
| 20 | 2 | D | `[广告检测·链接] 解析失败 handle=zhishu668_bot: The operation was aborted due to timeout` |
| 21 | 2 | J | `[广告检测] 抓取用户资料失败: TimeoutError: The operation was aborted due to timeout` |
| 22 | 2 | H | `[广告检测] 入群检测未完成: Error: 入群后的名单拦截或核验失败，等待 Webhook 重投; stack=Error: 入群后的名单拦截或核验失败，等待 Webhook 重投` |
| 23 | 2 | K | `[/delgroup] 删除群内命令消息失败:Bad Request: message can't be deleted` |
| 24 | 2 | Z | `POST https://tc0333.onfire.kdns.fr/` |
| 25 | 1 | G | `群模式暂不可用，本次治理未执行，请稍后重试` |
| 26 | 1 | G | `[群模式] 读取失败，本次治理已停止: Error: D1_ERROR: Your account is generating too much load on D1 DBs. Please back off and try again later.; cause=Your account is generating too much load on D1 ` |
| 27 | 1 | G | `[演练收尾] 作业 #1 执行中断: Error: D1_ERROR: Your account is generating too much load on D1 DBs. Please back off and try again later.; cause=Your account is generating too much load on D1 D` |
| 28 | 1 | D | `[广告检测·链接] 解析失败 handle=yuwenpaoer824: The operation was aborted due to timeout` |
| 29 | 1 | D | `[广告检测·链接] 解析失败 handle=xuebaobaoobot: The operation was aborted due to timeout` |
| 30 | 1 | D | `[广告检测·链接] 解析失败 handle=xiaoyibabyi_bot: The operation was aborted due to timeout` |
| 31 | 1 | D | `[广告检测·链接] 解析失败 handle=tingting0629_bot: The operation was aborted due to timeout` |
| 32 | 1 | D | `[广告检测·链接] 解析失败 handle=lancelot07bot: The operation was aborted due to timeout` |
| 33 | 1 | D | `[广告检测·链接] 解析失败 handle=dingdang0825_bot: The operation was aborted due to timeout` |
| 34 | 1 | B | `[广告检测·深度判定] 调用失败:     at runAdLLMModel (_worker.js:28274:23)` |
| 35 | 1 | E | `[广告检测·头像·实时] 识别失败 stage=ai.run id=AQADTcExG1mkIVcB errorName=Error errorMessage=头像读字未完成：@cf/google/gemma-4-26b-a4b-it: 头像读字超时 8000ms；@cf/qwen/qwen3.8-27b: 3040: Capacity temporaril` |
| 36 | 1 | E | `[广告检测·头像·实时] 识别失败 stage=ai.run id=AQADOxRrG9gg8FcB errorName=Error errorMessage=头像读字未完成：@cf/google/gemma-4-26b-a4b-it: 4006: Service temporarily at capacity；@cf/qwen/qwen3.8-27b: 头` |
| 37 | 1 | E | `[广告检测·头像·实时] 识别失败 stage=ai.run id=AQADEQ1rG7wvkEQB errorName=Error errorMessage=头像读字未完成：@cf/google/gemma-4-26b-a4b-it: 头像读字超时 8000ms；@cf/qwen/qwen3.8-27b: 头像读字超时 20000ms errorStrin` |
| 38 | 1 | E | `[广告检测·头像·实时] 识别失败 stage=ai.run id=AQAD0Q1rGxSQ-UcB errorName=Error errorMessage=头像读字未完成：@cf/google/gemma-4-26b-a4b-it: 头像读字超时 8000ms；@cf/qwen/qwen3.8-27b: 头像读字超时 20000ms errorStrin` |
| 39 | 1 | E | `[广告检测·头像] 识别失败 stage=ai.run id=AQADrrsxG66-kVQB errorName=Error errorMessage=头像读字未完成：@cf/google/gemma-4-26b-a4b-it: 头像读字超时 8000ms；@cf/qwen/qwen3.8-27b: 头像读字超时 20000ms errorString=E` |
| 40 | 1 | E | `[广告检测·头像] 识别失败 stage=ai.run id=AQADQQ5rG2Ow8UcB errorName=Error errorMessage=头像读字未完成：@cf/google/gemma-4-26b-a4b-it: 头像读字超时 8000ms；@cf/qwen/qwen3.8-27b: 头像读字超时 20000ms errorString=E` |
| 41 | 1 | E | `[广告检测·头像] 补学失败 user=9299426305:     at drainAdAvatarLearningQueue (_worker.js:30786:41)` |
| 42 | 1 | E | `[广告检测·头像] 补学失败 user=9275530751:     at drainAdAvatarLearningQueue (_worker.js:30786:41)` |
| 43 | 1 | E | `[广告检测·头像] 补学失败 user=9142622582:     at drainAdAvatarLearningQueue (_worker.js:30786:41)` |
| 44 | 1 | E | `[广告检测·头像] 补学失败 user=9075765417:     at drainAdAvatarLearningQueue (_worker.js:30786:41)` |
| 45 | 1 | G | `[广告检测] 读取域名白名单失败: Error: D1_ERROR: internal error; reference = e_fPYqxG_83fa4fe2c050495c97f1561d40109d59; cause=internal error; reference = e_fPYqxG_83fa4fe2c050495c97f1561d40109d5` |
| 46 | 1 | F | `[广告检测] 生成文本向量失败 model=@cf/baai/bge-m3 name=Error message=similarity_budget textLen=99` |
| 47 | 1 | F | `[广告检测] 生成文本向量失败 model=@cf/baai/bge-m3 name=Error message=similarity_budget textLen=91` |
| 48 | 1 | F | `[广告检测] 生成文本向量失败 model=@cf/baai/bge-m3 name=Error message=similarity_budget textLen=78` |
| 49 | 1 | F | `[广告检测] 生成文本向量失败 model=@cf/baai/bge-m3 name=Error message=similarity_budget textLen=69` |
| 50 | 1 | F | `[广告检测] 生成文本向量失败 model=@cf/baai/bge-m3 name=Error message=similarity_budget textLen=124` |
| 51 | 1 | F | `[广告检测] 生成文本向量失败 model=@cf/baai/bge-m3 name=AiError message=8007: Cog prediction failed textLen=40` |
| 52 | 1 | F | `[广告检测] 生成文本向量失败 model=@cf/baai/bge-m3 name=AiError message=8007: Cog prediction failed textLen=13` |
| 53 | 1 | F | `[广告检测] 生成文本向量失败 model=@cf/baai/bge-m3 name=AiError message=3046: Request timeout textLen=9` |
| 54 | 1 | H | `[广告检测] 入群检测未完成: Error: 入群后的名单拦截或核验失败，等待 Webhook 重投; stack=Error: 入群后的名单拦截或核验失败，等待 Webhook 重投` |
| 55 | 1 | A | `[内容待核] 核验未完成: Error: 广告处置尚未完成：部分目标未成功; stack=Error: 广告处置尚未完成：部分目标未成功` |
| 56 | 1 | A | `[内容待核] 核验未完成: Error: 域名白名单暂不可用，本次广告检测未执行; stack=Error: 域名白名单暂不可用，本次广告检测未执行` |
| 57 | 1 | K | `[/spam] 删除群内命令消息失败:Bad Request: message can't be deleted` |
| 58 | 1 | G | `D1_ERROR: internal error; reference = e_fPYqxG_fbecbbe9142f4dc0948ce85c75671c13` |
| 59 | 1 | G | `D1_ERROR: internal error; reference = e_fPYqxG_796644ac338248a5b40f2f5aa769a00b` |
| 60 | 1 | G | `D1_ERROR: internal error; reference = e_fPYqxG_68d86abc3c8842a588726c614f994e9f` |
| 61 | 1 | G | `D1_ERROR: Your account is generating too much load on D1 DBs. Please back off and try again later.` |

## 三、根因与处置

### A. 内容待核核验未完成（206 条）

`广告处置尚未完成：部分目标未成功` 占 205 条：`enforceAdDetectionWithRetry` 返回
`complete=false`（踢人 / 禁言 / 撤回入群申请里有目标没成功），旧版直接 `console.error`。
新版已有 `adReviewPermanentActionFailure`：权限类失败 park 30 天、停止自动重排；
部署后窗口内只剩 2 条。`域名白名单暂不可用` 1 条由 D1 重试增强覆盖。

### B. 第⑥层 LLM 深度判定调用失败（131 条，占 25%）

全部是 `runAdLLMModel` 主备模型双双失败，错误码 4006 / 3040（容量不足）、
3046（超时）、8007 / 8008（平台内部），以及 message 为空的 `AiError`。
旧实现**一次都不重试**，且无条件 `console.error`。

修复：
1. 新增 `adLLMTransientError()` 识别瞬态错误（错误码 / 关键字 / 空 message）；
2. `runAdLLMModel` 对主、备模型各自补试一次（220~400ms 抖动退避）；
3. `judgeAdByLLM` catch 分级：瞬态降 `console.warn`，配置类错误保留 `console.error`；
4. 瞬态失败不计熔断、不记额度、不记去重键（原有语义不变）。

### C. 主模型降级到备用（86 条）

`glm-5.3-flash` 容量不足 → 切 `deepseek-v4.1-flash-1017`。属预期降级，
旧版用 error 打印把面板刷红，本地源码已改 warn，本次部署生效。

### D. 广告链接解析超时（51 条）

`[广告检测·链接] 解析失败 handle=xxx: The operation was aborted due to timeout`，
全部是 t.me 链接抓取自身超时。本地已有 `adLinkAborted()` 判断并屏蔽，线上旧版未含，
本次部署后不再产生 error。

### E. 头像 OCR / 补学（10 条）

- 实时识别 4 条：gemma 8000ms 超时、4006 容量不足，qwen 兜底 20000ms 也超时。
  修复：超时 8000 → 10000ms；瞬态失败走 `skipped` 分支（warn + 不计熔断）。
- 补学失败 4 条：`资料尚未完整获取` / `内容尚未核实` 是可重试业务状态，改 warn。

### F. 文本向量生成失败（8 条）

5 条 `similarity_budget`（额度用尽，本地已不再抛错）、3 条 8007 / 3046。
修复：`embedAdText` 重试范围从仅 8008 扩展到 8007 / 3046 / 3040 / 超时。

### G. D1 过载 / 内部错误（7 条）

`D1_ERROR: internal error` ×4、`too much load` ×2、白名单读取失败 ×1。
`isTransientD1SchemaError` 原先不认这两种，等于一次都不重试。
修复：纳入瞬态判定；`retryD1Read` 从 3 次 × 50ms 改为 4 次 × 120~440ms 抖动。

### H. 入群名单拦截 / 检测（5 条）

`入群后的名单拦截或核验失败，等待 Webhook 重投`：权限类失败（bot 无权限 /
对方是管理员）重投一百次也不会变，只会把 update 抛成 outcome=exception。
修复：权限类判定为永久失败，打 warn 并按已拦截返回，不再重投；
瞬态重投日志降为 warn。

### I. 获取群组信息失败（2 条）

Telegram 侧拒绝（群解散 / bot 被踢），上层已有中性默认值兜底，降 warn。

### J. 外部请求超时（4 条）

`[自动清积压]` / `[广告检测] 抓取用户资料` 的 TimeoutError。代码已有
`isTransientNetworkError` 分级，线上旧版未含，本次部署生效。

### K. 删除群内命令消息失败（3 条）

`Bad Request: message can't be deleted`：消息超 48h / 已被删除 / 无权限，
属 Telegram 侧终态。降 warn；其余错误仍 error。

### Z. 其他（8 条）

- `tc033` ×5（outcome=exception）：入群检测抛错触发 webhook 重投，已分级处理。
- `POST https://tc0333.onfire.kdns.fr/` ×2：入站 webhook 请求记录，不是代码错误。
- `群模式暂不可用` ×1：MiniApp 主动返回 503，业务提示。

## 四、部署记录

| 版本 | 时间 (UTC) | 内容 |
|---|---|---|
| `162f7959-ff41-43d5-b188-af4516e1e784` | 2026-11-22 07:10 | AI 链路重试 + 日志分级 + D1 退避 + 头像超时 |
| `cafc4ae3-9cfe-4a2f-beef-275d61081b5e` | 2026-11-22 07:14 | 空 message 瞬态 + 入群永久失败止血 |
| `1cfc0127-a452-4c09-9720-4e11adf21ffb` | 2026-11-22 07:19 | 删除消息 / 群组信息 / 补学失败分级 |
| `ba3465c2-4772-4c31-82cd-04847cf091b1` | 2026-11-22 07:31 | 第三候选模型 + 慢失败不补试（waitUntil 止血） |
| `694718ac-c494-4788-8f45-e342778f9e29` | 2026-11-22 07:36 | 第三候选改为目录实存 `qwen3.8-27b` + 显式关思考 |

备份：`_worker.js.bak-20261122-150351`（修改前原文件）

代码变更量（相对 `_worker.js.bak-20261122-150351`）：**214 行，新增 180 / 删除 34**。
新增的函数与常量：

```
function adLLMTransientError   // 瞬态错误识别（错误码 / 关键字 / 空 message）
function adLLMSleep            // 重试退避
const AD_LLM_RETRY_ATTEMPTS    // 2（含首次）
const AD_LLM_RETRY_DELAY_MS    // 220
const AD_LLM_RETRY_MAX_ELAPSED_MS // 4000，慢失败不再补试
const AD_LLM_TERTIARY_MODEL    // @cf/qwen/qwen3.8-27b
```

其余为既有函数的就地分级 / 重试 / 判定改动（`runAdLLMModel`、`judgeAdByLLM`、
`retryD1Read`、`isTransientD1SchemaError`、`embedAdText`、`screenAdJoinMember`、
`deleteAuthorizedGroupCommandMessage`、`adLLMReasoningParams` 等）。

## 五、需要继续观察

1. `[内容待核] 核验未完成`：若再次出现且不是权限类，需要看 `banResults` 具体 error。
2. Workers AI 容量问题只能缓解不能根治。已增加第三候选
   `@cf/qwen/qwen3.8-27b`（`AD_LLM_TERTIARY_MODEL`，可用 env
   `llmTertiaryModel` 覆盖）：主备同时 4006 时接管，日常零成本。
   **注意**：初版写的 `qwen3-30b-a3b-fp8` 经 `/ai/models/search` 核实已不在目录，
   不存在的模型会抛硬错误、把 warn 重新变成 error，已换成实存 ID。
   该模型默认开思考，已按头像链路同一口径传
   `chat_template_kwargs.enable_thinking=false`；REST 实测返回纯 JSON：
   `{"is_ad":true,"type":"兼职诈骗","confidence":0.98,...}`（33 tokens / 13.5 neurons）。
   同时给补试加了 4s 耗时上限（`AD_LLM_RETRY_MAX_ELAPSED_MS`）——
   4006 是立即返回，补试有意义；3046 已排队超时，补试只会把
   `ctx.waitUntil` 拖到被平台取消（已出现 2 条该警告）。
3. `tc0333.onfire.kdns.fr` 的 webhook 重投：入群检测永久失败已止血，
   若仍有 exception，需要按 traceId 追到具体 update。

## 六、部署后验证（07:23Z ~ 07:33Z，10 分钟窗口）

| 级别 | 组数 | 条数 | 说明 |
|---|---:|---:|---|
| error | 3 | 11 | 全部是旧版本 `runAdLLMModel` 行号 28315 的残留（部署切换 + 日志上报延迟） |
| warn | 6 | 48 | 全部是预期降级 |

warn 明细：

| 条数 | 内容 |
|---:|---|
| 17 | `改走下一候选 glm-5.3 → deepseek-v4.1-flash-1017`（4006） |
| 11 | `改走下一候选 deepseek → qwen3-30b-a3b-fp8`（4006，第四批版本） |
| 6 | `改走下一候选 deepseek → qwen3.8-27b`（4006，第五批版本） |
| 6 | `深度判定 调用失败（平台瞬态，已按跳过处理）`（旧版本双模型口径） |
| 6 | `主模型调用失败，改走备用`（旧版本口径） |
| 2 | `waitUntil() tasks did not complete` |

关键结论：**切到 `qwen3.8-27b` 后，没有任何一条该模型的失败日志** —— 第三候选接管成功。
4006 在主备两级同时出现（20 次主失败里 11 次备用也 4006），证明双模型链路对容量抖动确实没有冗余。

补充窗口 07:34:00Z ~ 07:37:51Z（第五批部署完成之后）：
**error 0 组 / 0 条**。此前 11 条 `runAdLLMModel (_worker.js:28315:19)` 在 07:33 之后没有新增，
确认是部署切换前的 in-flight 残留，不是新版行为。

### 最终窗口（07:33:52Z ~ 07:56:52Z，第五批部署后完整 23 分钟）

| 级别 | 组数 | 条数 | 明细 |
|---|---:|---:|---|
| error | **0** | **0** | 无 |
| warn | 3 | 16 | 7 次 `glm → deepseek`（4006）、7 次 `deepseek → qwen3.8`（4006）、2 条 `waitUntil` |

`qwen3.8-27b` 在本窗口内接管 7 次，**零失败**；未出现 `模型链路全部失败`。
对照修复前 3 天 521 条 error（其中 131 条就是这条链路），error 级已归零。

唯一残留：`waitUntil() tasks did not complete` 2 条 / 23 分钟（约 1 条 / 11.5 分钟），来自正文判定链路
`judgeAdWithLLM` 的 20s 模型超时（与本次新增重试无关，重试已有 4s 耗时上限），
不产生 error 级日志，继续观察。

### 补记：模型链路最终形态

```
glm-5.3  →  deepseek-v4.1-flash-1017  →  qwen3.8-27b
（每级：瞬态错误且耗时 <4s 才补试一次；硬错误直接换下一级）
```

三个 ID 均经 `GET /accounts/{id}/ai/models/search` 核实存在。

只有三级全挂才抛 `模型链路全部失败`，且 `transient` 取「所有错误均为瞬态」，
全瞬态才降 warn，出现任一硬错误仍保留 error。

## 七、安全提醒

本次使用的临时 API Token `cfut_p4GE...5fa`（已脱敏，完整值不入库）
**任务结束后应立即吊销**（Cloudflare Dashboard → 我的个人资料 → API 令牌 → 删除）。
