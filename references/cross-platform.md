# 跨平台：为什么是「一份实现 + 各平台薄壳」

> 这份文件回答「为什么长这样」。具体某个平台的坑看 `macos-launcher.md` / `windows-launcher.md`。

## 一、两条路的对比

需求：一套脚本原来按 macOS 写（bash），现在要支持 Windows。

| 方案 | 结果 |
|---|---|
| 把每个 bash 脚本翻译成 PowerShell，两套并存 | ✗ 逻辑写两遍，改一处漏一处，**行为必然漂移** |
| **一份实现 + 各平台薄壳** | ✓ 只有一个真源 |

选后者的决定性理由通常不是「架构优雅」，而是**这套东西本来就依赖某个运行时**：

- 服务本身是 Python 写的（或装在 venv 里）→ 用 Python 写启动器**零新增依赖**，还白得 Linux；
- 服务是 Node 写的、要 `npm install` → 用 Node 写启动器同理。

**判据**：真源语言 = 这个工具已经依赖的那个运行时。不要为了写启动器引入新语言。

```
run.command ─┐                        ┌─→ start / stop / restart / status
run.ps1 ─────┼→ scripts/launcher.py ──┼─→ doctor / menu …
run.cmd  ────┘     （唯一真源）        └─→ （无参数 = 交互菜单）
```

壳只干三件事：**找到解释器 → 把参数转过去 → 双击时收尾**。

## 二、平台差异对照表

| 维度 | POSIX（macOS/Linux） | Windows | 实现要点 |
|---|---|---|---|
| venv 可执行文件 | `venv/bin/{python,pip}` | `venv\Scripts\{python.exe,pip.exe}` | 别写死 `bin/` |
| 起独立后台进程 | `start_new_session=True` | `DETACHED_PROCESS \| CREATE_NEW_PROCESS_GROUP \| CREATE_NO_WINDOW` | 不加 flag，终端一关进程就死 |
| 结束进程 | `SIGTERM` → 等 2s → `SIGKILL` | `taskkill /PID n /T /F`（`/T` 收子进程） | Windows 没有 SIGTERM 语义 |
| 进程存活探测 | `os.kill(pid,0)` + 排僵尸 | `OpenProcess` + `GetExitCodeProcess == 259` | **见 `process-management.md` §1、§2** |
| 端口 → 进程 | `lsof -nP -iTCP:N -sTCP:LISTEN -Fpc` | `netstat -ano` + `tasklist` 取名 | 要拿进程名做误杀守卫 |
| 文件权限收紧 | `os.chmod(f, 0o600)` | 跳过（Windows 用 ACL，chmod 无意义） | 不加 `if` 会报错 |
| 打开浏览器 | `open` / `xdg-open` | `os.startfile` | 首选 `webbrowser` 模块 |
| 找外部命令 | `shutil.which` | `shutil.which("npm.cmd")` | Windows 上是 `.cmd`/`.exe` |
| PATH 分隔符 | `:` | `;` | 一律用 `os.pathsep` |
| 控制台编码 | 本来就是 UTF-8 | 默认 GBK → `SetConsoleOutputCP(65001)` | **见 `windows-launcher.md`** |
| 双击入口 | `.command` | `.cmd` 垫片调 `.ps1` | `.ps1` 双击 = 开记事本 |

所有「取进程名 / 查端口」的代码都该**可失败**：拿不到名字时保守跳过，不猜。

## 三、为什么不用别的方案

- **WSL / Git Bash**：要求用户先装一层，且 Windows 原生路径、注册表、GUI 又穿不回去，反而更复杂。
- **纯 POSIX shell 脚本 + 让用户装 WSL**：同上。
- **把逻辑写成两处但用代码生成**：多一层构建，脚本工具通常不值得。
- **Go/Rust 编译二进制**：确实一个文件跨三平台，但要工具链、要为每个平台出产物，
  对「一个 Python 服务 + 几个管理动作」严重过重。

## 四、怎么加一个新动作

1. `launcher.py` 里写 `def do_xxx() -> int`（返回 0/非 0，**别在函数里 `sys.exit`**——
   菜单要连着跑好几轮）。
2. `main()` 里注册两处：`sub.add_parser("xxx", help="…")` 和 `if a == "xxx": return do_xxx()`。
3. 想进双击菜单，加进 `MENU` 列表（`("9", "说明", lambda: do_xxx())`）。
4. 需要的话在 `scripts/` 加同名 `.sh` 薄壳（照抄 `templates/thin-sh.sh`，三行）。
5. 更新 SKILL.md / README.md 的清单。

## 五、Windows 侧怎么验（没有 Windows 机器时）

`taskkill` / `OpenProcess` / `netstat` 解析 / `venv\Scripts` 布局这些改的都是**标准库的既定行为**，
逻辑上等价，但首次在真机上跑时先走一遍：

```powershell
.\run.ps1 doctor     # 先看平台/解释器/依赖/端口探测是否正常
.\run.ps1 status
.\run.ps1 start
```

`doctor` 值得专门写：它把「平台 / 解释器 / venv / 外部命令 / 端口占用 / 入口文件存在性」
一次性体检出来，是跨平台问题最快的第一现场。
