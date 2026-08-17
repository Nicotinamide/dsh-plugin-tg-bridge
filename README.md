# dsh-plugin-tg-bridge

DSH ↔ Telegram 遥控桥接，作为 Cordis profile 插件使用。

在 Telegram 里遥控 DSH agent：发消息触发任务、实时接收回复与工具进度、审批/提问变成可点按钮、切换会话、切换模型与推理强度、调整权限预设、查看 token 统计，甚至远程重启 DSH。自带持久化 GUI 卡片（插件配置页，双语）。

## 安装

**前置**：一台已运行 DSH（`dsh web`）的机器（本插件是 DSH 的 Cordis profile 插件，不是独立程序）。`$DSH_HOME` 默认 `~/.dsh`（即 `%USERPROFILE%\.dsh`）。

插件以**自包含单文件**发布：`dist/index.js` 已把插件本体和全部运行时依赖（schemastery 等）用 esbuild 打进一个文件，**安装时不需要在插件目录里跑 `npm install`**——`dsh plugin add` / 软链之后即可直接加载。这就是对 `ERR_MODULE_NOT_FOUND` 的根治：`dsh plugin add` 只做软链 + bundle 注册，不会安装插件自己的依赖，所以运行时依赖必须跟插件一起打包。

### 方式 1：`dsh plugin add`（推荐）

```bash
dsh plugin add <路径或URL>   # 例如克隆下来的本地目录，或
dsh plugin add https://github.com/Nicotinamide/dsh-plugin-tg-bridge.git
```

`dsh plugin add` 会在 `$DSH_HOME/profiles` 里 `pnpm add` 并自动注册 bundle 层；随后把插件行写进 profile 的 `cordis.patch.yml`（见「配置」）并重启 dsh web。

### 方式 2：手动软链（等价于 pnpm link）

```bash
# Linux / macOS
ln -s /path/to/dsh-plugin-tg-bridge $DSH_HOME/profiles/node_modules/dsh-plugin-tg-bridge
```

```powershell
# Windows（管理员 PowerShell；或直接改用方式 1）
New-Item -ItemType Junction -Path "$env:USERPROFILE\.dsh\profiles\node_modules\dsh-plugin-tg-bridge" -Target C:\path\to\dsh-plugin-tg-bridge
```

### 从源码开发

```bash
git clone https://github.com/Nicotinamide/dsh-plugin-tg-bridge.git
cd dsh-plugin-tg-bridge
npm install    # 只需开发依赖（esbuild、schemastery）
npm run build  # 改完 lib/ 后重新生成 dist/index.js（dist 已提交，普通安装无需构建）
```

### Windows 从零安装（新机器）

```powershell
# 0) 安装 Node.js LTS（https://nodejs.org）；国内加速建议先切镜像
npm config set registry https://registry.npmmirror.com
# 1) 全局安装 dsh（比 npx 快：npx 每次都要现场下载整套依赖树，主包虽只有 ~110KB）
npm install -g @deepseek-ai/dsh
dsh web        # 首次初始化 profile，确认能打开 Web 界面（端口以启动日志为准）
# 2) 把本插件 clone/拷贝到本机，按「方式 1 或 2」链接，写入 cordis.patch.yml，重启 dsh web
```

## 配置（二选一，env 优先）

### 方式 A：cordis.patch.yml（推荐日常使用）

在 `<profile>/cordis.patch.yml`（默认 `$DSH_HOME/profiles/web/cordis.patch.yml`）追加：

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
| `allowedChat` | `TG_ALLOWED_CHAT` | | — | 允许的 chat id（旧版单用户写法；配置了 allowedUsers 可留空） |
| `allowedUsers` | — | | `[]` | 多用户：`[{chatId, label?}]`，每个 chat id 拥有独立的会话空间；`label` 仅为可选备注（显示名默认取 Telegram 真实名称，无需配置） |
| `adminChatIds` | — | | `[]` | 管理员 chat id：可查看/操作所有用户的会话，可执行 `/restart` |
| `askerRequired` | — | | `true` | 提问/审批按钮只能由发起者本人点击，群组里其他人点击会被拒绝 |
| `tgApiBase` | `TG_API_BASE` | | `https://api.telegram.org` | Bot API 基址（被墙时换成自己的代理） |
| `pollTimeoutSeconds` | `TG_POLL_TIMEOUT_SECONDS` | | `25` | getUpdates 轮询超时；走代理建议 `2` |
| `dshBaseUrl` | `TG_DSH_BASE_URL` | | 自动检测 | DSH 客户端 API 基址；默认自动使用运行进程的实际端口（端口每次启动可能变化），显式配置（env/patch）优先 |
| `muxUrl` | `TG_MUX_URL` | | 自动检测 | DSH 事件流地址；同样默认随实际端口自动推导，显式配置优先 |
| `stateFile` | `TG_STATE_FILE` | | `$DSH_HOME/tg-bridge-state.json` | 状态持久化文件 |
| `turnTimeoutMs` | `TG_TURN_TIMEOUT_MS` | | `600000` | 回合超时提醒 |
| `tgTimeoutMs` | `TG_TG_TIMEOUT_MS` | | `30000` | Telegram API 超时 |
| `dshTimeoutMs` | `TG_DSH_TIMEOUT_MS` | | `15000` | DSH API 超时 |

