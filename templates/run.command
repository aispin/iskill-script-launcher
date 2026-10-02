#!/usr/bin/env bash
# ⚠️ 改这里：脚本名 · macOS 双击入口（.command）
#
# 在 Finder 里双击本文件即可（.command 会被「终端」打开并执行）。
# 无参数 = 交互菜单；也可以 ./run.command status 这样用，参数原样透传。
#
# 为什么这么薄：真正的逻辑全在 scripts/launcher.py（一份跨平台代码），
# 本文件只负责「找到 python + 转参数 + 收尾」。
#
# 收尾判定的每一步都写日志：~/.<技能名>/logs/launcher.log
# （关窗依赖 osascript，可能被系统权限拦下；没有日志就只能靠猜。）

# ⚠️ 改这里：技能名（决定日志目录）
SKILL_NAME="iskill-xxx"

cd "$(dirname "$0")" || exit 1
here="$(pwd)"
me="$(basename "$0")"
LOGDIR="${HOME}/.${SKILL_NAME}/logs"
mkdir -p "$LOGDIR" 2>/dev/null
LAUNCH_LOG="${LOGDIR}/launcher.log"
launch_log() { printf '%s %s\n' "$(date '+%F %T')" "$*" >>"$LAUNCH_LOG" 2>/dev/null; }

# ── 场景判定：双击打开 还是 用户在自己 shell 里手动跑的？─────────────
# 三条证据，任一命中即 direct：
#   a) 父进程 = login（Terminal 双击 .command 时的包装进程）/ 终端 App 本身
#   b) 父 shell 的命令行里含本脚本名（shell 被专门拉来跑本脚本）
#   c) 父 shell 刚被拉起（存活 < 90s）—— 双击新建的窗口就是这个形态
# 父进程是「与脚本无关的老 shell」→ manual（退出后提示符自然回来，绝不动窗口）
# 三条都判不了 → unknown（既不冒险关窗，也不留死窗口，换成交互 shell）
classify_open() {
  local ppid pcomm pcmd petime mm
  ppid="$(ps -o ppid= -p $$ 2>/dev/null | tr -d ' ')"
  if [ -z "$ppid" ]; then launch_log "classify: ps 取不到 ppid → unknown"; echo "unknown"; return; fi
  pcomm="$(ps -o comm= -p "$ppid" 2>/dev/null)"; pcomm="${pcomm##*/}"
  pcmd="$(ps -o command= -p "$ppid" 2>/dev/null)"
  petime="$(ps -o etime= -p "$ppid" 2>/dev/null | tr -d ' ')"
  launch_log "classify: ppid=$ppid pcomm=[$pcomm] etime=[$petime] pcmd=[$pcmd]"
  case "$pcomm" in
    login|Terminal|iTerm|iTerm2|Warp|WezTerm|kitty|Alacritty|ghostty)
      launch_log "classify: 命中终端 App/包装进程 → direct"; echo "direct"; return ;;
  esac
  case "$pcomm" in
    zsh|bash|sh|fish|dash|-zsh|-bash)
      case "$pcmd" in
        *"$me"*) launch_log "classify: 父 shell 命令行含脚本名 → direct"; echo "direct"; return ;;
      esac
      # etime 形态：SS / MM:SS / HH:MM:SS / DD-HH:MM:SS
      case "$petime" in
        *-*|*:*:*) launch_log "classify: 父 shell 已存在较久[$petime] → manual"; echo "manual"; return ;;
        *:*)
          mm="${petime%%:*}"
          if [ "$((10#$mm))" -lt 2 ] 2>/dev/null; then
            launch_log "classify: 父 shell 很新[$petime] → direct"; echo "direct"
          else
            launch_log "classify: 父 shell 已存在[$petime] → manual"; echo "manual"
          fi; return ;;
        *)
          if [ "$petime" -lt 90 ] 2>/dev/null; then
            launch_log "classify: 父 shell 很新[${petime}s] → direct"; echo "direct"
          else
            launch_log "classify: 父 shell 已存在[${petime}s] → manual"; echo "manual"
          fi; return ;;
      esac ;;
  esac
  launch_log "classify: 父进程形态陌生 → unknown"; echo "unknown"
}

