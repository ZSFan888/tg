# tg-cf-ai-bot

一个纯私聊模式的 Telegram AI 机器人骨架：

- Cloudflare Workers
- grammY
- Hono
- Workers AI（默认免费模型 `@cf/meta/llama-3.2-1b-instruct`）
- 流式回复（打字机效果，边生成边显示）
- Cloudflare KV 持久化聊天上下文
- 用户级白名单
- 简单限流
- 用户级回复风格设置（默认 / 极简 / 专业 / 幽默 / 自定义）
- 每日使用量统计

## 已实现功能

- `/start`：欢迎消息 + 按钮菜单
- `/help`：帮助说明
- `/chat`：提示进入聊天模式
- `/settings`：切换回复风格（按钮式菜单，选择后立即生效并持久化）
- `/setprompt`：设置完全自定义的系统提示词
- `/usage`：查看今日 AI 调用次数
- `/clear`：清空当前聊天上下文
- `/model`：查看当前模型
- `/ping`：健康检查
- 文本消息自动调用 Workers AI，按用户存最近几轮上下文，并套用该用户当前选择的回复风格
- **流式回复**：AI 生成过程中机器人会持续编辑同一条消息，模拟打字机效果，而不是等全部生成完才发送
- 可选 `ALLOWED_USER_IDS` 白名单，只允许指定用户使用
- AI 调用失败时会返回友好提示，不会让请求裸奔报错

这个版本只处理私聊，没有任何群管理相关命令或逻辑。

## 流式回复实现原理

Workers AI 支持 `stream: true` 参数，返回一个 SSE（Server-Sent Events）格式的 `ReadableStream`。机器人读取这个流，每收到一段文字增量就拼接到已有文本上，并通过节流（默认 1.4 秒一次）调用 Telegram 的 `editMessageText` 更新同一条消息，生成完成后做最后一次强制编辑去掉打字光标。

节流是必须的：Telegram 对同一条消息的编辑频率有限制，过于频繁的 `editMessageText` 调用会被限流或报错。`src/utils/throttle.ts` 实现了一个简单的节流器，`EDIT_INTERVAL_MS`（在 `messages.ts` 里）控制编辑间隔，可以按需调整——数值越小打字机效果越流畅，但越容易触发 Telegram 限流。

如果 Workers AI 某个模型不支持流式返回（返回的不是 `ReadableStream`），代码会自动降级为一次性返回完整文本，不会报错。

## 回复风格

在 `/settings` 里可以在预设风格和自定义提示词之间切换：

| 风格 | 说明 |
|---|---|
| 默认助手 | 简洁友好，中文优先 |
| 极简模式 | 1-2 句话内给结论 |
| 专业模式 | 结构化、分点、避免口语化 |
| 幽默模式 | 轻松语气 + 恰当比喻 |
| 自定义模式 | 用户通过 `/setprompt` 输入完全自定义的系统提示词 |

预设风格定义在 `src/config/personas.ts`，自定义提示词按用户 id 存进 KV，长期生效（90 天）。

### 自定义提示词工作原理

1. 用户发送 `/setprompt` 或点击"自定义模式"按钮
2. 机器人进入"等待输入"状态（存进 KV，5 分钟过期）
3. 用户发送任意文字，机器人识别到这是待处理的自定义提示词，保存并确认
4. 之后所有对话都会套用这个自定义提示词，直到用户切换到其他预设风格

## 使用统计

`/usage` 或点击"使用统计"按钮会显示当天已调用 AI 的次数，数据按用户 id + 日期存储，每天自动重置。这个功能主要用于自己观察使用量，避免超出 Workers AI 每天 10000 Neurons 的免费额度。

## 目录

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

## 1. 创建 Bot

在 Telegram 找 `@BotFather`：

1. `/newbot`
2. 记录 Bot Token

## 2. 安装依赖

```bash
npm install
```

## 3. 创建 KV

```bash
npx wrangler kv namespace create BOT_KV
```

把返回的 id 写入 `wrangler.jsonc` 的 `kv_namespaces[0].id`。

## 4. 配置环境变量

```bash
cp .dev.vars.example .dev.vars
```

填入：

- `BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`

在 `wrangler.jsonc` 里可选补：

- `ALLOWED_USER_IDS`：逗号分隔的 Telegram 用户 id，只允许这些人私聊使用；留空则任何人都能用
- `RATE_LIMIT_PER_MINUTE`：每分钟每个用户最多多少次 AI 请求
- `MAX_HISTORY`：保留的对话轮数

## 5. 本地开发

```bash
npm run dev
```

## 6. 部署

```bash
npm run deploy
```

部署后注册 webhook：

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<your-worker-domain>/telegram/webhook",
    "secret_token": "<YOUR_TELEGRAM_WEBHOOK_SECRET>"
  }'
```

## 7. 下一步建议

- 加语音消息转文字支持
- 加图片理解（如果切换到支持多模态的模型）
- 加导出对话记录功能
- 加管理员专属命令查看全局使用量汇总
