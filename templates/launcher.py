#!/usr/bin/env python3
"""⚠️ 改这里：脚本名 · 跨平台启动器（唯一真源，纯标准库）

macOS/Linux 走 .command / .sh 薄壳，Windows 走 .ps1 / .cmd 垫片 —— 四者都只做
「找到 Python → 转参数 → 收尾」，**所有逻辑都在本文件**。

⚠️ 改这里：下面这些常量（技能名、运行时目录、端口、进程名前缀、菜单项）。

用法：
    launcher.py                  # 无参数 + tty = 交互菜单
    launcher.py start|stop|restart|status|doctor
"""

from __future__ import annotations

import argparse
import ctypes
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

# ── ⚠️ 改这里：全局常量 ─────────────────────────────────────────
SKILL = "iskill-xxx"                  # 技能名（用于日志目录与提示）
IS_WINDOWS = os.name == "nt"
HERE = Path(__file__).resolve().parent.parent          # 技能根目录
RUNTIME = Path(os.environ.get("ISKILL_RUNTIME") or (Path.home() / f".{SKILL}"))
LOGS = RUNTIME / "logs"
PIDS = RUNTIME / "pids.json"
PORT_MAIN = int(os.environ.get("PORT") or 8801)        # 主服务端口
EXIT_MENU_QUIT = 10                                     # 约定：用户主动退出菜单

IS_WINDOWS = os.name == "nt"


def _init_console() -> None:
    """Windows 控制台默认 GBK(936) → 改 65001。POSIX 上无需处理。"""
    if not IS_WINDOWS:
        return
    try:
        k32 = ctypes.windll.kernel32
        k32.SetConsoleOutputCP(65001)
        k32.SetConsoleCP(65001)
    except Exception:
        pass
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


# ── 输出 ────────────────────────────────────────────────────────
def log(msg: str) -> None:
    print(msg)


def info(msg: str) -> None:
    print(f"  · {msg}")


def ok(msg: str) -> None:
    print(f"  ✓ {msg}")


def bad(msg: str) -> None:
    print(f"  ✗ {msg}")


# ── 进程管理（两平台语义不同，别用 os.kill 探活）─────────────────
def pid_alive(pid: int) -> bool:
    """进程是否还活着。Windows 上 os.kill(pid,0) 会真的杀掉进程，绝不能用。"""
    if not pid or pid <= 0:
        return False
    if IS_WINDOWS:
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        STILL_ACTIVE = 259
        try:
            k32 = ctypes.windll.kernel32
            h = k32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, int(pid))
            if not h:
                return False
            code = ctypes.c_ulong()
            got = k32.GetExitCodeProcess(h, ctypes.byref(code))
            k32.CloseHandle(h)
            return bool(got) and code.value == STILL_ACTIVE
        except Exception:
            return False
    # POSIX：先收尸（未 reap 的僵尸会让 os.kill 误判为活）
    try:
        wpid, _ = os.waitpid(pid, os.WNOHANG)
        if wpid == pid:
            return False
    except ChildProcessError:
        pass            # 不是自己的子进程（守护进程重启后的常态）
    except OSError:
        pass
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return not _ps_state(pid).upper().startswith("Z")


def _ps_state(pid: int) -> str:
    """僵尸判定。ps 在沙箱里可能不可用，取不到就当不是僵尸。"""
    try:
        out = subprocess.run(
            ["ps", "-o", "state=", "-p", str(pid)],
            capture_output=True, text=True, timeout=5,
        )
        return (out.stdout or "").strip()
    except Exception:
        return ""


def looks_like_ours(name: str) -> bool:
    """⚠️ 改这里：改成你的进程名前缀。名字取不到时必须返回 False（宁可漏清也不错杀）。"""
    n = (name or "").lower()
    return n.startswith("python") or n.startswith(SKILL)


