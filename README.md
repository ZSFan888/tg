# tg-cf-ai-bot

一个纯私聊模式的 Telegram AI 机器人，基于 Cloudflare Workers + grammY + Workers AI 构建，支持流式回复、用户级人格设置、自定义提示词和使用量统计。

本文档使用 **Fork + Cloudflare Pages** 的方式部署，全程在浏览器里完成，不需要安装任何本地工具、不需要用命令行。Pages 部署比 Workers 的"连接到 Git"更稳定，环境变量不会被自动清空。跟着下面的步骤一步步做，大概 10 分钟能上线。

---

## 部署前需要准备的东西

1. 一个 **GitHub 账号**（用来 fork 这个仓库）
2. 一个 **Cloudflare 账号**（免费）：[dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)
3. 一个 **Telegram 账号**，用来创建机器人

---

## 第 1 步：创建 Telegram 机器人，拿到 Bot Token

1. 在 Telegram 里搜索并打开 **@BotFather**
2. 发送 `/newbot`
3. 按提示输入机器人的显示名称，再输入 username（必须以 `bot` 结尾，例如 `my_ai_helper_bot`）
4. 创建成功后会收到一段文本，里面有一行类似：
   ```
   Use this token to access the HTTP API:
   123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
   **把这一整行 token 复制保存下来**，后面要填两次。

---

## 第 2 步：Fork 这个仓库到你自己的账号

1. 打开 [github.com/ZSFan888/tg](https://github.com/ZSFan888/tg)
2. 点击右上角的 **Fork** 按钮
3. 保持默认设置，点击 **Create fork**

完成后，你会有一份自己名下的仓库副本，地址类似 `github.com/你的用户名/tg`，之后所有配置都在这份副本上进行，不会影响原仓库。

---

## 第 3 步：在 Cloudflare 用 Pages 部署，连接你的 GitHub 仓库

改用 **Cloudflare Pages** 部署，比 Workers 的"连接到 Git"更简单，不会遇到变量被自动清空的问题，全程在界面上点选完成。

1. 登录 [dash.cloudflare.com](https://dash.cloudflare.com)
2. 左侧菜单点 **计算 (Workers) → Workers 和 Pages**
3. 点击 **创建 (Create)**
4. 选择 **Pages** 标签，再点击 **连接到 Git (Connect to Git)**
5. 如果还没授权 GitHub，会跳转到 GitHub 走一次授权流程：
   - 选择 **Only select repositories**
   - 勾选你刚 fork 出来的仓库（`你的用户名/tg`）
   - 点击 **Install & Authorize**
6. 授权完成后回到 Cloudflare，从列表里选中你 fork 的仓库，点击 **开始设置 (Begin setup)**
7. 在构建设置里填（**这三项都必须明确填写，不能留空**，留空 Cloudflare 会直接跳过依赖安装，导致打包时找不到 grammy/hono 报错）：
   - 框架预设：**无 (None)**
   - 构建命令：`npm install`
   - 构建输出目录：`public`
8. 点击 **环境变量 (Environment variables)**，添加以下变量（先不用管加密/普通，都填成一般文本即可，Pages 不会像 Workers 那样自动清空）：
   - `BOT_TOKEN`：填第 1 步拿到的 Token
   - `TELEGRAM_WEBHOOK_SECRET`：填一段随机字符串（比如 `myBot2026SecretKey888`），自己记住，下面还要用
9. 点击 **保存并部署 (Save and Deploy)**

---

## 第 4 步：绑定 KV 和 Workers AI

这个仓库的 `wrangler.jsonc` 只保留了本地开发用的基础配置（没有加 `pages_build_output_dir`），所以生产环境的绑定完全可以在仪表盘上点选完成，不需要改代码文件：

1. 部署完成后，进入这个 Pages 项目详情页
2. 点击顶部标签栏的 **设置 (Settings) → 函数 (Functions)**
3. 找到 **KV 命名空间绑定 (KV namespace bindings)**，点击 **添加绑定**：
   - 变量名称填 `BOT_KV`
   - 点击 **创建新的命名空间 (Create new)**，起个名字比如 `tg-bot-kv`，直接创建并绑定，不需要手动填任何 ID
4. 同一个页面找到 **Workers AI 绑定**，点击 **添加绑定**：
   - 变量名称填 `AI`
5. 保存后，回到 **部署 (Deployments)** 标签页，点击最新一次部署旁边的菜单，选择 **重新部署 (Retry deployment)**，让新绑定生效

---

## 第 5 步：确认部署成功

访问 Pages 分配的网址，类似：

```
https://tg-cf-ai-bot.pages.dev
```

如果看到一段返回文字（可能是占位页面或者 JSON），说明静态部分已经跑起来。真正验证 API 是否正常，访问：

```
https://tg-cf-ai-bot.pages.dev/healthz
```

看到类似 `{"ok":true,"now":...}` 就说明 Functions 和绑定都生效了。

如果访问报错，回第 4 步检查 `BOT_KV` 和 `AI` 绑定是否都已添加，以及是否重新部署过。

**把这个 pages.dev 网址完整复制下来**，下一步注册 webhook 要用。

---

## 第 6 步：注册 Telegram Webhook

这一步是告诉 Telegram "有新消息时，把消息推送到我的网址"。

**方法一：用手机浏览器打开在线请求工具**（推荐，不需要电脑）

1. 打开 [reqbin.com](https://reqbin.com)
2. 请求方法选 **POST**
3. URL 填：
   ```
   https://api.telegram.org/bot<你的BOT_TOKEN>/setWebhook
   ```
4. Content 类型选 **JSON**，Body 填：
   ```json
   {
     "url": "https://<你的Pages网址>/telegram/webhook",
     "secret_token": "<你在第3步填的TELEGRAM_WEBHOOK_SECRET>"
   }
   ```
5. 点击 **Send**，看到返回 `{"ok":true,"result":true,"description":"Webhook was set"}` 就说明成功

**方法二：如果你有电脑，用命令行**

```bash
curl -X POST "https://api.telegram.org/bot<你的BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<你的Pages网址>/telegram/webhook",
    "secret_token": "<你的TELEGRAM_WEBHOOK_SECRET>"
  }'