## Telegram 命令

| 命令 | 作用 |
|---|---|
| `/start` | 在线检查 |
| `/sessions` | 列出所有会话（标题 + 状态 + 模式；管理员含 Web 端会话并标来源） |
| `/use <编号\|ID\|标题\|new>` | 切换 / 新建会话（标题关键字模糊匹配，多匹配列候选；`/use new` 先弹模式选择，创建即定模式） |
| `/models` | 列出模型 + 当前选择与推理强度 |
| `/model <编号>` | 切换当前会话模型（弹窗选择推理强度，不会静默丢失） |
| `/rename <新标题>` | 重命名当前会话（`session.rename`） |
| `/effort` | 按钮修改推理强度 |
| `/permission` | 按钮切换当前会话权限预设 |
| `/permission default <name>` | 修改全局默认权限 |
| `/status` | 在线状态、模型/模式、token、缓存、上下文占用、回合统计 |
| `/users` | 授权列表（仅管理员） |
| `/grant <chatId>` | 添加用户/群组（仅管理员；群里直接 `/grant` 授权当前群） |
| `/revoke <chatId>` | 移除授权（仅管理员） |
| `/admin [off] <chatId>` | 设置/取消管理员（仅管理员；设为管理员会自动授权） |
| `/restart` | 远程重启 DSH web（仅管理员；按启动参数自动重建命令，零配置；重启后自动汇报状态） |
| `/help` | 命令列表（按角色差异化：管理员看到全部命令，普通用户只看到日常命令） |

普通消息发给 agent；**引用回复**会把被引用的原消息一并带给 agent（`[引用回复]... [新消息]...`）。**全量双语**：TG 命令菜单（`/` 按钮，`setMyCommands` 的 `language_code` 变体）、`/help`、所有命令回复、按钮消息（审批/提问/模式/权限/推理强度）、错误与超时提示，都按用户语言（`from.language_code`，英文客户端显示英文、其余默认中文）自动切换。

agent 回复：文字即时转发、工具调用合并成单条实时进度（回合结束自动删除）、期间显示"正在输入…"、`approval/requested` 与 `question/requested` 变成可点按钮。按钮默认**只有发起者本人能点**：群组里其他人点击只会收到"⚠️ 只有提问者可以回答本题"提示，答案不会提交、状态不变（`askerRequired: false` 可关闭校验）。

## GUI（插件配置页）

包内自带持久 client 半部：设置 → 插件 → 插件配置 出现「Telegram 遥控 / Telegram Remote」双语卡片（跟随系统语言），可编辑 Bot Token（留空保持不变）、Allowed Users/Groups（每行一个 `chatId`，即授权用户/群组）、Admin Chat IDs（每行一个）、提问/审批按钮归属开关、Telegram API Base、Poll Timeout；保存即热重载，无需重启。重启后依然存在（无需重新激活）。注意：GUI 列表字段**留空保存不会清空**已有条目（与 token 的"留空不变"一致）——移除授权请在 TG 用 `/revoke`。

## 模块结构

```
dist/index.js     发布入口：esbuild 自包含打包（插件 + schemastery 等依赖内联，安装零依赖）
lib/index.js      插件入口源码：官方模板 + settings 命名空间 + /api/tg-bridge/config HTTP 端点（信任校验 + token 打码）
lib/bridge.js     核心：轮询队列 + mux 事件 + 按钮回传 + 会话/权限/模型命令 + 状态持久化 + 远程重启
lib/markdown.js   Markdown -> MarkdownV2 转换（表格/标题/代码/转义/回退）
lib/telegram.js   Telegram Bot API 客户端（可配置代理基址）
lib/client.js     持久 GUI 卡片（__ModuleLoader__ 格式，双语，重启不消失）
lib/settings-local.js  vendored：installSettingsSection/settingsNamespace（避免把 cordis 打进 bundle）
lib/home-local.js     vendored：dshHomePath（省掉 dsh-home-paths 依赖）
```

## 当前能力与演进方向

### 多用户（已实现）

一个 bot 服务多个 chat：`allowedUsers` 列出允许的 chat id（`label` 仅作显示），每个 chat 有自己独立的会话空间（`perUserSessions`）；管理员 `adminChatIds` 能看到/操作所有用户的会话。群组（chat id 为负）同样支持：只响应 @bot 提及或回复 bot 的消息，忽略 bot 自己的消息，群组整体绑定自己的会话空间。**群组为"只读 + 提问"白名单**：群里只能发普通消息提问、`/start`、`/status`、`/help`（精简版），其余命令一律提示「请私聊使用」——群成员无法改动群组共享会话的模型/权限/强度/标题。

### 按钮归属（已实现）