def port_owners(port: int) -> list[tuple[int, str]]:
    """端口 → [(pid, 进程名)]。优先 lsof（ps 在沙箱里常不可用）。"""
    owners: list[tuple[int, str]] = []
    if not IS_WINDOWS:
        lsof = "/usr/sbin/lsof" if os.path.exists("/usr/sbin/lsof") else "lsof"
        try:
            out = subprocess.run(
                [lsof, "-nP", "-Fpc", f"-iTCP:{port}", "-sTCP:LISTEN"],
                capture_output=True, text=True, timeout=8,
            )
            pid = None
            for line in (out.stdout or "").splitlines():
                if line.startswith("p"):
                    pid = int(line[1:])
                elif line.startswith("c") and pid:
                    owners.append((pid, line[1:]))
                    pid = None
        except Exception:
            pass
    else:
        try:
            out = subprocess.run(["netstat", "-ano"], capture_output=True, text=True, timeout=8)
            for line in (out.stdout or "").splitlines():
                if f":{port} " in line and "LISTENING" in line.upper():
                    pid = int(line.split()[-1])
                    owners.append((pid, _win_name(pid)))
        except Exception:
            pass
    return owners


def _win_name(pid: int) -> str:
    try:
        out = subprocess.run(["tasklist", "/FI", f"PID eq {pid}", "/NH"],
                             capture_output=True, text=True, timeout=8)
        return (out.stdout or "").split()[0] if out.stdout else ""
    except Exception:
        return ""


def start_process(cmd: list[str], cwd: Path, logfile: Path) -> int:
    """脱离父进程启动（否则终端一关它就跟死）。"""
    LOGS.mkdir(parents=True, exist_ok=True)
    with open(logfile, "ab", buffering=0) as fh:
        kwargs = dict(stdin=subprocess.DEVNULL, stdout=fh, stderr=subprocess.STDOUT,
                      cwd=str(cwd))
        if IS_WINDOWS:
            kwargs["creationflags"] = (subprocess.DETACHED_PROCESS
                                       | subprocess.CREATE_NEW_PROCESS_GROUP
                                       | subprocess.CREATE_NO_WINDOW)
        else:
            kwargs["start_new_session"] = True
        p = subprocess.Popen(cmd, **kwargs)
    return p.pid


def kill_pid(pid: int, tree: bool = True) -> bool:
    if IS_WINDOWS:
        args = ["taskkill", "/PID", str(pid), "/F"] + (["/T"] if tree else [])
        try:
            return subprocess.run(args, capture_output=True, timeout=10).returncode == 0
        except Exception:
            return False
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.kill(pid, sig)
        except OSError:
            return True
        for _ in range(20):          # 最多等 2s
            if not pid_alive(pid):
                return True
            time.sleep(0.1)
    return not pid_alive(pid)


def write_pids(**kw: int) -> None:
    RUNTIME.mkdir(parents=True, exist_ok=True)
    PIDS.write_text(json.dumps({k: v for k, v in kw.items() if v}), encoding="utf-8")


def read_pids() -> dict:
    try:
        return json.loads(PIDS.read_text(encoding="utf-8"))
    except Exception:
        return {}


def open_url(url: str) -> None:
    try:
        import webbrowser
        webbrowser.open(url)
    except Exception:
        pass


# ── 动作：每个都返回 0/非 0，不要在这里 sys.exit（菜单要连跑）──────
def do_start(open_browser: bool = True) -> int:
    _init_console()
    LOGS.mkdir(parents=True, exist_ok=True)
    pids = read_pids()

    info("启动主服务…")
    if pids.get("main") and pid_alive(int(pids["main"])):
        ok(f"主服务已在运行（PID {pids['main']}）")
    else:
        # ⚠️ 改这里：换成你真正要起的命令
        pid = start_process([sys.executable, "-c", "import time; time.sleep(3600)"],
                            HERE, LOGS / "main.log")
        pids["main"] = pid
        write_pids(**pids)
        ok(f"主服务已启动（PID {pid}）")

    log(f"""
══════════════════════════════════════════════════════════
 {SKILL} 已启动
──────────────────────────────────────────────────────────
 主服务     : http://127.0.0.1:{PORT_MAIN}/
 看状态     : {launcher_hint("status")}
 日志       : {LOGS}
 停止       : {launcher_hint("stop")}
════════════════════════════════════════════════════════""")
    if open_browser:
        open_url(f"http://127.0.0.1:{PORT_MAIN}/")
    return 0


