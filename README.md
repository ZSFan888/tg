# tg-cf-ai-bot

一个纯私聊模式的 Telegram AI 机器人，基于 Cloudflare Workers + grammY + Workers AI 构建，支持流式回复、用户级人格设置、自定义提示词和使用量统计。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ZSFan888/tg)

点击上面的按钮即可一键部署，不需要在本地安装任何工具、不需要用命令行。跟着「一键部署」章节的引导走完，几分钟就能拿到一个能用的机器人。

---

## 方式一：一键部署（推荐，几分钟搞定）

### 你需要先准备一样东西：Bot Token

1. 在 Telegram 里搜索并打开 **@BotFather**
2. 发送 `/newbot`，按提示输入机器人显示名称和 username（username 必须以 `bot` 结尾）
3. 创建成功后会收到一段文本，里面有一行：
   ```
   Use this token to access the HTTP API:
   123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
   把这一整行数字+字母的 token **复制保存**，后面要填。

### 点击部署按钮

点击本文顶部的 **Deploy to Cloudflare** 按钮，会跳转到 Cloudflare 的部署页面：

1. 如果还没登录，先登录/注册 Cloudflare 账号（免费）
2. 授权 Cloudflare 读取你的 GitHub 账号（用于把这个项目 fork 一份到你自己的账号下）
3. 页面会展示一个配置表单，一共 8 个字段，逐个说明如下：

| 字段名 | 要不要改 | 具体填什么 |
|---|---|---|
| `BOT_TOKEN` | **必填** | 粘贴从 @BotFather 拿到的 Token，格式类似 `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TELEGRAM_WEBHOOK_SECRET` | **必填** | 随便输入一段随机字符串（比如 `myBot2026SecretKey888`），自己记住即可，20 位以上更安全，注册 webhook 时要再用一次 |
| `BOT_WEBHOOK_PATH` | 不用改 | 保持默认的 `/telegram/webhook` |
| `ALLOWED_USER_IDS` | **可以留空** | 这是白名单，留空表示任何人都能私聊这个机器人；如果只想自己/特定人用，去 Telegram 找 `@userinfobot` 查用户 id，填进来，多个用英文逗号分隔，例如 `123456789,987654321` |
| `AI_MODEL` | 不用改 | 保持默认的 `@cf/meta/llama-3.2-1b-instruct`（免费模型） |
| `SYSTEM_PROMPT` | 不用改 | 保持默认的中文助手人设即可，之后可以在机器人里用 `/settings` 按用户单独切换风格 |
| `MAX_HISTORY` | 不用改 | 保持默认值 `8`，表示记住最近 8 轮对话 |
| `RATE_LIMIT_PER_MINUTE` | 不用改 | 保持默认值 `12`，表示每个用户每分钟最多问 12 次 |

简单说：**只需要填好 `BOT_TOKEN` 和 `TELEGRAM_WEBHOOK_SECRET` 这两项，其他保持默认或留空即可**。

4. 点击 **Deploy**

Cloudflare 会自动：
- 把代码 fork 到你的 GitHub 账号
- 自动创建并绑定 KV 数据库（不需要你手动操作）
- 自动绑定 Workers AI
- 构建并发布 Worker

几分钟后，部署完成页面会显示你的 Worker 网址，类似：

```
https://tg-cf-ai-bot.你的子域名.workers.dev
```

**把这个网址完整复制下来**，下一步要用。

### 最后一步：注册 Webhook

一键部署会把代码跑起来，但还需要告诉 Telegram「有新消息时把消息推给这个网址」，这一步没办法在部署页面自动完成，需要手动发一次请求。

浏览器无法直接发送这种请求，最简单的办法是用手机或电脑上的一个在线工具，或者用电脑终端跑一条命令：

```bash
curl -X POST "https://api.telegram.org/bot<你的BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<你的Worker网址>/telegram/webhook",
    "secret_token": "<你刚才填的TELEGRAM_WEBHOOK_SECRET>"
  }'
```

举个例子（假设 token 是 `123456789:AAExxxx`，Worker 网址是 `tg-cf-ai-bot.zsfan.workers.dev`，密钥是 `myBot2026SecretKey888`）：

```bash
curl -X POST "https://api.telegram.org/bot123456789:AAExxxx/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://tg-cf-ai-bot.zsfan.workers.dev/telegram/webhook",
    "secret_token": "myBot2026SecretKey888"
  }'
```

**没有电脑终端也能做**：把上面这条 curl 命令换成任意在线 HTTP 请求工具（比如手机浏览器打开 [reqbin.com](https://reqbin.com)），方法选 POST，URL 填 `https://api.telegram.org/bot你的token/setWebhook`，Body 填 JSON：

