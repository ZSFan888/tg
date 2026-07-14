# tg-cf-ai-bot

一个纯私聊模式的 Telegram AI 机器人，基于 Cloudflare Workers + grammY + Workers AI 构建，支持流式回复、用户级人格设置、自定义提示词和使用量统计。

本文档使用 **Fork + Connect to Git** 的方式部署，全程在浏览器里完成，不需要安装任何本地工具、不需要用命令行。跟着下面的步骤一步步做，大概 10 分钟能上线。

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

## 第 3 步：在 Cloudflare 创建 Worker 并连接你的 GitHub 仓库

不需要编辑任何代码文件、不需要手动填 KV ID，全部在界面上点选完成。

1. 登录 [dash.cloudflare.com](https://dash.cloudflare.com)
2. 左侧菜单点 **计算 (Workers) → Workers 和 Pages**
3. 点击 **创建 (Create)**
4. 选择 **连接到 Git (Connect to Git)**，不要选"克隆存储库 URL"或模板
5. 如果还没授权 GitHub，会跳转到 GitHub 走一次授权流程：
   - 选择 **Only select repositories**
   - 勾选你刚 fork 出来的仓库（`你的用户名/tg`）
   - 点击 **Install & Authorize**
6. 授权完成后回到 Cloudflare，从列表里选中你 fork 的仓库，点击 **继续 (Continue)**
7. 进入构建配置页面，确认这两项（通常会自动识别，不用改）：
   - 构建命令：留空或 `npm install`
   - 部署命令：`npx wrangler deploy`
8. 点击下方的 **变量和机密 (Variables and Secrets)**，添加两个 Secret：
   - 名称 `BOT_TOKEN`，值填第 1 步拿到的 Token
   - 名称 `TELEGRAM_WEBHOOK_SECRET`，值随便填一段随机字符串（比如 `myBot2026SecretKey888`），自己记住，下面还要用一次
9. 点击 **保存并部署 (Save and Deploy)**

第一次部署此时会成功，但因为还没绑定 KV，机器人的记忆和统计功能暂时不能用——下一步马上加上。

---

## 第 4 步：创建 KV 数据库并直接绑定（不用填 ID）

1. 部署完成后，进入这个 Worker 的详情页
2. 点击顶部标签栏的 **绑定 (Bindings)**
3. 点击 **添加绑定 (Add binding)**，类型选择 **KV 命名空间 (KV Namespace)**
4. 绑定名称填 `BOT_KV`（必须完全一致）
5. 在"选择 KV 命名空间"这一步，点击 **创建新的命名空间 (Create new)**，起个名字比如 `tg-bot-kv`，直接创建
6. Cloudflare 会自动把这个新建的命名空间和 `BOT_KV` 绑定在一起，**全程不需要你复制粘贴任何 ID**
7. 同一个页面，检查有没有一个类型是 **Workers AI** 的绑定，绑定名叫 `AI`；如果没有，同样点 **添加绑定** 手动加一个
8. 保存后，回到 **部署 (Deployments)** 标签页，点击最新一次部署旁边的菜单，选择 **重新部署 (Retry deployment)** 或者直接推送一次代码改动触发新部署，让绑定生效

---

## 第 5 步：确认部署成功

访问 Worker 网址，类似：

```
https://tg-cf-ai-bot.你的子域名.workers.dev
```

如果看到类似这样的一段文字（JSON 格式），说明部署成功：

```json
{"ok":true,"service":"tg-cf-ai-bot"}
```

如果看到 **Error 1101**，回第 4 步检查：
- `BOT_KV` 绑定是否已经创建并生效（绑定后是否重新部署了一次）
- `BOT_TOKEN` 和 `TELEGRAM_WEBHOOK_SECRET` 是否已经在"变量和机密"里保存
- `AI` 绑定（Workers AI 类型）是否存在

**把这个网址完整复制下来**，下一步注册 webhook 要用。

---

## 第 6 步：注册 Telegram Webhook

这一步是告诉 Telegram "有新消息时，把消息推送到我的 Worker 地址"。

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
     "url": "https://<你的Worker网址>/telegram/webhook",
     "secret_token": "<你在第5步填的TELEGRAM_WEBHOOK_SECRET>"
   }
   ```
5. 点击 **Send**，看到返回 `{"ok":true,"result":true,"description":"Webhook was set"}` 就说明成功

**方法二：如果你有电脑，用命令行**

```bash
curl -X POST "https://api.telegram.org/bot<你的BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<你的Worker网址>/telegram/webhook",
    "secret_token": "<你的TELEGRAM_WEBHOOK_SECRET>"
  }'
