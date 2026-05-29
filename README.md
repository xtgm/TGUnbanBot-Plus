# CF-Workers-TGUnbanBot-Plus

## 🙏 致敬原作者

| 项目 | 信息 |
| --- | --- |
| **原作者** | [**CMLiussss**](https://github.com/cmliu) |
| **原项目** | [**CF-Workers-TGUnbanBot**](https://github.com/cmliu/CF-Workers-TGUnbanBot) |
| **二改作者** | 匿名 |

> 本项目所有核心思想、架构设计与初始实现，**100% 归功于原作者 [CMLiussss](https://github.com/cmliu)**。
>
> 没有原作者无私的开源分享，就没有本项目存在的可能。本项目仅是站在原作者打下的坚实基础之上，做了一些小幅度的功能扩展与代码加固，**绝不敢居功**。原作者的设计思路与代码质量是本项目的根基。
>
> **特别鸣谢原作者 [CMLiussss](https://github.com/cmliu) 设计的源代码支持** 🌟
>
> 本项目沿用原项目 MIT License，原作者的版权声明完整保留在 [LICENSE](./LICENSE) 文件中。如果你认可这套自助解封机器人，请优先访问并 Star 原项目：[github.com/cmliu/CF-Workers-TGUnbanBot](https://github.com/cmliu/CF-Workers-TGUnbanBot) 🌟

---

基于 Cloudflare Workers 的 Telegram 群组自助解封机器人。机器人通过 Telegram Webhook 接收消息，帮助被封禁或被禁言的用户在私聊中完成自助解封流程，同时提供管理员黑名单、封禁记录查询、按钮一键代发、新机器人风控等能力。

## 与原项目的差异

相对原项目（[CMLiussss/CF-Workers-TGUnbanBot](https://github.com/cmliu/CF-Workers-TGUnbanBot)），本项目主要变更：

- **解封确认严格整句匹配**：用户必须复制粘贴完整提示语才能触发解封，禁止夹带任何额外字符（防广告号绕过）。
- **多群组支持**：`GROUP_ID` 环境变量支持逗号分隔多个群组，自助解封流程会遍历每个配置群分别处理；管理员鉴权采取「任一群管理员即可」的策略。
- **黑名单结构升级（向后兼容）**：从 `["123","456"]` 裸数组升级为 `[{id, reason, by, at}]` 对象数组，记录封禁原因、操作人、时间。旧裸数组数据自动归一化升级，零迁移。
- **D1 + KV 双后端支持**：在原 KV 之外新增 Cloudflare D1 数据库支持。绑定 D1 时以 D1 为权威、KV 自动镜像；只绑定其中一个也能跑；提供一次性迁移入口 `/{TOKEN}/migrate` 把存量 KV 数据导入 D1。
- **`/blacklist` 命令**：管理员私聊查看当前黑名单（最多 30 条）。
- **`/ban` `/unban` 支持批量**：单次最多 50 个 TGID，分隔符兼容半角逗号 / 全角逗号 / 空格 / 换行；单条用法完全保持原样。
- **黑名单导出接口**：`GET /{TOKEN}/export` 浏览器直接看 HTML 表格（带搜索过滤），`?format=json` / `?format=csv` 下载完整数据，CSV 自带 BOM 让 Excel 不乱码。
- **全局黑名单真踢人闭环**：`/ban` `/spam` 加黑后会**立即遍历所有 GROUP_IDS 把人踢出群**（之前只写库不踢人）；`/spam` 还会删除被回复的垃圾消息；黑名单用户在群里发言会被实时拦截删消息+踢人；被人拉回群也会立即被踢回去；新增 `/{TOKEN}/purge` 一次性清扫存量数据。
- **`/ban` `/unban` `/spam` 群内可用 + 闪屏 + 私聊详情**：原项目 `/ban` `/unban` 强制只能私聊，本项目允许群内直接发命令；`/spam` 也升级为同款双通道。群内执行时机器人发短闪屏提示（5 秒自动撤回）+ 同时私聊管理员发完整详情，既快又不污染群消息流；详情含**群名 / 群 ID / 失败原因 / 解决建议**（Telegram 英文错误自动翻译为中文）；管理员从未私聊过 bot 时降级为群内追加"请先 /start"提示。
- **主人审计通知系统**（可选 `OWNER_ID` 启用）：配置主人后，所有管理员/超级管理员在群里使用 `/ban` `/unban` `/spam`、点一键解封按钮、群内手动 ban/unban，主人都会**收到带操作人角色标记的私聊审计通知**(主人/超级管理员/群管理员三档);其他人只看群内闪屏,不收任何私信。OWNER_ID 留空 → 全局禁用通知,保持原行为。
- **广告自动检测**（可选 `AD_FILTER_ENABLED` 启用）：普通成员发的疑似广告 → **自动删消息 + 加黑 + 全群踢出 + 通知主人**,零人工。采用**多维度加权评分 + 强特征直杀**:t.me/+ 私有群邀请链接、国际电话号这类强特征单独命中即处置;金融/色情/引流/诈骗分类词库 + 高危 emoji 密度加权评分,达阈值才判定(降低误杀)。检测覆盖消息文本/图片说明/用户名字/内嵌链接。支持环境变量追加自定义词库与白名单。管理员豁免,默认关闭。
- **`chat_member` 事件订阅**：管理员手动封/解封时机器人自动同步 KV/D1 黑名单。
- **`callback_query` 按钮交互**：二次审核结果带「✅ 同意（一键代发）」按钮，超级管理员一键代发 GKYbotSave 指令到目标群，无需复制粘贴。
- **超级管理员权限分级**：新增可选 `SUPER_ADMINS` 环境变量。普通群管理员能用所有命令但不能点按钮，按钮仅限超管使用，避免群内多名管理员误操作。
- **去除作者私群硬编码回退**：原项目在群信息查询失败时会回退到作者私群名称 `CM技术交流群` / `@CMLiussss`，本项目改为中性默认值。
- **修复 `/check` 群内回复时响应错发到主群的 bug**：现在响应回到当前群。

> 全局黑名单语义：KV / D1 中的黑名单是**永久全局黑名单**，命中后自助解封流程第一道闸即拒绝，机器人的任何流程都不会清除（包括 GKYbotSave 按钮代发）。只有管理员主动 `/unban 用户ID` 才能从黑名单移除。

## 功能

### 普通用户

- `/start`、`/unban`：向用户展示自助解封说明。
- 复制粘贴指定整句确认文本：自动检查用户在每个配置群内的状态，分别尝试 `unbanChatMember` / `restrictChatMember`，并返回逐群结果。
- 用户存在 GKY 封禁记录时，自动在主群 @管理员 进行二次审核。

### 群管理员（任一配置群管理员即生效）

| 命令 | 使用位置 | 说明 |
| --- | --- | --- |
| `/ban 用户ID` | 私聊 / 群内 | 加入 KV/D1 黑名单（reason=manual）+ **遍历所有 GROUP_IDS 真踢出群**。**支持批量**：`/ban 123,456,789`（半角 / 全角逗号 / 空格 / 换行均可，单次最多 50 个）。**群内执行时机器人发短闪屏（5 秒自动撤回）+ 私聊管理员发完整详情**，避免长结果污染群消息流。 |
| `/unban 用户ID` | 私聊 / 群内 | 从 KV/D1 黑名单移除。**支持批量**：`/unban 123,456,789`（同上分隔符与上限）。群内执行时同样发闪屏 + 私聊详情。 |
| `/spam` | 群内回复 | 把被回复用户加入 KV/D1 黑名单（reason=spam）+ **遍历所有 GROUP_IDS 真踢出群** + **删除被回复的垃圾消息** |
| `/check` | 群内回复 | 查询被回复用户的 GKY 封禁记录，返回带按钮的二次审核 |
| `/blacklist` | 私聊 | 查看当前 KV/D1 黑名单（最多显示 30 条） |
| `/start check_用户ID` | 私聊深链 | 二次审核入口，由机器人自动生成链接 |

### 超级管理员

`SUPER_ADMINS` 环境变量配置的 TGID。除拥有群管理员所有命令外，可点击二次审核结果中的「✅ 同意（一键代发）」按钮：机器人自动代发 `GKYbotSave\n用户ID` 指令到目标群（GKYbot 据此处理白名单/移出黑名单），并在原消息追加操作记录。普通群管理员看到按钮但点击会被拒绝。

> 安全默认：未配置 `SUPER_ADMINS` 时按钮存在但无人能点，仅复制按钮可用。

### 自动化

- **新机器人风控**：所有配置群中，**新加入**的「其它机器人」若**不是管理员**则被自动全权限禁言。具体规则：
  - ✅ 触发：群里有人**新拉入**一个机器人，且该机器人不是群管理员
  - ❌ 不触发：群里**已存在**的旧机器人（不会回溯处理已在群成员）
  - ❌ 不触发：本机器人自己被加入群（不会自禁）
  - ❌ 不触发：新加入的机器人**已经是管理员**（拉进群之前就设为管理员可绕过禁言）
  - ❌ 不触发：新加入的是普通用户（非机器人）
  - 用途：防止有人偷偷把广告 / 拉群 / 转发类机器人拉进群里发广告，争取时间让群主决定是否踢掉
- **管理员手动操作同步**：群管理员手动 ban/unban 操作时，机器人通过 `chat_member` 事件自动同步 KV/D1 黑名单（被踢即加黑、解禁即移黑）。
- **黑名单用户群消息拦截**：已在 KV/D1 全局黑名单的用户，在任一配置群发言时机器人会**实时删除消息并踢出群**。管理员豁免（避免误加黑导致管理员被踢）。
- **黑名单用户复入群拦截**：已在黑名单的用户被人拉回群 / 自己加回群时（`chat_member` 事件 status 变为 member），机器人会**立即把他再踢出去**，无需人工介入。

## 项目结构

```text
.
├── _worker.js       # Worker 主程序
├── wrangler.toml    # Cloudflare Wrangler 配置
├── test_batch.mjs   # 批量 /ban /unban 离线测试（47 项）
├── test_export.mjs  # 导出接口离线测试（40 项）
├── test_kick.mjs    # 真踢人闭环离线测试（31 项）
├── README.md
└── LICENSE
```

## 前置条件

- 一个 Telegram Bot Token，通过 [@BotFather](https://t.me/BotFather) 创建。
- 一个 Cloudflare 账号，启用 Workers。
- 本地安装 Node.js 和 Wrangler，或直接使用 Cloudflare 控制台部署。
- 机器人需要被加入目标群组并设为管理员。

建议给机器人以下权限：

- 封禁用户或解除封禁
- 管理员权限或限制成员权限
- 读取群成员状态
- 发送消息

> `chat_member` 事件订阅要求机器人是群管理员，否则收不到该事件 — 但本来部署就要求管理员权限，无需额外配置。

## 环境变量

> **配置优先级**：环境变量 > `_worker.js` 顶部 `=可修改=` 区段的硬编码默认值。
> 也就是说，你既可以直接改源码顶部默认值，也可以在 Cloudflare 后台填环境变量临时覆盖；两者同时存在时**环境变量胜出**。

### 必填（缺失会返回 500）

| 变量名 | 说明 |
| --- | --- |
| `TOKEN` | 初始化入口密钥。访问 `https://你的Worker域名/{TOKEN}` 注册 Webhook + 注册命令；访问 `https://你的Worker域名/{TOKEN}/migrate` 触发 KV → D1 迁移；访问 `https://你的Worker域名/{TOKEN}/export` 导出黑名单；访问 `https://你的Worker域名/{TOKEN}/purge` 一次性清扫存量黑名单仍在群里的人。建议用随机长字符串。 |
| `BOT_TOKEN` | Telegram Bot Token，从 [@BotFather](https://t.me/BotFather) 取。 |
| `GROUP_ID` | 目标 Telegram 群组 ID，支持逗号分隔多群组（半角 `,` 与全角 `，` 都兼容）。例如 `-1001234567890` 或 `-1001234567890,-1009876543210`。第一个群作为「主群」，二次审核提醒等会发到主群。 |

### 可选（不填则使用源码顶部默认值）

| 变量名 | 默认 | 说明 |
| --- | --- | --- |
| `SUPER_ADMINS` | 空数组 | 超级管理员 TGID 白名单，环境变量为字符串形式，**逗号分隔多个**（半角 `,` 与全角 `，` 都兼容），例如 `123456,789012`。仅这些用户能点击「✅ 同意（一键代发）」按钮。未配置时按钮存在但无人能点（安全默认）。也可在 `_worker.js` 顶部 `DEFAULT_SUPER_ADMINS` 数组中硬编码。 |
| `OWNER_ID` | 空 | 主人审计通知 — 单个 TGID。配置后，所有管理员/超管使用 `/ban` `/unban` `/spam`、点一键解封按钮、群内手动 ban/unban，主人都会收到带操作人角色（主人/超级管理员/群管理员）标记的私聊通知；其他人只看群闪屏,不收任何私信。**前提**：主人必须先私聊过 bot 一次（任意 `/start` 即可），否则 Telegram 不允许 bot 主动发私信。留空 → 全局禁用，行为退化为只发群闪屏。也可在 `_worker.js` 顶部 `DEFAULT_OWNER_ID` 中硬编码。 |
| `AD_FILTER_ENABLED` | `false` | 广告自动检测总开关。设为 `true` 启用。命中广告 → 自动删消息+加黑+全群踢+通知主人。**默认关闭**,建议先调好词库再开,避免误伤。 |
| `AD_SCORE_THRESHOLD` | `3` | 广告评分阈值。各维度加权分总和 ≥ 阈值即判广告。调高 → 更保守(漏检多);调低 → 更激进(误杀多)。强特征(t.me 邀请链接/国际电话号)绕过评分直接判定。 |
| `AD_KEYWORDS` | 空 | 追加自定义广告词,逗号分隔(半角/全角逗号都兼容),命中权重 +2。与内置分类词库合并生效。 |
| `AD_WHITELIST` | 空 | 白名单词,逗号分隔。命中的词**不计分**,用于避免特定话题群误伤(如币圈群把 `usdt` 加白名单)。 |
| `AD_CHECK_BIO` | `false` | 是否检测用户简介 bio。**有限制**:Telegram Bot API 只能拿到已与 bot 交互过用户的 bio,群里陌生用户拿不到,且有 API 成本。默认关闭。 |
| `SELF_UNBAN_KEYWORD` | `我不是广告狗，我是误封的，希望可以解封。` | 自助解封确认整句。用户必须**完整逐字粘贴**才会触发解封流程。 |
| `SELF_UNBAN_PROMPT` | 见源码 | `/start` `/unban` 命令收到时返回的欢迎/检查清单。支持 HTML 子集。占位符：`{userId}` `{title}` `{keyword}` 会自动替换。 |
| `SELF_UNBAN_APPROVED` | 见源码 | 用户输入正确确认句、解封请求被同意时回复的提示。占位符：`{username}`（主群 @用户名 或主群 ID）。 |
| `BLACKLIST_PAGE_LIMIT` | `30` | `/blacklist` 命令单次最多展示多少条（按时间倒序，最新在前）。值必须是正整数。 |
| `BLACKLIST_REASON_LABELS` | 见源码 | `/blacklist` 列表中"原因"字段的中文映射，**JSON 字符串**形式。例：`{"spam":"群内举报","manual":"管理员添加","manual_ban":"自动同步"}`。非法 JSON 时自动回退默认。 |
| `GKY_BANLIST_ENDPOINT` | `https://gkybot.gmeow.cc/banlist` | GKY 封禁记录查询后端。改动者请确保返回 HTML 与 `parseBanlistHTML` 兼容。 |

### 关于源码顶部 `=可修改=` 区段

`_worker.js` 文件最顶部有一段被 `=可修改=` 与 `=结束=` 标注的常量区，包含上述全部可选项的默认值。如果你不想用环境变量、希望直接改源码，**只改这一段**即可，其它代码无需触碰。

```js
// =可修改= 项目内置文案与参数
// 优先级：环境变量 > 这里的硬编码默认值
const DEFAULT_SELF_UNBAN_KEYWORD = '我不是广告狗，我是误封的，希望可以解封。';
const DEFAULT_SELF_UNBAN_PROMPT = `...`;
const DEFAULT_SELF_UNBAN_APPROVED = `...`;
const DEFAULT_BLACKLIST_PAGE_LIMIT = 30;
const DEFAULT_BLACKLIST_REASON_LABELS = { spam: '...', manual: '...', manual_ban: '...' };
const DEFAULT_GKY_BANLIST_ENDPOINT = 'https://gkybot.gmeow.cc/banlist';
const DEFAULT_SUPER_ADMINS = ['123456', '789012'];   // 数组形式，多个 TGID
const DEFAULT_OWNER_ID = '';                          // 主人 TGID，留空禁用审计通知
// =结束=
```

## 存储绑定（择一或都绑）

| 绑定 | binding 名 | 用途 |
| --- | --- | --- |
| KV Namespace | `KV` | 原始存储方案。命令、黑名单存于 `blacklist` 这个 key（JSON 数组）。 |
| D1 Database | `DB` | 新增可选高性能后端。表名 `blacklist`，首次写入自动建表。 |

行为矩阵：

| KV | D1 | 行为 |
| --- | --- | --- |
| ✅ | ❌ | 沿用原项目 KV 模式（向后完全兼容） |
| ❌ | ✅ | D1 唯一存储 |
| ✅ | ✅ | 读 D1（D1 不可用时回退 KV）；写 D1 后自动镜像到 KV |
| ❌ | ❌ | 黑名单功能不可用，自助解封仍可工作 |

> KV/D1 都不绑定时，自助解封仍可用，但 `/ban` `/spam` `/blacklist` 等命令会提示未绑定存储空间。

## 部署

### 1. 安装 Wrangler

```bash
npm install -g wrangler
wrangler login
```

### 2. 创建存储（可选，至少绑定一个）

**KV：**

```bash
wrangler kv namespace create KV
```

把输出的 `id` 写到 `wrangler.toml` 的 KV 配置中。

**D1（推荐）：**

```bash
wrangler d1 create tg-unban-bot-plus
```

把输出的 `database_id` 写到 `wrangler.toml` 的 D1 配置中。表结构由代码自动建立，无需手动执行 SQL。

### 3. 启用 Observability（可选）

参考 `wrangler.toml` 中的 `[observability]` 配置段。建议至少开启 `logs`，因为 Worker 会输出 Telegram 更新、权限检查、API 返回等调试信息。

### 4. 设置环境变量

```bash
wrangler secret put TOKEN
wrangler secret put BOT_TOKEN
wrangler secret put GROUP_ID
wrangler secret put SUPER_ADMINS    # 可选
# 以下全部可选；不填则使用 _worker.js 顶部 =可修改= 区段的默认值
# wrangler secret put SELF_UNBAN_KEYWORD
# wrangler secret put SELF_UNBAN_PROMPT
# wrangler secret put SELF_UNBAN_APPROVED
# wrangler secret put BLACKLIST_PAGE_LIMIT
# wrangler secret put BLACKLIST_REASON_LABELS
# wrangler secret put GKY_BANLIST_ENDPOINT
```

也可以在 Cloudflare Dashboard 的 Worker 设置页中添加同名变量。

### 5. 部署 Worker

```bash
wrangler deploy
```

部署后记录 Worker 域名，例如：

```text
https://tg-unban-bot-plus.example.workers.dev
```

### 6. 初始化 Webhook

访问下面的地址：

```text
https://你的Worker域名/你的TOKEN
```

成功后会自动完成：

- 设置 Telegram Webhook 到 Worker 根路径 `/`
- 订阅 `message` / `chat_member` / `callback_query` 三类更新
- 设置机器人命令：`/unban` `/ban` `/spam` `/check` `/blacklist`

返回 JSON 中 `成功: true` 即表示初始化完成。

### 7. 存量 KV 数据迁移到 D1（可选，仅在你从原项目升级时需要）

如果你之前部署过原项目（仅 KV）且现在新增了 D1 绑定，可以一键把存量 KV 黑名单导入 D1：

```text
GET https://你的Worker域名/你的TOKEN/migrate
```

返回示例：

```json
{
  "成功": true,
  "KV源条数": 25,
  "D1新增": 25,
  "D1已存在": 0
}
```

迁移幂等，重复触发安全。完成后 D1 与 KV 数据一致，且后续写入会自动维持镜像。

## 使用方法

### 用户自助解封

1. 用户私聊机器人发送 `/start` 或 `/unban`。
2. 机器人返回自助解封说明，包含一段 `<code>` 提示语供复制。
3. 用户**完整复制粘贴**以下整句（多/少标点、夹带任何字符均会被拒绝）：

   ```text
   我不是广告狗，我是误封的，希望可以解封。
   ```

4. 机器人遍历每个配置群，检查用户在该群的状态：
   - `kicked` → `unbanChatMember` 解封
   - `restricted` 或发言权被关闭 → `restrictChatMember` 恢复发言
   - 已是正常成员 → 提示无明显限制
5. 全部群处理完后返回逐群结果。
6. 若用户存在 GKY 封禁记录，会在主群 @管理员 进行二次审核（含「同意」按钮 + 复制按钮）。

### 二次审核流程

管理员收到二次审核提醒（来自 `/check` 命令、`/start check_用户ID` 深链或自助解封触发）时，消息底部有两个按钮：

- **✅ 同意 移出黑名单/添加白名单（一键代发）**：仅 `SUPER_ADMINS` 可点。点击后机器人自动代发 `GKYbotSave\n用户ID` 到目标群，原消息追加「已由超级管理员 X 一键代发」记录。
- **📋 点击复制 移出黑名单/添加白名单 代码**：所有人可点，复制后手动粘贴到群里发送。这是兜底路径，超管不在线时使用。

注意：按钮和复制都仅触发 GKYbotSave 指令给 GKYbot 处理，**不会**操作本项目维护的 KV/D1 黑名单 — 全局黑名单需要管理员显式 `/unban 用户ID` 才能移除。

## HTTP 接口

### 查询封禁记录（公开）

```http
GET /banlist?tgid=用户ID
```

示例：

```bash
curl "https://你的Worker域名/banlist?tgid=123456789"
```

返回示例：

```json
{
  "success": true,
  "banned": false,
  "tgid": "123456789",
  "message": "此TG帳號并沒有封鎖記錄 / This TG account has no ban record"
}
```

存在封禁记录时返回字段还可能包含 `chatId`、`msgId`、`reason`、`info`、`recordedDate`。

### 一次性迁移入口（受 TOKEN 保护）

```http
GET /{TOKEN}/migrate
```

把 KV 黑名单全量幂等导入 D1，并把 KV 镜像更新为 D1 全表。要求同时绑定 KV 和 D1。

### 黑名单导出（受 TOKEN 保护）

```http
GET /{TOKEN}/export                 # 默认：HTML 表格，浏览器直接看
GET /{TOKEN}/export?format=json     # 下载 JSON 文件（带 attachment 头）
GET /{TOKEN}/export?format=csv      # 下载 CSV 文件（含 UTF-8 BOM，Excel 中文不乱码）
```

**特点**：

- **数据源自动选择**：有 D1 用 D1，没 D1 用 KV，逻辑与 `getBlacklist` 一致
- **HTML 视图**：表格 + 顶部下载按钮 + 实时搜索框（按 TGID / 原因 / 操作人过滤）
- **时间倒序**：最新封禁的排在最前面
- **文件名带时间戳**：`blacklist-2026-05-24T10-00-00-000Z.json`
- **TOKEN 保护**：URL 必须带正确的 TOKEN，路由不匹配返回 405
- **HTML 注入防护**：所有用户输入字段都通过 `escapeHtml` 转义

**示例**：

```bash
# 浏览器直接打开看表格
open https://你的Worker域名/你的TOKEN/export

# 命令行下载 JSON 备份
curl -o blacklist.json "https://你的Worker域名/你的TOKEN/export?format=json"

# 下载 CSV 给运营/财务
curl -o blacklist.csv "https://你的Worker域名/你的TOKEN/export?format=csv"
```

### 一次性清扫入口（受 TOKEN 保护）

```http
GET /{TOKEN}/purge
```

扫描当前 KV/D1 黑名单 × 所有 `GROUP_IDS`，对每个**仍在群里**的人调 `banChatMember` 真踢出群。Telegram 状态为 `kicked` / `left` 的会跳过。返回 JSON 详情：

```json
{
  "成功": true,
  "黑名单总数": 33,
  "配置群组数": 2,
  "已踢出": 5,
  "不在群": 60,
  "失败": 1,
  "详情": [
    { "用户ID": "123", "群ID": "-1001234567890", "旧状态": "member", "结果": "已踢" },
    { "用户ID": "456", "群ID": "-1001234567890", "旧状态": "member", "结果": "失败", "错误": "Bad Request: not enough rights to restrict/unrestrict chat member" }
  ]
}
```

**用途**：当你从原项目升级（原项目只写黑名单不踢人）或修复了 bot 权限后，跑一遍 `/purge` 把所有早期"加黑了但还在群里"的用户清扫掉。幂等可重复触发。

## 常见问题

### Q1：访问 `/{TOKEN}` 返回 500，或部署后 Webhook 不工作

**原因**：环境变量 `TOKEN` / `BOT_TOKEN` / `GROUP_ID` 三项缺一不可，缺失会直接返回 500。
**解决**：

1. 用 `wrangler secret list` 或在 Cloudflare Dashboard 检查三项变量是否都填了。
2. `TOKEN` 不是 Telegram Bot Token，而是你自定义的初始化入口密钥（建议随机长字符串）。
3. `BOT_TOKEN` 才是 [@BotFather](https://t.me/BotFather) 给的 Token。
4. `GROUP_ID` 必须是机器人所在的目标群组 ID（负数，例如 `-1001234567890`）。

### Q2：用户在私聊发了正确确认句却没被解封

**原因**：本项目要求**完整逐字粘贴**才放行，多/少标点、夹带任何字符都会被拒绝（用于阻止广告号绕过）。
**解决**：

1. 用户必须直接复制 `<code>` 标签里的整句，不能手打。
2. 若你修改了 `SELF_UNBAN_KEYWORD`，欢迎语里的 `<code>` 提示语会自动同步，但用户必须用**当前生效的整句**，不是旧的。
3. 检查用户是否在 KV/D1 全局黑名单（这是永久封禁，第一道闸就被拦下，必须由管理员手动 `/unban` 才能解除）。

### Q3：机器人收不到群里管理员手动封/解封的同步信号

**原因**：`chat_member` 事件需要机器人**本身是群管理员**才能收到。
**解决**：

1. 把机器人设为目标群组的管理员。
2. 重新访问 `https://你的Worker域名/{TOKEN}` 让机器人重新订阅 webhook。
3. 检查 Cloudflare Worker 日志：每次有 `chat_member` 事件时会打印 `[chat_member] 同步加黑/移黑` 日志。

### Q4：超级管理员点了「✅ 同意（一键代发）」按钮被拒

**原因**：当前点击者不在 `SUPER_ADMINS` 白名单中。`SUPER_ADMINS` 的优先级是「环境变量 > 顶部 `DEFAULT_SUPER_ADMINS` 数组」。
**解决**：

1. 检查 `SUPER_ADMINS` 环境变量是否填了点击者的 TGID（多个用逗号分隔，例如 `123456,789012`）。
2. 或者改 `_worker.js` 顶部 `DEFAULT_SUPER_ADMINS` 数组并重新部署。
3. 注意：环境变量一旦填写就**完全覆盖**硬编码默认值，不会合并。
4. 普通群管理员看到按钮但无法点击属于正常行为，他们应该用「📋 点击复制 ... 代码」按钮手动粘贴。

### Q5：从原项目升级过来后，老的 KV 黑名单数据没出现在 D1

**原因**：D1 表结构由代码自动创建，但**存量数据不会自动迁移**。
**解决**：浏览器访问 `https://你的Worker域名/{TOKEN}/migrate` 触发一次性迁移，幂等可重复触发。要求同时绑定 KV 和 D1。

### Q6：`/banlist?tgid=...` 返回失败或无数据

**原因**：`/banlist` 依赖外部服务 `https://gkybot.gmeow.cc/banlist`，外部不可用时查询会失败。
**解决**：

1. 等外部服务恢复，或换一个 GKY 兼容的后端：设置 `GKY_BANLIST_ENDPOINT` 环境变量。
2. 注意：如果换后端，新后端返回的 HTML 必须与 `parseBanlistHTML` 的正则匹配，否则即使联通也解析不出。

### Q7：修改了 `_worker.js` 顶部的 `DEFAULT_*` 默认值，但没生效

**原因**：环境变量优先级高于顶部硬编码。如果 Cloudflare 后台已经填了同名环境变量，会覆盖你改的源码。
**解决**：

1. 检查 Cloudflare Dashboard 是否填了同名环境变量。
2. 如果填了，要么删掉环境变量、要么直接修改环境变量的值（环境变量更方便）。
3. 修改源码后必须 `wrangler deploy` 重新部署才生效。

### Q8：管理员命令（`/ban` `/spam` `/check` `/blacklist`）没反应

**原因**：管理员鉴权策略是「调用者必须是任一配置群（GROUP_ID 列表中的任意一个）的管理员」。
**解决**：

1. 确认你是 `GROUP_ID` 中至少一个群的管理员或群主。
2. `/ban` `/unban` `/blacklist` 必须**私聊机器人**发送（群里发不会响应）。
3. `/spam` `/check` 必须在配置群内**回复某条消息**才生效。
4. 检查 Worker 日志中的「权限状态: xxx」行，能看到机器人查到的你当前角色。

### Q9：部署后环境变量被意外重置

**原因**：默认情况下 `wrangler deploy` 会用本地 `wrangler.toml` 覆盖远端配置。
**解决**：本项目 `wrangler.toml` 里已设置 `keep_vars = true`，部署时会保留 Cloudflare Dashboard 中已有的环境变量。如果你 fork 后改了这个配置，记得改回来。

### Q10：自助解封通过后，用户为什么还是不能在群里发言

**原因**：本机器人解封流程只调用 Telegram 的 `unbanChatMember` / `restrictChatMember`，恢复账号在群里的「能否发言」状态。但有些场景仍可能受限：

1. 用户没重新加入群组（`kicked` 状态解封后用户需要重新点链接加群）。
2. 用户被其它机器人/反垃圾系统单独标记限言（与本机器人无关）。
3. 用户在 GKY 全局黑名单中 — 这种情况会触发主群二次审核提醒，需要管理员处理 GKY 那边的封禁。
4. 用户在 KV/D1 本项目的全局黑名单中 — 这个永远拦在第一道闸，必须管理员 `/unban` 才能放行。

### Q11：`/ban` `/unban` 批量超过 50 个怎么办

**原因**：单次批量上限是 50 个 TGID（写在 `_worker.js` 的 `BATCH_LIMIT` 常量里）。这个上限既保护 D1 串行写时长（避免 Worker 超时），也兼顾 Telegram 单条消息 4096 字符回执长度。
**解决**：

1. 把名单切成多批，每批最多 50 个，分多次发命令。例如 `/ban 100,101,...,149` 一批，`/ban 150,151,...,199` 又一批。
2. 分隔符随便用：半角 `,` / 全角 `，` / 空格 / 换行 都可以混用，便于从其它表格 / 聊天记录直接粘贴。
3. 批量过程中重复 ID 会自动去重，已在黑名单的会单独标记，不会让整批失败。
4. KV+D1 双绑场景下，整批写完只镜像一次 KV，节省写入额度。

### Q12：`/{TOKEN}/export` 接口怎么用，安不安全

**原因**：原项目没有导出接口，本项目新增 `GET /{TOKEN}/export`，支持浏览器查看 / JSON 下载 / CSV 下载（Excel 友好）。
**安全性**：

1. 受 `TOKEN` 保护，URL 必须带正确 TOKEN，否则路由不匹配返回 405。和 `/{TOKEN}/migrate` 同等防护级别。
2. 所有用户输入字段（TGID / 原因 / 操作人 / 时间）通过 `escapeHtml` 转义，HTML 视图无注入风险。
3. `Cache-Control: no-store` 头确保中间代理不会缓存敏感数据。

**使用方式**：

| 场景 | URL |
| --- | --- |
| 浏览器查看（带搜索过滤） | `/{TOKEN}/export` |
| 下载 JSON 备份 | `/{TOKEN}/export?format=json` |
| 下载 CSV 给 Excel | `/{TOKEN}/export?format=csv` |

**注意**：

1. TOKEN 不要泄漏（同时也是 webhook 初始化密钥），泄漏即等于黑名单可被任何人查看下载。
2. 数据源自动选：有 D1 用 D1，没 D1 用 KV，与 `/blacklist` 命令一致。
3. 导出量不受 `BLACKLIST_PAGE_LIMIT` 限制 — 那是 `/blacklist` 命令的展示上限，导出永远全量返回。

### Q13：`/ban` `/spam` 显示"全部群踢人失败"怎么办

**原因**：踢人需要 bot 在目标群拥有"封禁用户"权限。bot 不是群管理员，或者管理员权限里关闭了"封禁用户"开关时，Telegram 会拒绝 `banChatMember` 请求。
**解决**：

1. 进入目标群组 → 群设置 → 管理员 → 找到本机器人 → 打开"封禁用户"权限。
2. 确认开关：**封禁用户（Ban Users）**、**删除消息（Delete Messages）** 这两项必须打开。
3. 改完后无需重启 Worker，下次触发 `/ban` `/spam` 立即生效。
4. 如果想清扫之前因权限不足"加黑了但没踢"的存量用户：浏览器访问 `https://你的Worker域名/{TOKEN}/purge` 一次性扫描清扫。

### Q14：黑名单用户的旧消息怎么办，会被自动删吗

**原因**：本项目调用的 `banChatMember` API 带 `revoke_messages: true`，Telegram 会**自动撤回该用户最近 48 小时**内在该群发的所有消息。这是 Telegram 平台规则，48 小时之外的消息**无法撤回**。
**解决**：

1. 自动撤回 48 小时内消息已是 Telegram 上限，本项目无法做更多。
2. 如需删除更早的消息，只能群管理员手动逐条删，或群管理员用 Telegram 客户端的"清除全部消息"功能（针对单个用户）。
3. `/spam` 命令额外删除被回复那条具体的垃圾消息，不受 48 小时限制（因为是按 `message_id` 直接删）。

### Q15：群里发了 /ban 但没收到私聊详情

**原因**：本项目 `/ban` `/unban` 在群内执行时，机器人会同时给管理员发**私聊详情**。Telegram 平台规则：**bot 不能主动给从未交互过的用户发私信**。如果你（管理员）从未私聊过这个机器人，私聊投递会失败。
**解决**：

1. 私聊机器人发一次 `/start`（或任意消息）即可建立会话，之后机器人就能给你发私信了。
2. 失败后机器人会在群里追加一条短提示（8 秒自动撤回），文案含可点击的"私聊机器人"链接。
3. 如果只想看到私聊详情、不想群里有任何痕迹，依然可以**直接私聊机器人发 `/ban` `/unban`**（向后完全兼容，行为不变）。

### Q16：群里 /ban 闪屏 5 秒自动撤回，但闪屏没消失

**原因**：闪屏自动撤回靠 `deleteMessage` API，bot 必须有"删除消息"权限。如果 bot 不是群管理员或权限不足，闪屏会留在群里不撤回。
**解决**：

1. 进入目标群组 → 群设置 → 管理员 → 找到本机器人 → 打开"删除消息"权限。
2. 主流程不受影响：加黑、踢人、私聊详情都已经完成，只是闪屏没自动撤回。
3. 群管理员可以手动删那条闪屏消息。

### Q17：群管理员 / 其他超管在群里发命令，他们自己收不到私聊详情

**原因**：本项目设计了"主人审计通知"机制 — 一旦配置 `OWNER_ID`，**所有详情统一发给主人**，其他人只看群闪屏。这是有意为之的隐私设计：
- 主人能看到全局"是谁在做什么"（操作人角色 + 完整详情）
- 其他管理员/超管在群里看到闪屏知道执行成功即可，不需要看到详情

如果你希望恢复"每个管理员各自收到自己的详情"老行为：
- 不配置 `OWNER_ID`(留空) → 退化为只发群闪屏，不发任何私聊详情(简化模式)
- 想要"每个人都收自己的"老行为，本项目当前不支持。如果你需要，可以提 issue 提议加 `BROADCAST_TO_TRIGGER` 开关

### Q18：配置了 OWNER_ID 但主人收不到通知

**原因**:Telegram 平台规则 — bot **不能主动给从未交互过的用户发私信**。如果你设了 OWNER_ID 但从未私聊过 bot，所有通知投递都会失败。

**解决**：

1. 主人账号私聊 bot 发一次 `/start`（任意消息都行），建立会话
2. Worker 日志会显示 `[审计通知] 私聊主人失败:Forbidden: bot can't initiate conversation` — 凡是看到这条日志，就是没建立私聊
3. 检查 OWNER_ID 是否填了**正确的纯数字 TGID**（不要填 username）
4. 临时禁用通知 → 把 OWNER_ID 留空，Worker 自动退化

### Q19：操作人标签会显示"主人"/"超级管理员"/"群管理员"，怎么判断

**原因**：本项目按以下优先级判定操作人角色（用于审计通知标签）：

1. 如果操作人 TGID **等于 OWNER_ID** → 标"主人"
2. 否则如果在 SUPER_ADMINS 名单 → 标"超级管理员"
3. 否则按调用上下文兜底（chat_member 同步标"群管理员"，命令鉴权后默认"管理员"）

**示例**：

- 你自己(主人) `/ban 123` → 私聊收到"🔔 主人操作通知"
- 名单中的超管 X `/ban 123` → 主人收到"🔔 超级管理员操作通知\n操作人:X(超级管理员)"
- 群管理员 Y `/ban 123` → 主人收到"🔔 群管理员操作通知\n操作人:Y(群管理员)"

### Q20：广告自动检测误杀了正常用户怎么办

**原因**：评分阈值太低,或某个正常话题词恰好命中词库。
**解决**(任选):

1. **调高阈值**：`AD_SCORE_THRESHOLD` 设大一点(如 `4` 或 `5`),需要更多广告特征叠加才判定。
2. **加白名单**：把被误判的词加进 `AD_WHITELIST`(逗号分隔),该词命中不计分。例如币圈讨论群:`AD_WHITELIST=usdt,承兑,搬砖`。
3. **临时全关**：`AD_FILTER_ENABLED=false` 立即停用,排查后再开。
4. **手动恢复被误杀的用户**:私聊 bot 发 `/unban 用户TGID` 把他从黑名单移除(注意:踢出群后用户需要重新加群)。
5. 查 Worker 日志的 `[广告检测] 命中` 行,能看到具体命中了哪些特征,据此调整。

### Q21：广告漏检了(没杀掉)怎么调

**原因**：广告用了新词库没有的变体,或评分没达阈值。
**解决**:

1. **加自定义词**：把广告里的特征词加进 `AD_KEYWORDS`(逗号分隔),命中权重 +2。
2. **调低阈值**：`AD_SCORE_THRESHOLD` 设为 `2`,更激进(但误杀风险上升)。
3. **强特征最稳**:带 t.me/+ 邀请链接、国际电话号的广告一定会被秒杀,无视阈值。如果广告没有这些,只能靠词库。
4. 内置词库已涵盖金融/色情/引流/诈骗四大类常见词,持续遇到新变体就往 `AD_KEYWORDS` 里加。

## License

本项目沿用原项目 MIT License。

原作者：[CMLiussss](https://github.com/cmliu) — Copyright (c) 2026
原项目：[CF-Workers-TGUnbanBot](https://github.com/cmliu/CF-Workers-TGUnbanBot)

再次特别鸣谢原作者 [CMLiussss](https://github.com/cmliu) 设计的源代码支持 🙏

详见 [LICENSE](./LICENSE) 文件。
