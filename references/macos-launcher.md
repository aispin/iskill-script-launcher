# macOS 启动器：`.command` 双击、场景判定、退出关窗

> 每节按「症状 → 根因 → 修法」写。这一篇的四条坑都是真机上**四轮返工**换来的，
> 而且每一次根因都推翻了上一轮的假设 —— 不要凭推理改，先看日志。

## 0. 为什么要先落日志（最重要的一条）

**GUI 行为（关窗、开浏览器）在 agent 沙箱里根本无法验证** —— `osascript` 会被 TCC 直接拦：

```
osascript -e 'tell application "Terminal" …'
→ Terminal got an error: A privilege violation occurred. (-10004)
```

TCC 数据库（~/Library/Application Support/com.apple.TCC/TCC.db）也读不了（`authorization denied`，SIP 保护），
所以连「用户机器上有没有授权」都查不到。

→ **实现里必须内置可回读的日志**，否则只能靠用户口头描述猜。至少记这些：
`ppid` / 父进程名 / `etime` / 父进程命令行 / 判定结果 / osascript 的 **rc 与 stderr / return 状态串**。

```bash
LOGDIR="${HOME}/.<技能名>/logs"; mkdir -p "$LOGDIR"
LAUNCH_LOG="${LOGDIR}/launcher.log"
launch_log() { printf '%s %s\n' "$(date '+%F %T')" "$*" >>"$LAUNCH_LOG" 2>/dev/null; }
```

⚠️ 一个反直觉但很有用的技巧：**沙箱里被拦的是 AppleEvent，不是编译**。
所以 `printf '%s\n' "$script" | osascript` 仍可用来验证 AppleScript 语法
（报权限错 = 语法 OK；报 `-2741` = 语法错）。

---

## 1. 症状：退出后窗口死在 `[Process completed]`，什么都输不了

**根因（真机实锤）**：双击 `.command` 时，脚本的父进程是 Terminal 的 **`login` 包装进程**，
不是 `Terminal` 本身。判定白名单里漏了 `login` → 误判成「用户手动运行」→ 走了「等一个回车」
的老路径 → shell 退出 → 窗口留在 `[Process completed]`。

顺带一个背景事实：**Terminal 的「shell 退出时」是按 profile 存的，不是全局键**。

```bash
defaults read com.apple.Terminal ShellExitAction   # ← 读不到，这个键不存在
# 真实位置：Window Settings.<profile>.shellExitAction
#   0 = 不关 / 1 = 干净退出才关 / 2 = 总是关
```

用户默认 profile 常常**没设**（= 不关窗），这就是死窗口的直接来源。但**不要去改用户的全局偏好**——
那是他的终端，改了会影响他所有窗口。

**修法**：三分判定 `classify_open()`，任一命中即 `direct`：

| 证据 | 说明 |
|---|---|
| a) 父进程是 `login` / 终端 App 本身 | Terminal 双击 `.command` 走 `login`；iTerm/Warp/WezTerm/kitty 等直接是 App |
| b) 父 shell 的命令行里含本脚本名 | shell 被专门拉起来跑本脚本 |
| c) 父 shell `etime` 很新（< 90s，或 < 2min） | 双击新建的窗口就是这个形态 |

- 父进程是**与脚本无关的老 shell** → `manual`（直接退出，提示符自然回来，**绝不动窗口**）
- 三条都判不了 → `unknown`（不冒险关窗，也不留死窗口）

```bash
ppid="$(ps -o ppid= -p $$ 2>/dev/null | tr -d ' ')"
pcomm="$(ps -o comm= -p "$ppid" 2>/dev/null)"; pcomm="${pcomm##*/}"
pcmd="$(ps -o command= -p "$ppid" 2>/dev/null)"
petime="$(ps -o etime= -p "$ppid" 2>/dev/null | tr -d ' ')"
```

注意 `etime` 有四种形态：`SS` / `MM:SS` / `HH:MM:SS` / `DD-HH:MM:SS`，解析要都覆盖。

---

## 2. 症状：`osascript rc=0`，窗口却没关

**根因**：把 `close t` 包在 `try … end try` 里 —— AppleScript 报错被吞掉，**退出码仍然是 0**。
于是出现「判定对 + rc=0 + 窗口没关」这种完全无法自证的状态。

**修法**：

