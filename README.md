# iskill-script-launcher

> 落地页：<https://aispin.github.io/iskill-script-launcher/> · 仓库：<https://github.com/aispin/iskill-script-launcher>

把「给用户双击运行的跨平台脚本」这件事的方法论与可抄骨架固化下来：
**一份 Python 实现 + 各平台薄壳**，macOS 双击 `.command`、Windows 双击 `.cmd`、Linux 敲 `.sh`。

这套经验来自 `iskill-headroom-workbuddy` 的跨平台改造 —— 那次把 6 个 bash 脚本重写成
一份 Python，并在 macOS 关窗这件事上真机返工了四轮。**每一次根因都推翻了上一轮的假设**，
所以这里每条坑都按「症状 → 根因 → 修法」记，而不是「要这样做」。

---

## 30 秒上手

```bash
# 1) 把骨架抄进你的技能目录
cp -R ~/.workbuddy/skills/iskill-script-launcher/templates/ ./my-scripts/
mv my-scripts/run.command my-scripts/run.ps1 my-scripts/run.cmd <技能根目录>/
mkdir -p <技能根目录>/scripts && mv my-scripts/launcher.py <技能根目录>/scripts/

# 2) 改各处 ⚠️ 改这里（grep 一下就有）
#    launcher.py : SKILL / PORT_MAIN / looks_like_ours() / MENU / 真正要起的命令
#    run.command : SKILL_NAME / scripts/launcher.py 路径
#    run.ps1     : scripts\launcher.py 路径

# 3) 跑
chmod +x run.command
./run.command doctor          # 环境体检
./run.command                 # 交互菜单
./run.command start           # 或直接执行动作
```

Windows 上双击 **`run.cmd`**（不是 `run.ps1` —— 双击 `.ps1` 默认打开记事本）。

---

## 目录结构

```
iskill-script-launcher/
├── SKILL.md                      # 给 agent 看：触发条件 + 决策树 + 症状路由表
├── README.md                     # 本文件（给人看）
├── references/
│   ├── cross-platform.md         # 为什么是「一份实现 + 薄壳」；平台差异对照表
│   ├── macos-launcher.md         # .command 双击、场景判定、退出关窗（四轮返工的结论）
│   ├── windows-launcher.md       # .ps1 + .cmd、UTF-8 BOM、控制台编码、找 Python
│   └── process-management.md     # 探活 / 结束 / 端口 / 误杀守卫 / 会话隔离
└── templates/
    ├── launcher.py               # 唯一真源（纯 stdlib，可直接跑）
    ├── run.command               # macOS 双击入口（含场景判定与关窗）
    ├── run.ps1                   # Windows 入口（带 UTF-8 BOM）
    ├── run.cmd                   # Windows 双击垫片（全 ASCII）
    └── thin-sh.sh                # 可选：scripts/*.sh 兼容薄壳
```

## 四件套

| 文件 | 平台 | 作用 | 要点 |
|---|---|---|---|
| `scripts/launcher.py` | 全平台 | **唯一真源**，所有逻辑在这 | 纯标准库；动作函数返回 `int`，别在函数里 `sys.exit` |
| `run.command` | macOS | 双击入口 | 找 Python → 转参数 → **收尾判场景并关窗** |
| `run.ps1` | Windows | PowerShell 入口 | **必须带 UTF-8 BOM**；双击是记事本，需 `.cmd` 调起 |
| `run.cmd` | Windows | **双击垫片** | 全 ASCII；`-ExecutionPolicy Bypass` 不能省 |
| `scripts/*.sh` | macOS/Linux | 可选兼容薄壳 | 三行，只做转发，**不要在 bash 里实现逻辑** |

## 三个约定（违反会埋雷）

1. **退出码 10 = 用户主动退出菜单**。Python 只表达意图，**自己绝不关窗** —— 它不该知道宿主是谁。
2. **关窗由壳决定，且必须先判是不是双击打开的**。判不了就**不关**（宁可留着，也别干掉用户的 shell）。
3. **GUI 行为必须落日志**。关窗、开浏览器在 agent 沙箱里**根本无法验证**（`osascript` 直接被 TCC 拦，
   TCC 数据库也读不了），没有日志就只能靠用户口头描述猜。日志落 `~/.<技能名>/logs/launcher.log`。

## 平台差异速查

| 维度 | POSIX | Windows |
|---|---|---|
| venv 可执行文件 | `venv/bin/python` | `venv\Scripts\python.exe` |
| 起独立进程 | `start_new_session=True` | `DETACHED_PROCESS \| CREATE_NEW_PROCESS_GROUP \| CREATE_NO_WINDOW` |
| 结束进程 | `SIGTERM` → 2s → `SIGKILL` | `taskkill /PID n /T /F` |
| **存活探测** | `os.kill(pid,0)` + 排僵尸 | `OpenProcess` + `GetExitCodeProcess == 259` |
| 端口 → 进程 | `lsof -nP -Fpc` | `netstat -ano` + `tasklist` |
| 控制台编码 | 本来 UTF-8 | `SetConsoleOutputCP(65001)` |
| 双击入口 | `.command` | `.cmd` → `.ps1` |

完整对照见 `references/cross-platform.md`。

## 已收录的坑（按症状查）

| 症状 | 出处 |
|---|---|
| 退出后窗口死在 `[Process completed]`、不能输入 | `macos-launcher.md` §1 |
| `osascript rc=0` 但窗口没关 | `macos-launcher.md` §2 |
| 关窗时弹「关闭窗口将终止正在运行的进程」 | `macos-launcher.md` §3 |
| 关错了窗口（用户已切到别的窗口） | `macos-launcher.md` §4 |
| 双击 `.ps1` 打开记事本 | `windows-launcher.md` §1 |
| `.ps1` 中文注释乱码 | `windows-launcher.md` §2 |
| 控制台输出中文乱码 | `windows-launcher.md` §3 |
| `stop` 杀了不该杀的进程 | `process-management.md` §1、§4 |
| 「已停止」但进程还在跑 | `process-management.md` §2 |
| `ps` 报 `operation not permitted` | `process-management.md` §3 |
| 后台进程随终端一起死 | `process-management.md` §5 |
| 两个实例并发跑，读到对方的状态 | `process-management.md` §6 |

## 三条硬约束

- **关窗与「留个可用 shell 兜底」互斥**。Terminal 只在窗口空闲时静默关闭；留了活的 shell
  必然弹确认框。要静默就必须 **先 `exit`，再让后台 osascript 关**（隔 ~0.3s）。
- **`osascript rc=0` ≠ 窗口真的关了**。把 `close` 包在 `try…end try` 里会吞掉错误、退出码仍是 0。
  关窗动作别用 try 吞错，并让 AppleScript `return` 状态串写进日志。
- **按端口兜底清理必须先验进程名**。同端口可能是别人的程序；名字取不到时**保守跳过** ——
  宁可漏清，也不错杀。

## 与 iskill-headroom-workbuddy 的关系

那里是这套经验的**第一现场**（`references/cross-platform.md` 保留完整记录并反向指向本技能）。
两者不是重复：那边是**某个具体技能**的实现说明，这边是**可复用的方法论 + 骨架**。
新增的通用结论以本技能为真源。

## 许可

MIT

> 依赖同步：本仓库含 iskill 共享真源的 vendored 副本（清单见 `package.json` 的 `iskillDeps`），**不要手改**。使用前请同时安装 iskill-utils：对 agent 说「请帮我安装 Skill：aispin/iskill-utils」；用法见 SKILL.md「依赖同步」节。
