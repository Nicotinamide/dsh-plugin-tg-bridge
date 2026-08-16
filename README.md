# dsh-plugin-tg-bridge

DSH ↔ Telegram 遥控桥接，作为 Cordis profile 插件使用。

在 Telegram 里遥控 DSH agent：发消息触发任务、实时接收回复与工具进度、审批/提问变成可点按钮、切换会话、切换模型与推理强度、调整权限预设、查看 token 统计，甚至远程重启 DSH。自带持久化 GUI 卡片（插件配置页，双语）。

## 安装

把本包放进目标机器的 profile 并注册一行：

```bash
# 1. 拷贝/软链到 profile 的 node_modules（等价于 pnpm add）
ln -s /path/to/dsh-plugin-tg-bridge /root/.dsh/profiles/node_modules/dsh-plugin-tg-bridge
```

## 配置（二选一，env 优先）

### 方式 A：cordis.patch.yml（推荐日常使用）

在 `/root/.dsh/profiles/web/cordis.patch.yml` 追加：

```yaml
- insert:
    - id: tg-bridge
      name: 'dsh-plugin-tg-bridge'
      config:
        botToken: '<你的BOT_TOKEN>'        # @BotFather 创建 bot 后获取
        allowedChat: '<你的CHAT_ID>'       # 和 bot 私聊后 @userinfobot 可查
        tgApiBase: 'https://api.telegram.org' # 默认官方；被墙时换成自己的代理
        pollTimeoutSeconds: 25                # 官方长轮询 25 正常；走代理建议 2
```

### 方式 B：环境变量（token 不进文件，适合分享/部署）

```bash
export TG_BOT_TOKEN='<你的BOT_TOKEN>'
export TG_ALLOWED_CHAT='<你的CHAT_ID>'
export TG_API_BASE='https://api.telegram.org'   # 被墙时换成自己的代理
export TG_POLL_TIMEOUT_SECONDS=25               # 走代理建议 2
dsh web   # 或你的启动脚本
```

**优先级：环境变量 > settings 用户层 > patch 配置 > 默认值。**

## 配置项

| 字段 | 环境变量 | 必填 | 默认 | 说明 |
|------|----------|------|------|------|
| `botToken` | `TG_BOT_TOKEN` | ✅ | — | Telegram bot token（@BotFather） |
| `allowedChat` | `TG_ALLOWED_CHAT` | ✅ | — | 允许的 chat id，其他一律忽略 |
| `tgApiBase` | `TG_API_BASE` | | `https://api.telegram.org` | Bot API 基址（被墙时换成自己的代理） |
| `pollTimeoutSeconds` | `TG_POLL_TIMEOUT_SECONDS` | | `25` | getUpdates 轮询超时；走代理建议 `2` |
| `dshBaseUrl` | `TG_DSH_BASE_URL` | | `http://127.0.0.1:3080` | DSH 客户端 API 基址（bridge 与 DSH 同机时勿改） |
| `muxUrl` | `TG_MUX_URL` | | `ws://127.0.0.1:3080/api/events.mux` | DSH 事件流 |
| `stateFile` | `TG_STATE_FILE` | | `$DSH_HOME/tg-bridge-state.json` | 状态持久化文件 |
| `turnTimeoutMs` | `TG_TURN_TIMEOUT_MS` | | `600000` | 回合超时提醒 |
| `tgTimeoutMs` | `TG_TG_TIMEOUT_MS` | | `30000` | Telegram API 超时 |
| `dshTimeoutMs` | `TG_DSH_TIMEOUT_MS` | | `15000` | DSH API 超时 |

## Telegram 命令

| 命令 | 作用 |
|---|---|
| `/start` | 在线检查 |
| `/sessions` | 列出所有会话（标题 + 状态） |
| `/use <编号\|ID\|new>` | 切换 / 新建会话 |
| `/models` | 列出模型 + 当前选择与推理强度 |
| `/model <编号>` | 切换当前会话模型（保留推理强度） |
| `/effort` | 按钮修改推理强度 |
| `/permission` | 按钮切换当前会话权限预设 |
| `/permission default <name>` | 修改全局默认权限 |
| `/status` | 在线状态、token、缓存、上下文占用、回合统计 |
| `/restart` | 远程重启 DSH web（按启动参数自动重建命令，零配置；重启后自动汇报状态） |
| `/help` | 命令列表 |

普通消息发给 agent；**引用回复**会把被引用的原消息一并带给 agent（`[引用回复]... [新消息]...`）。

agent 回复：文字即时转发、工具调用合并成单条实时进度（回合结束自动删除）、期间显示"正在输入…"、`approval/requested` 与 `question/requested` 变成可点按钮。

## GUI（插件配置页）

包内自带持久 client 半部：设置 → 插件 → 插件配置 出现「Telegram 遥控 / Telegram Remote」双语卡片（跟随系统语言），可编辑 Bot Token（留空保持不变）、Allowed Chat ID、Telegram API Base、Poll Timeout；保存即热重载，无需重启。重启后依然存在（无需重新激活）。

## 模块结构

```
lib/index.js     插件入口：官方模板 + settings 命名空间 + /api/tg-bridge/config HTTP 端点（信任校验 + token 打码）
lib/bridge.js    核心：轮询队列 + mux 事件 + 按钮回传 + 会话/权限/模型命令 + 状态持久化 + 远程重启
lib/markdown.js  Markdown -> MarkdownV2 转换（表格/标题/代码/转义/回退）
lib/telegram.js  Telegram Bot API 客户端（可配置代理基址）
lib/client.js    持久 GUI 卡片（__ModuleLoader__ 格式，双语，重启不消失）
```

## 排障（踩过的坑）

1. **409 Conflict / "terminated by other getUpdates request"**：同一 bot token 只能有一个轮询器。插件和独立脚本不能同时跑；也不要手工 curl getUpdates。日志里 `Conflict` 只在重启瞬间新旧进程重叠时出现一次，几秒后自愈。
2. **代理长轮询（timeout≥25）会 self-conflict**：如果走代理，用 `pollTimeoutSeconds: 2` 短轮询。
3. **`/restart` 不工作**：`/restart` 从当前进程的启动参数重建命令（`node /usr/local/bin/dsh ...`）拉起看门狗重启，零配置；若用非标准方式启动 dsh（如容器 supervisor），需自行确认进程能被该命令重建。
4. **`/permission` 报"权限服务不可用"**：host 未注入 `permissionPresets`/`sessions`（base 层已含，正常不会出现）。
5. **GUI 卡片不显示**：确认 `dsh.client` 声明和 `exports["./client"]` 存在，重启 dsh web 后 client-modules 自动扫描加载。
