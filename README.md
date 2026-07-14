# tg-cf-ai-bot

一个纯私聊模式的 Telegram AI 机器人骨架：

- Cloudflare Workers
- grammY
- Hono
- Workers AI（默认免费模型 `@cf/meta/llama-3.2-1b-instruct`）
- Cloudflare KV 持久化聊天上下文
- 用户级白名单
- 简单限流

## 已实现功能

- `/start`：欢迎消息 + 菜单按钮
- `/help`：帮助说明
- `/chat`：提示进入聊天模式
- `/clear`：清空当前聊天上下文
- `/model`：查看当前模型
- `/ping`：健康检查
- 文本消息自动调用 Workers AI，并按用户存最近几轮上下文
- 可选 `ALLOWED_USER_IDS` 白名单，只允许指定用户使用

这个版本只处理私聊，没有任何群管理相关命令或逻辑。

## 目录

```txt
src/
  bot/
    context.ts
    create-bot.ts
  handlers/
    callbacks.ts
    commands.ts
    messages.ts
  services/
    ai.ts
  storage/
    chat-store.ts
    rate-limit.ts
  types/
    env.ts
  utils/
    access.ts
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

- 用 conversations 插件做多步表单（比如收集用户偏好）
- 按用户角色路由不同模型
- 加使用统计和配额管理
- 加语音消息转文字支持
