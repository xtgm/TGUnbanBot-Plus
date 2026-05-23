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
| `/ban 用户ID` | 私聊 | 加入 KV/D1 黑名单（reason=manual） |
| `/unban 用户ID` | 私聊 | 从 KV/D1 黑名单移除 |
| `/spam` | 群内回复 | 把被回复用户加入 KV/D1 黑名单（reason=spam） |
| `/check` | 群内回复 | 查询被回复用户的 GKY 封禁记录，返回带按钮的二次审核 |
| `/blacklist` | 私聊 | 查看当前 KV/D1 黑名单（最多显示 30 条） |
| `/start check_用户ID` | 私聊深链 | 二次审核入口，由机器人自动生成链接 |

### 超级管理员

`SUPER_ADMINS` 环境变量配置的 TGID。除拥有群管理员所有命令外，可点击二次审核结果中的「✅ 同意（一键代发）」按钮：机器人自动代发 `GKYbotSave\n用户ID` 指令到目标群（GKYbot 据此处理白名单/移出黑名单），并在原消息追加操作记录。普通群管理员看到按钮但点击会被拒绝。

> 安全默认：未配置 `SUPER_ADMINS` 时按钮存在但无人能点，仅复制按钮可用。

### 自动化

- **新机器人风控**：所有配置群中，新入群的机器人若不是管理员则被自动禁言。
- **管理员手动操作同步**：群管理员手动 ban/unban 操作时，机器人通过 `chat_member` 事件自动同步 KV/D1 黑名单（被踢即加黑、解禁即移黑）。

## 项目结构

```text
.
├── _worker.js       # Worker 主程序
├── wrangler.toml    # Cloudflare Wrangler 配置
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
| `TOKEN` | 初始化入口密钥。访问 `https://你的Worker域名/{TOKEN}` 注册 Webhook + 注册命令；访问 `https://你的Worker域名/{TOKEN}/migrate` 触发 KV → D1 迁移。建议用随机长字符串。 |
| `BOT_TOKEN` | Telegram Bot Token，从 [@BotFather](https://t.me/BotFather) 取。 |
| `GROUP_ID` | 目标 Telegram 群组 ID，支持逗号分隔多群组。例如 `-1001234567890` 或 `-1001234567890,-1009876543210`。第一个群作为「主群」，二次审核提醒等会发到主群。 |

### 可选（不填则使用源码顶部默认值）

| 变量名 | 默认 | 说明 |
| --- | --- | --- |
| `SUPER_ADMINS` | 空数组 | 超级管理员 TGID 白名单，环境变量为字符串形式，**逗号分隔多个**，例如 `123456,789012`。仅这些用户能点击「✅ 同意（一键代发）」按钮。未配置时按钮存在但无人能点（安全默认）。也可在 `_worker.js` 顶部 `DEFAULT_SUPER_ADMINS` 数组中硬编码。 |
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

## 注意事项

- `TOKEN` 不是 Telegram Bot Token，而是初始化入口密钥。
- `GROUP_ID` 必须包含机器人所在的目标群组 ID，多群组用逗号分隔。
- 初始化入口 `/{TOKEN}` 同时支持 GET 和 POST。
- Telegram Webhook 订阅 `message` / `chat_member` / `callback_query`。
- GKY 封禁记录查询依赖外部服务 `https://gkybot.gmeow.cc/banlist`，外部不可用时查询会失败。
- `wrangler.toml` 中设置了 `keep_vars = true`，部署时保留 Cloudflare Dashboard 中已有的环境变量。
- KV/D1 全局黑名单是**永久封禁**，自助解封流程第一道闸即拒绝；机器人不会从全局黑名单中清除任何人，必须由管理员显式 `/unban` 处理。

## License

本项目沿用原项目 MIT License。

原作者：[CMLiussss](https://github.com/cmliu) — Copyright (c) 2026
原项目：[CF-Workers-TGUnbanBot](https://github.com/cmliu/CF-Workers-TGUnbanBot)

再次特别鸣谢原作者 [CMLiussss](https://github.com/cmliu) 设计的源代码支持 🙏

详见 [LICENSE](./LICENSE) 文件。