def do_stop(quiet: bool = False) -> int:
    pids = read_pids()
    killed = False
    for key, pid in list(pids.items()):
        pid = int(pid)
        if pid_alive(pid) and kill_pid(pid):
            killed = True
            if not quiet:
                ok(f"已停止 {key}（PID {pid}）")
    # 按端口兜底：⚠️ 必须先验进程名，宁可漏清也不错杀
    for pid, name in port_owners(PORT_MAIN):
        if not looks_like_ours(name):
            log(f"  端口 {PORT_MAIN} 被 PID {pid}（{name or '名字未知'}）占用，不像本服务，跳过")
            continue
        if kill_pid(pid):
            killed = True
    if PIDS.exists():
        PIDS.unlink()
    if not quiet:
        ok("已停止" if killed else "本来就没在跑")
    return 0


def do_restart() -> int:
    do_stop(quiet=True)
    return do_start()


def do_status() -> int:
    pids = read_pids()
    if not pids:
        log("未运行")
        return 1
    for key, pid in pids.items():
        pid = int(pid)
        log(f"  {key:<10} PID {pid:<8} {'运行中' if pid_alive(pid) else '已停止'}")
    return 0


def do_doctor() -> int:
    log(f"平台      : {sys.platform}（Windows={IS_WINDOWS}）")
    log(f"Python    : {sys.executable}  {sys.version.split()[0]}")
    log(f"运行时    : {RUNTIME}（存在={RUNTIME.exists()}）")
    log(f"日志      : {LOGS}（存在={LOGS.exists()}）")
    owners = port_owners(PORT_MAIN)
    log(f"端口 {PORT_MAIN} : {'空闲' if not owners else owners}")
    for entry in ("run.command", "run.cmd", "run.ps1"):
        log(f"入口 {entry:<12}: {'有' if (HERE / entry).exists() else '无'}")
    return 0


def launcher_hint(action: str = "") -> str:
    """提示里给「双击/命令行怎么调」，按平台给正确写法。"""
    base = "run.cmd" if IS_WINDOWS else "./run.command"
    return f"{base} {action}".strip()


MENU = [
    ("1", "启动服务", lambda: do_start()),
    ("2", "停止服务", lambda: do_stop()),
    ("3", "重启服务", lambda: do_restart()),
    ("4", "查看状态", lambda: do_status()),
    ("5", "环境体检", lambda: do_doctor()),
]


def do_menu() -> int:
    while True:
        print(f"\n════ {SKILL} ════")
        for key, label, _ in MENU:
            print(f"  {key}. {label}")
        print("  0. 退出")
        try:
            choice = input("  请选择: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return EXIT_MENU_QUIT
        if choice in ("0", "q", "Q", ""):
            return EXIT_MENU_QUIT          # ← 只表达意图，关窗交给壳
        for key, label, fn in MENU:
            if choice == key:
                print()
                fn()
                break
        else:
            bad("没有这个选项")


def main() -> int:
    _init_console()
    ap = argparse.ArgumentParser(prog=SKILL)
    sub = ap.add_subparsers(dest="action")

    p_start = sub.add_parser("start", help="启动")
    p_start.add_argument("--no-open", action="store_true", help="不自动开浏览器")
    sub.add_parser("stop", help="停止")
    sub.add_parser("restart", help="重启")
    sub.add_parser("status", help="状态")
    sub.add_parser("doctor", help="环境体检")
    sub.add_parser("menu", help="交互菜单（非 tty 时也能跑，便于测试）")

    args = ap.parse_args()
    a = args.action

    if a == "start":
        return do_start(open_browser=not args.no_open)
    if a == "stop":
        return do_stop()
    if a == "restart":
        return do_restart()
    if a == "status":
        return do_status()
    if a == "doctor":
        return do_doctor()
    if a == "menu":
        return do_menu()
    # 无参数：tty 就进菜单，否则打印帮助（脚本化调用不该卡住）
    if sys.stdin and sys.stdin.isatty():
        return do_menu()
    ap.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