# 关掉本脚本所在的那个标签页（按 tty 精确定位）；若终端里已没有别的窗口，连 App 一起退。
#
# ⚠️ 三条硬约束（都是真机踩出来的）：
#   1. osascript 必须后台 + 延迟：此刻 bash 自身还占着窗口，同步 close/quit 会弹
#      「关闭窗口将终止正在运行的进程」确认框。
#   2. close t（标签）在 Terminal 上不总是生效 → 命中后先试 close t，失败再 close w（窗口）。
#   3. 不要把 close 包在 try…end try 里 —— 那会吞掉错误、退出码仍是 0，
#      于是「rc=0 却什么都没关」，无从定位。让 AppleScript return 状态串写进日志。
close_terminal_window() {
  local my_tty short script out
  my_tty="$(tty 2>/dev/null || true)"
  [ -n "$my_tty" ] || my_tty="/dev/$(ps -o tty= -p $$ 2>/dev/null | tr -d ' ')"
  short="${my_tty##*/}"
  launch_log "close: my_tty=[$my_tty] short=[$short] TERM_PROGRAM=[${TERM_PROGRAM:-}]"

  case "${TERM_PROGRAM:-}" in
    iTerm.app)
      ( sleep 0.3
        out=$(/usr/bin/osascript -e 'tell application "iTerm2"
            if (count of windows) <= 1 then
              quit
            else
              close current window
            end if
          end tell' 2>>"$LAUNCH_LOG")
        launch_log "close: iTerm osascript rc=$? out=[$out]" ) >/dev/null 2>&1 &
      return ;;
  esac

  script="
tell application \"Terminal\"
    set myTTY to \"$short\"
    set allTTYs to {}
    set didClose to false
    set nWin to count of windows
    repeat with w in windows
        if didClose then exit repeat
        set hit to false
        repeat with t in tabs of w
            set tt to (tty of t) as string
            set end of allTTYs to tt
            if (tt is myTTY) or (tt is \"/dev/\" & myTTY) then
                set hit to true
                try
                    close t
                    set didClose to true
                end try
                exit repeat
            end if
        end repeat
        if hit and not didClose then
            close w
            set didClose to true
        end if
    end repeat
    if nWin <= 1 then quit
    return \"didClose=\" & didClose & \" nWin=\" & nWin & \" ttys=\" & (allTTYs as string)
end tell"
  ( sleep 0.3
    out=$(/usr/bin/osascript -e "$script" 2>>"$LAUNCH_LOG")
    launch_log "close: Terminal osascript rc=$? out=[$out] myTTY=[$short]" ) >/dev/null 2>&1 &
}

PY="${ISKILL_PYTHON:-}"
if [ -z "$PY" ] || [ ! -x "$PY" ]; then
  PY="$(command -v python3 || command -v python)"
fi
if [ -z "$PY" ]; then
  echo "找不到 Python 3 —— 装一个（brew install python3，或 python.org 安装包）后重试。"
  echo
  printf "按回车键关闭窗口…"
  read -r _
  exit 1
fi

# ⚠️ 改这里：若你的真源不叫 scripts/launcher.py，改这一行
"$PY" "$here/scripts/launcher.py" "$@"
rc=$?
launch_log "run: $me $* → rc=$rc"

# ── 收尾 ────────────────────────────────────────────────────
# rc=10 = 用户在菜单里选了退出（launcher.py 只表达意图，关不关窗由本壳决定）。
#
# ⚠️ 关键顺序：先 exit，再让后台 osascript 关窗，中间隔 ~0.3s。
#    绝不能在这里 exec 一个交互 shell —— 那会让窗口里留下活动进程，
#    Terminal 关窗时就会弹「关闭窗口将终止正在运行的进程」确认框（真机实测）。
#    「不留死窗口」的兜底只用在 unknown 分支（那里没有 osascript 参与）。
if [ "$rc" -eq 10 ] && [ "$#" -eq 0 ] && [ -t 0 ]; then
  case "$(classify_open)" in
    direct)
      close_terminal_window
      exit 0
      ;;
    manual)
      # 用户自己的 shell：直接退出，提示符自然回来，绝不动窗口
      exit $rc
      ;;
    *)
      echo ""
      exec "${SHELL:-/bin/zsh}"
      ;;
  esac
fi

if [ "$#" -eq 0 ] && [ -t 0 ]; then
  echo
  printf "按回车键关闭窗口…"
  read -r _ || true
  case "$(classify_open)" in
    direct) close_terminal_window; exit $rc ;;
  esac
fi
exit $rc