```

---

## 第 7 步：测试机器人

打开 Telegram，搜索你在第 1 步创建的机器人 username，点击进入对话，发送 `/start`。

看到欢迎消息和按钮菜单，说明全部部署成功。直接发一句话测试 AI 聊天，应该能看到打字机效果的流式回复。

---

## 以后怎么更新代码

因为用的是 Connect to Git 方式，以后你 fork 的仓库如果有新代码（比如同步了原仓库的更新），或者你自己改了代码并 push，Cloudflare 会**自动重新部署**，不需要手动操作。

如果原仓库（`ZSFan888/tg`）后续有更新，想同步到你自己 fork 的仓库，在你 fork 的仓库页面点击 **Sync fork → Update branch** 即可，同步后 Cloudflare 会自动触发新的部署。

---

## 功能一览

- **AI 自动回复**：私聊直接发消息即可对话，调用 Cloudflare Workers AI
- **流式回复**：打字机效果，边生成边显示，不用等全部生成完
- **上下文记忆**：按用户保留最近几轮对话（KV 存储，7 天过期）
- **回复风格切换**：默认 / 极简 / 专业 / 幽默 / 自定义提示词
- **使用量统计**：`/usage` 查看今日调用次数
- **用户白名单**：可选限制只允许指定 Telegram 用户使用
- **限流保护**：防止刷爆免费额度
- **Webhook 签名校验**：防止伪造请求

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
| `/model` | 查看当前 AI 模型 |
| `/ping` | 健康检查 |

---

## 可选：配置白名单和其他参数

部署完成后，去 Worker 详情页 → **设置 → 变量和机密**，可以调整这些非密钥变量（点右边的铅笔图标编辑）：

- `ALLOWED_USER_IDS`：只想让特定人用？填入 Telegram 用户 id，多个用英文逗号分隔，例如 `123456789,987654321`；填 `all` 表示任何人都能用（默认值）。查自己的用户 id 可以找 Telegram 里的 `@userinfobot`。
- `MAX_HISTORY`：机器人记住最近几轮对话，默认 `8`。
- `RATE_LIMIT_PER_MINUTE`：每个用户每分钟最多能请求几次 AI，默认 `12`。

改完保存后需要触发一次新部署才会生效（可以在仓库里随便改一个字符再提交一次 commit，Cloudflare 会自动重新构建）。

---

## 常见问题排查

**Worker 打开显示 Error 1101（Worker threw exception）**

最常见的原因不是没填变量，而是**填了但被自动部署清空了**。Cloudflare 的"连接到 Git"机制默认每次部署都会用 `wrangler.jsonc` 覆盖所有配置，Secret 类的变量如果没写在配置文件里，会在下一次自动部署时被静默清空——哪怕你之前手动加过。

本仓库的 `wrangler.jsonc` 已经加了 `"keep_vars": true` 这个开关，作用是告诉 Cloudflare"保留 Dashboard 里手动设置的变量，部署时不要覆盖它们"。如果你的 fork 是在这次更新之前创建的，需要同步一次最新代码：

1. 打开你 fork 的仓库页面，点击 **Sync fork → Update branch**，同步最新的 `wrangler.jsonc`
2. 同步后会自动触发一次新部署，等它跑完
3. 重新去"变量和机密"页面，把 `BOT_TOKEN` 和 `TELEGRAM_WEBHOOK_SECRET` **再填一次**（这一次填完不会再被清空）
4. 确认页面上显示"2 个已加密变量"而不是"无"

其余检查项：
- `BOT_KV` 绑定是否已经创建（在"绑定"页面添加 KV 命名空间绑定，绑定名必须是 `BOT_KV`）
- Workers AI 绑定（名叫 `AI`）是否存在

**机器人在 Telegram 里没有任何回复**

- 访问 `https://api.telegram.org/bot<你的token>/getWebhookInfo`，看 `last_error_message` 字段有没有报错信息
- 确认 webhook 的 url 填的是 `.../telegram/webhook`（结尾别漏了这段路径）
- 确认 `secret_token` 和 Cloudflare 里配置的 `TELEGRAM_WEBHOOK_SECRET` 完全一致

**"提取 GitHub 用户或组织详细信息时出错"**

这是 Cloudflare 读取 GitHub 授权信息时的提示，通常不影响实际部署结果，可以先忽略，等部署完成看 Worker 网址是否正常访问再判断。如果部署确实失败，去 [github.com/settings/installations](https://github.com/settings/installations) 找到 Cloudflare Workers and Pages，重新确认一下仓库访问权限。

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