```

---

## 第 7 步：测试机器人

打开 Telegram，搜索你在第 1 步创建的机器人 username，点击进入对话，发送 `/start`。

看到欢迎消息和按钮菜单，说明全部部署成功。直接发一句话测试 AI 聊天，应该能看到打字机效果的流式回复。

---

## 第 8 步：注册机器人菜单栏（可选，但推荐）

Telegram 输入框左下角有个"菜单"按钮，点开会显示命令列表——这个需要单独注册一次才会显示。用浏览器访问一次：

```
https://<你的Pages网址>/setup-menu?secret=<你的TELEGRAM_WEBHOOK_SECRET>
```

看到返回 `{"ok":true,"commands":[...]}` 就说明成功了。回到 Telegram 和机器人的对话框，点一下输入框左下角的菜单图标，应该就能看到所有命令和说明了。这一步只需要做一次，以后新增命令了再重新访问一次即可更新菜单。

---

## 以后怎么更新代码

因为用的是 Pages Connect to Git 方式，以后你 fork 的仓库如果有新代码（比如同步了原仓库的更新），或者你自己改了代码并 push，Cloudflare 会**自动重新部署**，不需要手动操作。环境变量在 Pages 里不会像 Workers 那样被自动清空，改一次就一直生效。

如果原仓库（`ZSFan888/tg`）后续有更新，想同步到你自己 fork 的仓库，在你 fork 的仓库页面点击 **Sync fork → Update branch** 即可，同步后 Cloudflare 会自动触发新的部署。

---

## 功能一览

- **AI 自动回复**：私聊直接发消息即可对话，调用 Cloudflare Workers AI
- **多模型切换**：`/model` 命令可在 8 个模型间自由切换，速度和质量各不相同，按用户单独保存选择
- **流式回复**：打字机效果，边生成边显示，不用等全部生成完
- **上下文记忆**：按用户保留最近几轮对话（KV 存储，7 天过期）
- **回复风格切换**：默认 / 极简 / 专业 / 幽默 / 自定义提示词
- **使用量统计**：`/usage` 查看今日调用次数
- **用户白名单**：可选限制只允许指定 Telegram 用户使用
- **限流保护**：防止刷爆免费额度
- **Webhook 签名校验**：防止伪造请求
- **管理员后台**：`/stats` 查看全局使用统计，`/broadcast` 一键群发通知
- **对话导出**：`/export` 把当前上下文导出成 txt 文件
- **联网搜索**：`/websearch` 开启后，回答会先搜索最新网络信息再总结（基于 Tavily API）
- **重新生成**：每条 AI 回复下方都有"› 重新生成"按钮，不满意可以直接换一版答案
- **编辑消息重新触发**：编辑已发送的消息会自动重新生成回答，不用重新打字
- **追问建议**：AI 回答后自动生成 2-3 个相关追问按钮，点了直接问，不用手动打字
- **使用趋势图**：`/stats` 现在会附带一张近 14 天消息量的趋势图，并列出每个模型的累计调用次数，方便判断哪些冷门模型可以下线省额度
- **用户禁用**：管理员可以用 `/ban` `/unban` 临时或永久限制某个用户使用机器人
- **追问生成中提示**：AI 回答完成后，重新生成按钮下方会先显示"追问生成中…"占位，追问按钮生成好后自动替换，不会让人觉得卡住了
- **持续"正在输入…"状态**：AI 生成回答期间，Telegram 顶部会一直显示"正在输入…"（每 4 秒刷新一次，因为 Telegram 官方这个状态最多维持 5 秒），跟真人打字体验一致，不会中途消失
- **访问自助申请**：白名单外的用户发消息时，会自动生成一条申请，管理员实时收到带"批准/拒绝"按钮的通知，点一下即可授权，不用去 Cloudflare 后台改环境变量

---

## 可选模型列表

`/model` 命令会列出以下模型供选择，从快到强排列，选择后立即生效并持久保存：

| 模型 | 特点 |
|---|---|
| Llama 3.2 1B（默认） | 响应最快，几乎不排队，适合日常闲聊 |
| Llama 3.2 3B | 比默认模型更聪明一点，速度依然很快 |
| Llama 3.1 8B（更强） | 理解力更强，适合稍复杂的问题 |
| Llama 3.1 8B FP8 | 8B 的量化版本，推理更省资源 |
| Llama 4 Scout 17B | 较新的中型模型，综合能力更强 |
| Qwen3 30B | 阿里 Qwen 系列，中文理解能力出色 |
| Mistral Small 3.1 24B | 欧洲厂商模型，逻辑推理能力较强 |
| Llama 3.3 70B（最强） | 回答质量最好，但速度最慢、消耗额度最多 |

**注意**：模型越大，消耗的免费额度（Neurons）越多，速度也会变慢。日常使用建议保持默认的 1B 模型，遇到复杂问题再临时切换到更强的模型。

---

## 常用命令速查

| 命令 | 功能 |
|---|---|
| `/start` | 欢迎消息 + 按钮菜单 |
| `/help` | 查看所有命令说明 |
| `/chat` | 提示进入聊天模式 |
| `/settings` | 切换回复风格 |
| `/setprompt` | 设置自定义系统提示词 |
| `/usage` | 查看今日使用次数 |
| `/clear` | 清空当前会话上下文 |
| `/export` | 导出当前对话记录为文本文件 |
| `/websearch` | 开启/关闭联网搜索 |
| `/model` | 查看并切换 AI 模型 |
| `/ping` | 健康检查 |

---

## 可选：配置白名单和其他参数

部署完成后，去 Worker 详情页 → **设置 → 变量和机密**，可以调整这些非密钥变量（点右边的铅笔图标编辑）：

- `ALLOWED_USER_IDS`：只想让特定人用？填入 Telegram 用户 id，多个用英文逗号分隔，例如 `123456789,987654321`；填 `all` 表示任何人都能用（默认值）。查自己的用户 id 可以找 Telegram 里的 `@userinfobot`。
- `ADMIN_USER_IDS`：管理员的 Telegram 用户 id，多个用英文逗号分隔。填了这个之后，这些用户才能用 `/stats` 和 `/broadcast` 管理员命令，其他人使用会被拒绝。**留空则没有人能用管理员命令**，务必至少填自己的 id。
- `MAX_HISTORY`：机器人记住最近几轮对话，默认 `8`。
- `RATE_LIMIT_PER_MINUTE`：每个用户每分钟最多能请求几次 AI，默认 `12`。

改完保存后需要触发一次新部署才会生效（可以在仓库里随便改一个字符再提交一次 commit，Cloudflare 会自动重新构建）。

---

## 管理员命令

配置好 `ADMIN_USER_IDS` 之后，管理员在 Telegram 里可以用这些命令：

| 命令 | 功能 |
|---|---|
| `/stats` | 查看累计用户数、今日/近 7 天活跃用户数、今日消息总量、按模型的调用次数，并附带近 14 天趋势图 |
| `/broadcast <内容>` | 给所有跟机器人有过互动的用户群发一条系统通知 |
| `/ban <用户ID> [分钟数] [原因]` | 禁用某个用户，不填分钟数则永久禁用 |
| `/unban <用户ID>` | 解除对某个用户的禁用 |
| `/requests` | 查看当前所有待审核的访问申请 |
| `/revoke <用户ID>` | 撤销通过审批流程批准的用户的访问权限 |

**关于统计范围**：`/stats` 统计的是所有用过 `/start` 或发过消息的用户，不是只统计管理员自己。首次使用建议先跑 `/stats` 确认用户数据已经开始累积，趋势图需要至少两天数据才会显示。

**关于群发**：`/broadcast` 只会发给已经跟机器人互动过的人（用过 `/start` 或发过消息），无法发给从未打开过机器人对话的人——这是 Telegram 平台限制，任何机器人都做不到主动私信陌生人。群发时机器人会逐条发送，每条间隔 60 毫秒，避免触发 Telegram 的限流；如果用户数很多，群发会需要一些时间，发送过程中会提示"开始群发"，完成后会汇总成功和失败的数量。

**关于禁用**：`/ban` 需要提供用户的数字 ID（不是用户名），可以在管理员收到的消息转发信息里查看，或者让用户自己发送 `/start`，机器人日志/KV 里会记录其 ID。被禁用的用户发消息不会有任何 AI 回复，只会收到一条说明禁用状态和解除时间的提示；如果不填分钟数则是永久禁用，直到管理员手动 `/unban`。

---

## 联网搜索功能（可选）

`/websearch` 命令让机器人可以先搜索最新网络信息再回答，适合问天气、新闻、股价这类模型自身知识回答不了的问题。这个功能基于 Tavily 搜索 API，需要单独申请一个免费密钥：

1. 打开 [tavily.com](https://tavily.com)，用邮箱注册账号（不需要信用卡）
2. 登录后在控制台首页能直接看到你的 API Key，通常是 `tvly-` 开头的一串字符，复制它
3. 回到 Cloudflare Pages 项目 → **设置 → 环境变量**，新增一条：
   - 变量名：`TAVILY_API_KEY`
   - 值：刚复制的密钥
4. 保存后去 **部署** 页面点一次"重新部署"

配置好之后，任何用户在 Telegram 里发送 `/websearch` 就能自己开启/关闭这个功能，是按用户单独保存的开关，不影响别人。开启后每次提问机器人会先联网搜索、把搜索结果喂给 AI 再回答，回答末尾会附上信息来源链接。

**免费额度**：Tavily 每月免费 1000 次搜索，个人使用完全够用；如果没配置这个密钥，用户发送 `/websearch` 尝试开启时会收到提示，告知这个功能还没配置好。


---

## 常见问题排查

**部署失败，报错 "Could not resolve grammy/hono"**

说明构建时没有执行 `npm install`，`node_modules` 是空的。去 **设置 → 构建 (Builds and deployments) → 构建配置**，确认"构建命令"这一栏确实填了 `npm install`（不是留空），保存后点 **重试部署**。

**访问 pages.dev 网址或 /healthz 报错**

- 检查 **设置 → 环境变量**，确认 `BOT_TOKEN` 和 `TELEGRAM_WEBHOOK_SECRET` 都已经填写并保存（Pages 的环境变量不会像 Workers 那样被自动部署清空，填一次就会一直保留）
- 检查 **设置 → 函数 (Functions)**，确认 `BOT_KV` 和 `AI` 两个绑定都已经添加
- 改完绑定后一定要去 **部署 (Deployments)** 页面点一次"重新部署"，新配置才会生效

**仪表盘上找不到"添加绑定"按钮**

如果出现这种情况，说明 `wrangler.jsonc` 里被加上了 `pages_build_output_dir` 这个字段——一旦有这个字段，Cloudflare 会把整个配置文件当作绑定的唯一来源，仪表盘的绑定入口就会被禁用。这个仓库默认的 `wrangler.jsonc` 里没有这个字段，如果你看到这个问题，检查一下这个文件有没有被意外改动过。

**机器人在 Telegram 里没有任何回复**

- 访问 `https://api.telegram.org/bot<你的token>/getWebhookInfo`，看 `last_error_message` 字段有没有报错信息
- 确认 webhook 的 url 填的是 `.../telegram/webhook`（结尾别漏了这段路径），域名是 Pages 分配的 `.pages.dev` 地址
- 确认 `secret_token` 和 Cloudflare 里配置的 `TELEGRAM_WEBHOOK_SECRET` 完全一致