提问/审批按钮按 `chatId` + 消息 id 精确定位（避免不同 chat 消息 id 撞号）。默认 `askerRequired: true`：按钮只能由发起该轮的用户点击，群组里其他成员点击只会收到"只有提问者可以回答本题"提示，不提交答案、不改变状态。Web 端发起的轮次不产生按钮，因此有按钮必有归属人；若因升级/重启导致归属人丢失，私聊（单用户）信任点击者，群组拒绝。

### 授权管理（已实现）

第一个管理员在配置文件 `adminChatIds` 里指定；之后管理员可以全程在 TG 里管理授权，无需再改配置：

- `/users` 查看授权列表（管理员 🛡 / 普通用户 👤；显示名默认取 Telegram 真实名称——私聊 `@用户名`/名字、群组群名，无需手动维护）；
- `/grant <chatId>` 添加用户或群组；在群里直接 `/grant` 授权当前群；群组会自动记录群名作内部备注（会话标题/兜底显示用），显示名以 Telegram 实时名称为准；
- `/revoke <chatId>` 移除授权（不能移除自己或最后一个管理员，防止锁死）；
- `/admin [off] <chatId>` 设置/取消管理员（设为管理员会自动授权该 chat）。

未授权用户在私聊发 `/start` 会收到自己的 Chat ID，并提示发给管理员开通；其他未授权消息保持静默（日志记录）。`/help` 按角色差异化：管理员看到全部命令（含管理命令与 `/restart`），普通用户只看到日常命令；群组里 `/help` 只显示群组可用的精简列表。

授权数据写入 settings 命名空间（与 GUI 卡片同一来源），TG 命令与 GUI 保存互相同步；访问类变更（授权列表/管理员/按钮归属开关）只更新运行中的 bridge，不重建轮询器（无 409、不丢进行中的回合）。Token/API 地址/超时等核心字段变更才重建。

### 多 agent（已实现）

`agentPreset.list` 列出全部模式（标准模式 `standard` / PTC 模式 `code` / 极简模式 `minimal` / 创造模式 `cordis`，默认 `cordis`），**`/use new` 创建会话时弹模式选择**（创建即定模式，`session.create` 带 `agentPreset`）；`/sessions` 每行标注会话模式，`/rename` 用 `session.rename` 重命名当前会话。**模式名按语言显示**：英文用户看到模式 id（`standard`/`cordis`…），中文用户看到名称（标准模式/创造模式…）。

**限制**：DSH 规定**已开始过的会话模式固定**（`agent-preset-locked`），只能在空会话上切换——所以模式在 `/use new` 时一次选定。DSH 官方 API 也没有「删除会话」接口（apiproxy 无 `session.remove`），也没有会话分组/文件夹概念（`session.list` 无 group 字段，Web 端分组是前端 UI 行为）——TG 侧按「模式 + 来源（TG/Web）」维度展示分类。

## 平台兼容

- **Linux / macOS**：完整支持。`/restart` 用纯 Node 看门狗重启（不依赖 bash），日志重定向到当前 stdout 目标或 `$DSH_HOME/dsh-web.log`。
- **Windows 11**：核心功能（消息、按钮、会话、权限、模型、状态、GUI）可用。`/restart` 的看门狗同样是纯 Node（跨平台），但**依赖 dsh web 能从 `process.argv` 原样重建**——Windows 上请确认你的 dsh 启动方式支持；`loadavg()` 在 Windows 恒为 0（`/status` 负载显示 0，其余正常）。路径全部走 `$DSH_HOME`（`%USERPROFILE%\.dsh`），无硬编码绝对路径。

## 排障（踩过的坑）

1. **`ERR_MODULE_NOT_FOUND: @deepseek-ai/dsh-settings`（旧版）**：`dsh plugin add` / 软链只做链接和 bundle 注册，**不会安装插件自己的依赖**。v0.1.1 起运行时依赖全部打进 `dist/index.js`，安装不再需要 `npm install`；升级后确认链接的包是以 `dist/index.js` 为入口（`require('<包名>/package.json').main`）。
2. **409 Conflict / "terminated by other getUpdates request"**：同一 bot token 只能有一个轮询器。插件和独立脚本不能同时跑；也不要手工 curl getUpdates。日志里 `Conflict` 只在重启瞬间新旧进程重叠时出现一次，几秒后自愈。
3. **代理长轮询（timeout≥25）会 self-conflict**：如果走代理，用 `pollTimeoutSeconds: 2` 短轮询。
4. **`/restart` 不工作**：`/restart` 从当前进程的启动参数重建命令（`node <dsh-bin> ...`）拉起看门狗重启，零配置；若用非标准方式启动 dsh（如容器 supervisor），需自行确认进程能被该命令重建。
5. **`/permission` 报"权限服务不可用"**：host 未注入 `permissionPresets`/`sessions`（base 层已含，正常不会出现）。
6. **GUI 卡片不显示**：确认 `dsh.client` 声明和 `exports["./client"]` 存在，重启 dsh web 后 client-modules 自动扫描加载。
