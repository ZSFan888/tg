# tg-cf-ai-bot

一个纯私聊模式的 Telegram AI 机器人，基于 Cloudflare Workers + grammY + Workers AI 构建，支持流式回复、用户级人格设置、自定义提示词和使用量统计。

本文档提供完整的从零部署步骤，跟着做即可上线一个可用的机器人。

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

## 部署前需要准备

在开始之前，确认你有以下三样东西：

1. 一个 **Cloudflare 账号**（免费即可）：[dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)
2. 一个 **Telegram 账号**，用来创建机器人
3. 本地安装好 **Node.js 18 及以上版本**，可以在终端运行 `node -v` 确认

---

## 第 1 步：创建 Telegram 机器人

1. 在 Telegram 里搜索并打开 **@BotFather**
2. 发送 `/newbot`
3. 按提示依次输入：
   - 机器人的显示名称（随便起，用户会看到这个名字）
   - 机器人的 username，必须以 `bot` 结尾（例如 `my_ai_helper_bot`）
4. 创建成功后，BotFather 会返回一段类似这样的文本：
   ```
   Use this token to access the HTTP API:
   123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
   **把这个 token 完整复制保存下来**，后面配置要用，这就是 `BOT_TOKEN`。

---

## 第 2 步：获取项目代码

```bash
git clone https://github.com/ZSFan888/tg.git
cd tg
```

---

## 第 3 步：安装依赖

```bash
npm install
```

这会安装 `grammy`（Telegram bot 框架）、`hono`（路由框架）、`wrangler`（Cloudflare 部署工具）等依赖。

---

## 第 4 步：登录 Cloudflare

```bash
npx wrangler login
```

这会打开浏览器，登录你的 Cloudflare 账号并授权。授权成功后终端会显示登录成功提示，回到终端继续下一步。

---

## 第 5 步：创建 KV 数据库

机器人用 KV 存聊天记录、用户设置和使用统计，运行：

```bash
npx wrangler kv namespace create BOT_KV
```

执行后会输出类似这样的内容：

```
🌀 Creating namespace with title "tg-cf-ai-bot-BOT_KV"
✨ Success!
Add the following to your configuration file:
{
  "kv_namespaces": [
    {
      "binding": "BOT_KV",
      "id": "a1b2c3d4e5f6xxxxxxxxxxxxxxxxxxxx"
    }
  ]
}
```

**复制这个 `id` 的值**，打开项目根目录的 `wrangler.jsonc` 文件，找到这一段：

```jsonc
"kv_namespaces": [
  {
    "binding": "BOT_KV",
    "id": "replace-with-your-kv-id"
  }
],
```

把 `"replace-with-your-kv-id"` 替换成你刚才复制的真实 id，保存文件。

---

## 第 6 步：生成一个 Webhook 密钥

这个密钥用来验证收到的请求确实来自 Telegram，防止被人伪造请求攻击你的机器人。随便生成一段随机字符串即可，可以用这条命令生成：

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

会输出类似这样的一串字符：

```
7f3a9c1e2b8d4f6a0c5e9b3d7a1f8c2e4b6d9a0c
```

**复制保存下来**，这就是 `TELEGRAM_WEBHOOK_SECRET`，后面会用到两次。

---

## 第 7 步：配置本地环境变量（用于本地开发测试，可选）

```bash
cp .dev.vars.example .dev.vars
```

用文本编辑器打开 `.dev.vars`，填入第 1 步和第 6 步拿到的值：

```
BOT_TOKEN=123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TELEGRAM_WEBHOOK_SECRET=7f3a9c1e2b8d4f6a0c5e9b3d7a1f8c2e4b6d9a0c
```

保存文件。**这个文件已经在 `.gitignore` 里，不会被提交到 Git，不用担心泄露。**

如果你只想直接部署到生产环境，跳过本地测试，可以跳过这一步，直接到第 9 步。

---

## 第 8 步（可选）：本地测试

```bash
npm run dev
```

终端会显示一个本地地址（通常是 `http://localhost:8787`）。因为 Telegram 需要一个公网可访问的 HTTPS 地址才能推送消息，本地测试通常需要配合 `cloudflared tunnel` 或类似工具做临时公网映射，如果你只是想验证代码没有语法错误，看到 wrangler 正常启动不报错即可，直接跳到下一步做真实部署。

按 `Ctrl+C` 停止本地服务。

---

## 第 9 步：配置生产环境的密钥（Secrets）

`.dev.vars` 只在本地开发时生效，**部署到 Cloudflare 生产环境需要单独设置 Secrets**。依次运行以下两条命令：

```bash
npx wrangler secret put BOT_TOKEN
```

命令执行后会提示你输入值，粘贴第 1 步拿到的 Bot Token，按回车确认。