```json
{
  "url": "https://你的Worker网址/telegram/webhook",
  "secret_token": "你的密钥"
}
```

点击发送，看到返回 `{"ok":true,"result":true,"description":"Webhook was set"}` 就说明成功了。

### 测试

打开 Telegram，搜索你创建的机器人 username，发送 `/start`，看到欢迎消息就说明全部配置成功。

---

## 方式二：本地命令行部署（适合想改代码、做二次开发的人）

如果你想在本地跑代码、调试、自己改功能，用这种方式。

### 准备

- Cloudflare 账号
- Telegram Bot Token（同上）
- 本地安装 Node.js 18+

### 第 1 步：获取代码

```bash
git clone https://github.com/ZSFan888/tg.git
cd tg
```

### 第 2 步：安装依赖

```bash
npm install
```

### 第 3 步：登录 Cloudflare

```bash
npx wrangler login
```

### 第 4 步：创建 KV 数据库

```bash
npx wrangler kv namespace create BOT_KV
```

执行后会输出一段 JSON，把里面的 `id` 值复制下来，填进 `wrangler.jsonc` 的：

```jsonc
"kv_namespaces": [
  {
    "binding": "BOT_KV",
    "id": "auto-provisioned-on-deploy"
  }
],
```

把 `"auto-provisioned-on-deploy"` 替换成真实 id。

### 第 5 步：生成 Webhook 密钥

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

复制输出的字符串，保存好。

### 第 6 步：配置生产环境密钥

```bash
npx wrangler secret put BOT_TOKEN
```

粘贴 Bot Token，回车。

```bash
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

粘贴第 5 步生成的密钥，回车。

### 第 7 步（可选）：本地开发测试

```bash
cp .dev.vars.example .dev.vars
```

编辑 `.dev.vars`，填入 `BOT_TOKEN` 和 `TELEGRAM_WEBHOOK_SECRET`，然后运行：

```bash
npm run dev
```

### 第 8 步：部署

```bash
npm run deploy
```

部署成功后会输出 Worker 网址，复制下来。

### 第 9 步：注册 Webhook

参考「方式一」的「最后一步：注册 Webhook」部分，用你的 Bot Token、Worker 网址和密钥替换对应内容。

### 后续更新代码

```bash
git pull
npm install
npm run deploy
```

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

部署完成后，可以在 Cloudflare Dashboard 里找到你的 Worker → Settings → Variables，或者直接改本地 `wrangler.jsonc` 的 `vars` 部分：

- `ALLOWED_USER_IDS`：只想让特定人用？填入 Telegram 用户 id，多个用逗号分隔（例如 `"123456789,987654321"`），留空则任何人都能私聊使用。查自己的用户 id 可以找 Telegram 里的 `@userinfobot`。
- `MAX_HISTORY`：机器人记住最近几轮对话，默认 8。
- `RATE_LIMIT_PER_MINUTE`：每个用户每分钟最多能请求几次 AI，默认 12。

改完之后如果是一键部署的项目，去 Cloudflare Dashboard 里改完 Variables 点 Deploy 即可生效；如果是本地部署，改完 `wrangler.jsonc` 后重新 `npm run deploy`。

---

## 常见问题排查

**机器人没有任何回复**

- 检查 webhook 是否注册成功：访问 `https://api.telegram.org/bot<你的token>/getWebhookInfo`，看 `last_error_message` 字段有没有报错
- 确认 Cloudflare Dashboard 里 Worker 的 Secrets 已经正确设置了 `BOT_TOKEN` 和 `TELEGRAM_WEBHOOK_SECRET`
- 确认 KV 数据库已经正确绑定（Worker 详情页 → Settings → Bindings 能看到）

**一键部署页面报错或卡住**

- 确认你点击部署按钮时用的是自己的 GitHub 账号，且这个仓库是 public
- 如果提示 GitHub 授权失败，去 [github.com/settings/applications](https://github.com/settings/applications) 检查是否有 Cloudflare 相关的授权，重新授权一次

**收到"抱歉，你没有使用这个机器人的权限"**

- 说明配置了 `ALLOWED_USER_IDS` 白名单，但你的用户 id 不在列表里，去 `@userinfobot` 查一下自己的 id 再加进去

**AI 回复很慢或经常报错**

- 免费的 Workers AI 有每日额度限制（10000 Neurons/天），额度用尽后请求会失败，可以用 `/usage` 观察消耗速度
- 可以在 Cloudflare Dashboard 的 Workers AI 页面查看详细用量

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
