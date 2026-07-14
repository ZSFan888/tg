# tg-cf-ai-bot

一个持续迭代的 Telegram 机器人骨架：

- Cloudflare Workers
- grammY
- Hono
- Workers AI（默认免费模型 `@cf/meta/llama-3.2-1b-instruct`）
- Cloudflare KV 持久化聊天上下文
- 群聊 mention 控制 + 基础限流
- 白名单 chat id 控制
- 群管理命令：警告 / 禁言 / 移出 / 解封 / 踢出

## 已实现功能

### 通用命令

- `/start`：欢迎消息 + 菜单按钮
- `/help`：帮助说明
- `/chat`：提示进入聊天模式
- `/clear`：清空当前聊天上下文
- `/model`：查看当前模型
- `/ping`：健康检查
- 文本消息自动调用 Workers AI，并按 chat 存最近几轮上下文

### 群管理命令（需回复目标用户的消息）

- `/warn`：警告用户，达到 `MAX_WARNINGS` 自动移出群组
- `/unwarn`：清空某用户警告记录
- `/warnings`：查看警告次数
- `/mute [时长]`：禁言，支持 `10m` / `2h` / `1d` 这种格式，默认 10 分钟
- `/unmute`：解除禁言
- `/ban`：移出群组（永久，除非 `/unban`）
- `/unban`：解封
- `/kick`：踢出但允许再次加入

权限判定：满足以下任一条件即可执行管理命令——

1. 用户是这个 Telegram 群的管理员/群主（通过 `getChatMember` 判断）
2. 用户 id 在 `ADMIN_USER_IDS` 环境变量白名单里

## 目录

```txt
src/
  bot/
    context.ts
    create-bot.ts
  handlers/
    admin.ts
    callbacks.ts
    commands.ts
    messages.ts
  services/
    ai.ts
  storage/
    chat-store.ts
    rate-limit.ts
    warn-store.ts
  types/
    env.ts
  utils/
    access.ts
    telegram.ts
    telegram-admin.ts
  index.ts
```

## 1. 创建 Bot

在 Telegram 找 `@BotFather`：

1. `/newbot`
2. 记录 Bot Token
3. 设置机器人 username
4. 把机器人加入群组，并在群设置里把它设为管理员，勾选“限制成员”和“封禁用户”权限，否则群管理命令会失败

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

然后在 `wrangler.jsonc` 里补：

- `BOT_USERNAME`：机器人用户名，不带 `@`
- `ALLOWED_CHAT_IDS`：可选，逗号分隔
- `ADMIN_USER_IDS`：可选，逗号分隔的 Telegram 用户 id，拥有跨群管理权限
- `MAX_WARNINGS`：警告上限，默认 3
- `GROUP_MENTION_REQUIRED`：群内是否必须 @ 机器人才响应 AI 聊天
- `RATE_LIMIT_PER_MINUTE`：每分钟每个 chat 最多多少次 AI 请求

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

- 用 conversations 插件做多步表单（比如入群审核问答）
- 加操作日志频道，管理动作自动同步
- 加定时任务（Cron Triggers）做每日清理/统计
- 把 AI 模型改成按场景路由（聊天用小模型，摘要用大模型）