```bash
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

同样粘贴第 6 步生成的密钥，按回车确认。

---

## 第 10 步：（可选）配置白名单和其他参数

打开 `wrangler.jsonc`，在 `vars` 部分可以调整这些配置：

```jsonc
"vars": {
  "BOT_WEBHOOK_PATH": "/telegram/webhook",
  "ALLOWED_USER_IDS": "",
  "AI_MODEL": "@cf/meta/llama-3.2-1b-instruct",
  "SYSTEM_PROMPT": "你是一个简洁、友好的 Telegram 私聊助手。优先用中文回答，回答要直接，不要废话。",
  "MAX_HISTORY": "8",
  "RATE_LIMIT_PER_MINUTE": "12"
}
```

- `ALLOWED_USER_IDS`：如果只想让特定人使用机器人，填入 Telegram 用户 id，多个用英文逗号分隔，例如 `"123456789,987654321"`。留空则任何人都能私聊使用。想知道自己的 Telegram 用户 id，可以在 Telegram 里搜索 `@userinfobot` 并发送任意消息。
- `MAX_HISTORY`：机器人记住最近几轮对话，默认 8。
- `RATE_LIMIT_PER_MINUTE`：每个用户每分钟最多能请求几次 AI，默认 12，用来防止刷爆免费额度。

如果不确定，保持默认值即可，先跑起来再慢慢调整。

---

## 第 11 步：部署到 Cloudflare Workers

```bash
npm run deploy
```

部署成功后，终端会输出一个 Worker 地址，类似：

```
Published tg-cf-ai-bot (1.2 sec)
  https://tg-cf-ai-bot.你的子域名.workers.dev
```

**把这个网址完整复制下来**，下一步注册 webhook 要用。

---

## 第 12 步：注册 Telegram Webhook

这一步是告诉 Telegram："有新消息时，请把消息推送到我的 Worker 地址"。

把下面命令里的三处内容替换成你自己的真实值：

- `<YOUR_BOT_TOKEN>` → 第 1 步拿到的 Bot Token
- `<your-worker-domain>` → 第 11 步拿到的 Worker 地址（去掉 `https://` 前缀，只保留域名部分）
- `<YOUR_TELEGRAM_WEBHOOK_SECRET>` → 第 6 步生成的密钥

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<your-worker-domain>/telegram/webhook",
    "secret_token": "<YOUR_TELEGRAM_WEBHOOK_SECRET>"
  }'
```

举个完整例子（假设 token 是 `123456789:AAExxxx`，Worker 地址是 `tg-cf-ai-bot.zsfan.workers.dev`，密钥是 `7f3a9c1e2b8d`）：

```bash
curl -X POST "https://api.telegram.org/bot123456789:AAExxxx/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://tg-cf-ai-bot.zsfan.workers.dev/telegram/webhook",
    "secret_token": "7f3a9c1e2b8d"
  }'
```

如果返回结果里看到：

```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

说明注册成功。

---

## 第 13 步：验证 Webhook 状态（可选，排查用）

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

正常情况下会看到你刚设置的 url，并且 `pending_update_count` 应该是 0，`last_error_message` 字段不存在或为空。如果看到错误信息，通常是 Worker 地址填错或密钥不匹配。

---

## 第 14 步：测试机器人

打开 Telegram，搜索你在第 1 步创建的机器人 username，点击进入对话，发送 `/start`。

如果一切正常，机器人会回复欢迎消息和按钮菜单。直接发一句话测试 AI 聊天，应该能看到打字机效果的流式回复。

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

## 常见问题排查

**机器人没有任何回复**

- 检查 `getWebhookInfo` 返回的 `last_error_message`，通常能直接看出问题
- 确认 `wrangler secret put` 那两步确实成功执行了（可以用 `npx wrangler secret list` 查看已设置的密钥名称，不会显示具体值）
- 确认 `wrangler.jsonc` 里的 KV `id` 已经替换成真实值，不是 `replace-with-your-kv-id`

**Worker 部署失败**

- 运行 `npm run check` 看是否有 TypeScript 类型错误
- 确认 `npx wrangler login` 已经成功授权

**收到"抱歉，你没有使用这个机器人的权限"**

- 说明配置了 `ALLOWED_USER_IDS` 白名单，但你的用户 id 不在列表里，去 `@userinfobot` 查一下自己的 id 再加进去

**AI 回复很慢或经常报错**

- 免费的 Workers AI 有每日额度限制（10000 Neurons/天），额度用尽后请求会失败，可以用 `/usage` 观察消耗速度
- 可以在 Cloudflare Dashboard 的 Workers AI 页面查看详细用量

**修改了 `wrangler.jsonc` 里的配置不生效**

- 记得重新运行 `npm run deploy` 才会把新配置发布上去

---

## 后续更新代码怎么部署

以后每次改完代码，只需要：

```bash
git pull
npm install
npm run deploy
```

不需要重新走一遍第 1 到第 10 步，KV 和 Secrets 都是持久化的，只有第一次部署需要完整配置。

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
