---
name: iskill-script-launcher
description: 写给用户「双击就能跑」的跨平台脚本（macOS .command / Windows .ps1+.cmd），以及配套的启停、进程探活、端口占用、退出关窗等启动器能力。当用户要做一个带图形菜单/后台服务的脚本工具、要把 bash 脚本移植到 Windows、或遇到「双击没反应」「中文乱码」「stop 报已停止但进程还在」「退出后窗口死在 [Process completed]」「关窗弹确认框」时使用。
---

# iskill-script-launcher

写一个**给用户双击运行**的跨平台脚本工具。覆盖启动器骨架、启停与进程管理、
以及三个平台上「双击场景」特有的坑。

## 一、先决定架构：不要写两套

> 详细论证见 `references/cross-platform.md`

**默认答案：一份 Python 实现（纯 stdlib）+ 各平台薄壳。**

```
run.command ─┐
run.ps1 ─────┼→ scripts/launcher.py ──→ 所有动作
run.cmd  ────┘   （唯一真源）           （无参数 = 交互菜单）
```

壳只做三件事：**找到 Python → 把参数转过去 → 双击时收尾**。

判定什么时候该换架构：

| 这个脚本本身依赖什么 | 选型 |
|---|---|
| 依赖 Python（venv / 用 Python 写的服务） | **Python 真源**（零新增依赖，白得 Linux） |
| 依赖 Node（要 npm install / 构建前端） | Node 真源，`.command`/`.cmd` 转 `node scripts/x.mjs` |
| 纯提示词、无脚本 | 不需要启动器 |

**绝不把 bash 逻辑翻译成第二份 PowerShell** —— 逻辑写两遍必然漂移。

## 二、五个必须先定下来的约定

1. **退出码 10 = 用户主动退出菜单**。Python 只用它表达意图，**自己绝不关窗**——它不该知道宿主是谁。
2. **壳负责关窗**，且必须先判「是不是双击打开的」（`references/macos-launcher.md`）。判不了就**不关**。
3. **无参数且是 tty → 交互菜单；有参数 → 直接执行动作**，不要在带参数时停下来等回车（会卡住调用方）。
4. **运行时数据放家目录**（`~/.<skill名>/`），技能仓库只放代码和文档——否则 `git commit` 会带上会变的东西。
5. **GUI 行为必须落日志**。关窗、开浏览器这类动作在 agent 沙箱里**根本无法验证**（osascript 直接被 TCC 拦），没有日志就只能靠用户口头描述猜。

## 三、症状 → 查哪个文件

> 路由键用**症状**，不用知识点——agent 手里只有症状。

| 你看到的症状 | 读 |
|---|---|
| 双击没反应 / 打开了记事本 | `references/windows-launcher.md` |
| 中文注释或输出乱码 | `references/windows-launcher.md` |
| 退出后窗口死在 `[Process completed]`、不能输入 | `references/macos-launcher.md` |
| 关窗时弹「关闭窗口将终止正在运行的进程」确认框 | `references/macos-launcher.md` |
| `osascript rc=0` 但窗口没关 | `references/macos-launcher.md` |
| 「已停止」但进程还在跑 | `references/process-management.md` |
| stop 误杀了别人的进程 | `references/process-management.md` |
| 后台进程随终端一起死 / 起不来 | `references/process-management.md` |
| 要不要把 bash 翻译成 PowerShell | `references/cross-platform.md` |
| 双开抢同一浏览器会话 / 断言全绿但读到别人页面 | `references/process-management.md` |

## 四、落地步骤

1. `cp -R templates/ <你的技能目录>/`，按文件里的 `⚠️ 改这里` 注释改（主要是脚本名、菜单项、日志目录）。
2. 在 `launcher.py` 里写 `def do_xxx() -> int`（返回 0/非 0，**别在函数里 `sys.exit`**）。
3. 注册：`sub.add_parser("xxx")` + `if a == "xxx": return do_xxx()`；要进菜单就加进 `MENU`。
4. 需要的话在 `scripts/` 加同名 `.sh` 薄壳（三行，照抄 `templates/thin-sh.sh`）。
5. 验：`doctor` → `status` → 菜单：`printf '0\n' | launcher.py menu`（应 rc=10）。
   ⚠️ 测菜单要显式用 `menu` 子命令 —— 无参数只在 **tty** 下进菜单，管道输入时会打印 help。
   **真实服务在跑时别停它**，用临时运行时 + 未占用端口做隔离测试（脚本见 `references/process-management.md` §7）。

## 五、三条硬约束

- **关窗与「留个可用 shell 兜底」互斥**。Terminal 只在窗口空闲时静默关闭；
  你要是留了个活的 shell 兜底，它必然弹确认框。要静默就必须 **先 `exit`，再让后台 osascript 关**。
- **`osascript rc=0` ≠ 窗口真的关了**。把 `close` 包在 `try…end try` 里会吞掉错误、
  退出码仍是 0。关窗动作**不要**用 try 吞错，并让 AppleScript `return` 状态串写进日志。
- **按端口兜底清理必须先验进程名**。同一个端口上可能是别人的程序；
  名字取不到时**保守跳过**——宁可漏清，也不错杀。

## 依赖同步

本仓库 `promo-page/assets/{app.js,style.css,icons.js}` 是 [iskill-promo-page](https://github.com/aispin/iskill-promo-page)
模板引擎的 vendored 副本（锁定版本见 `package.json` 的 `iskillDeps`），**不要手改**——
去真源仓库改并升 `@iskill-version`，再用 iskill-dep-sync 同步回来。本机未装该工具时，先安装：对 agent 说「请帮我安装 Skill：aispin/iskill-dep-sync」，或按下方自举命令现场拉取：

```bash
T="$HOME/.workbuddy/skills/iskill-dep-sync/scripts/skill-deps.mjs"
[ -f "$T" ] || { TMP="$(mktemp -d)"; curl -fsSL "https://raw.githubusercontent.com/aispin/iskill-dep-sync/HEAD/scripts/skill-deps.mjs" -o "$TMP/skill-deps.mjs"; T="$TMP/skill-deps.mjs"; }
node "$T" check "$(pwd)"     # 漂移检测；node "$T" sync "$(pwd)" 恢复/升级；node "$T" env "$(pwd)" 冷启动自检
```