1. 关窗动作**不要**用 try 吞错；
2. 命中 tty 后 **`close w`（关窗口）**，不是 `close t`（关标签）—— `close t` 在 Terminal 上并不总是生效；
   稳妥策略：先试 `close t`（多标签窗口更礼貌），失败再 `close w`，只剩一个窗口时 `quit`；
3. tty 比较**同时兼容 `ttys001` 和 `/dev/ttys001`** 两种形态；
4. 让 AppleScript `return` 状态串，连同 rc 一起写进日志：

```applescript
return "didClose=" & didClose & " nWin=" & nWin & " ttys=" & (allTTYs as string)
```

日志里出现 `didClose=true` 就是真关了；`didClose=false` 就该去看 `ttys=` 里自己的 tty 是不是没匹配上。

---

## 3. 症状：关窗时弹「关闭窗口将终止正在运行的进程」，要再点一次

**根因**：为了「关不掉也不留死窗口」，在关窗前 `exec "${SHELL}"` 留了个交互 shell 兜底。
**`exec` 出来的 shell 是活动进程** → Terminal 判定窗口里有正在运行的进程 → 弹确认框。

**修法（关键就一个词：`exit` 而不是 `exec`）**：

```bash
close_terminal_window   # 内部是 ( sleep 0.3; osascript … ) &
exit 0                  # ← 让本 shell 先死，窗口变空闲
```

顺序必须是 **exit → 隔 ~0.3s → 后台 osascript 关窗**，全程静默。

⚠️ **这条是硬约束，不是权衡**：
「留个可用 shell 兜底」与「静默关窗」**互斥** —— 兜底必然让窗口保持有活动进程，必然弹框。
兜底只保留在 `unknown` 分支（那条路没有 osascript 参与，exec 不会引发确认框）。

---

## 4. 症状：关错了窗口（用户在别的窗口操作，结果那个被关了）

**根因**：用了 `close front window`。用户双击后可能已经切到别的窗口，"front" 就不是我们这个了。

**修法**：按 **tty 精确定位**——`tty` 命令拿自己的 tty，AppleScript 遍历 windows/tabs 匹配 `tty of t`，
只关命中的那个；只剩一个标签时再 `quit` 整个 App。

```bash
my_tty="$(tty 2>/dev/null || true)"
[ -n "$my_tty" ] || my_tty="/dev/$(ps -o tty= -p $$ 2>/dev/null | tr -d ' ')"
short="${my_tty##*/}"
```

---

## 5. 完整收尾模板

```bash
"$PY" "$here/scripts/launcher.py" "$@"
rc=$?

if [ "$rc" -eq 10 ] && [ "$#" -eq 0 ] && [ -t 0 ]; then   # 10 = 菜单里选了退出
  case "$(classify_open)" in
    direct)  close_terminal_window; exit 0 ;;   # 先 exit，osascript 后台 0.3s 后关
    manual)  exit $rc ;;                        # 用户自己的 shell：绝不动窗口
    *)       echo ""; exec "${SHELL:-/bin/zsh}" ;;  # 判不了：留可用 shell，不留死窗口
  esac
fi

if [ "$#" -eq 0 ] && [ -t 0 ]; then             # 非退出路径（报错等）
  echo; printf "按回车键关闭窗口…"; read -r _ || true
  case "$(classify_open)" in
    direct) close_terminal_window; exit $rc ;;
  esac
fi
exit $rc
```

两个易错点：

- 条件里的 `[ -t 0 ]` 不能少 —— **带参数调用（脚本化）时不要等回车**，否则会卡住调用方。
- `manual` 分支连回车都不用等，直接退出，提示符自然回来。

---

## 6. Windows 不用判父进程

双击 `.cmd` 起的窗口，脚本一结束 cmd 自己就关；在已有 PowerShell 里跑 `.\run.ps1` 只是返回提示符
—— **窗口生命周期天然分得开**。所以 Windows 侧只要菜单退出时**跳过 `Read-Host`** 即可
（那个「按回车键关闭」正是挡住自动关闭的原因）。

---

## 7. 测试污染教训（写测试时要防）

用 `bash -c '…'` 内联测「父 shell 命令行是否含脚本名」时，**测试命令文本本身含脚本名**
→ 父进程 cmdline 命中 → 假 `direct`。

干净测法：把函数与变量写进**独立文件**，调用命令的文本里不出现脚本名字面量。
另外用 `sed` 只抽取函数会丢掉它依赖的变量（如 `me`），空 pattern 会匹配一切。