**"提取 GitHub 用户或组织详细信息时出错"**

这是 Cloudflare 读取 GitHub 授权信息时的提示，通常不影响实际部署结果，可以先忽略，等部署完成看 pages.dev 网址是否正常访问再判断。如果部署确实失败，去 [github.com/settings/installations](https://github.com/settings/installations) 找到 Cloudflare Workers and Pages，重新确认一下仓库访问权限。

**收到"抱歉，你没有使用这个机器人的权限"**

- 说明 `ALLOWED_USER_IDS` 配置了白名单但你的用户 id 不在里面，去 `@userinfobot` 查一下自己的 id 再加进去，或者直接改成 `all`

**AI 回复很慢或经常报错**

- 免费的 Workers AI 有每日额度限制（10000 Neurons/天），额度用尽后请求会失败，可以用 `/usage` 观察消耗速度

---

## 项目结构

```txt
src/
  bot/
    context.ts
    create-bot.ts
  config/
    personas.ts
  handlers/
    callbacks.ts
    commands.ts
    messages.ts
  services/
    ai.ts
  storage/
    chat-store.ts
    pending-store.ts
    preferences-store.ts
    rate-limit.ts
    usage-store.ts
  types/
    env.ts
  utils/
    access.ts
    throttle.ts
  index.ts
```

## 技术细节说明

### 流式回复

Workers AI 支持 `stream: true` 参数返回 SSE 格式的 `ReadableStream`。机器人边读流边拼接文字，节流（默认 1.4 秒一次）调用 Telegram 的 `editMessageText` 更新消息，模拟打字机效果。如果模型不支持流式返回，会自动降级为一次性返回完整文本。

### 自定义提示词

用户发 `/setprompt` 后，机器人进入"等待输入"状态（KV 存储，5 分钟过期），下一条消息会被识别为提示词内容并保存，之后对话都会套用这个提示词。

### 使用量统计

按用户 id + 日期存储调用次数，每天自动重置，用于观察是否接近免费额度上限。

---

## 下一步可以扩展的方向

- 语音消息转文字
- 图片理解（需切换到支持多模态的模型）
- 对话导出为文件
- 管理员专属命令查看全局使用量汇总
