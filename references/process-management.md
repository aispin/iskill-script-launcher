# 进程管理：探活、结束、端口、会话隔离

> 按「症状 → 根因 → 修法」写。这一篇的坑都不报异常，只会**悄悄给出错误答案**。

## 1. 症状：`stop` 把不该杀的进程杀了（或用 `os.kill(pid, 0)` 探活后进程没了）

**根因**：Python 文档写明 —— Windows 下除 `signal.CTRL_C_EVENT` / `CTRL_BREAK_EVENT` 外，
所有信号一律走 `TerminateProcess`。所以「用 `os.kill(pid, 0)` 探活」在 Windows 上等于**无条件杀人**。

**修法**：Windows 改用 `OpenProcess` + `GetExitCodeProcess`，退出码 `259`（`STILL_ACTIVE`）才算活着：

```python
def pid_alive(pid: int) -> bool:
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
    # POSIX 见第 2 节
```

## 2. 症状：POSIX 上 `stop` 打印「已停止 PID x」，但紧接着判存活还是 `True`

**根因**：子进程死掉但**没被 reap** 时，PID 表项仍在，`os.kill(pid, 0)` 依然成功。
守护进程重启后还会多一层：那 pid 根本不是自己的子进程（`ChildProcessError`）。

**修法**：先收尸，再判断，最后排僵尸：

```python
    try:
        wpid, _ = os.waitpid(pid, os.WNOHANG)
        if wpid == pid:
            return False            # 是我们自己的僵尸，顺手收掉 → 判死
    except ChildProcessError:
        pass                        # 不是自己的子进程（守护进程重启后的常态），继续往下判
    except OSError:
        pass
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    if _ps_state(pid).upper().startswith("Z"):   # ps -o state= 看是不是 Z
        return False
    return True
```

## 3. 症状：`ps` 报 `operation not permitted`（macOS 沙箱 / 最小容器）

**根因**：`/bin/ps` 是 setuid root，某些沙箱策略会拦。

**修法**：**进程名一律优先走 `lsof -Fpc`**（机器可读，逐行 `p<pid>` / `c<命令名>`），
`ps` 只当僵尸判定的补充：

```python
def _lsof_owners(port):
    args = [lsof, "-nP", "-Fpc"]
    args += [f"-iTCP:{port}", "-sTCP:LISTEN"] if port is not None else ["-iTCP", "-sTCP:LISTEN"]
    # 输出形如： p46017 / cpython3.13 / f5
```

所有取名字的函数都该**可失败**：取不到就返回空，**绝不猜**。

## 4. 症状：`stop` 误杀了别人的进程

**根因**：按端口兜底清理时，同一个端口上完全可能是别人的程序。

**修法**：清理前先验进程名，只有自己的才动；**名字取不到时保守跳过**——宁可漏清，也不错杀：

```python
def looks_like_ours(name: str) -> bool:
    n = (name or "").lower()
    return n.startswith("python") or n.startswith("headroom")   # ← 换成你的进程名前缀

for port, label in ((HUB_PORT, "hub"), (HEADROOM_PORT, "headroom")):
    for pid, name in port_owners(port):
        if not looks_like_ours(name):
            log(f"端口 {port} 被 PID {pid}（{name or '名字未知'}）占用，不像本服务，跳过")
            continue
        if kill_pid(pid):
            killed_any = True
```

`pids.json` 里**显式登记过的 PID 不设这道门** —— 那是我们自己写下的，不需要猜。

## 5. 症状：后台进程随终端一起死 / 或者反过来起不来

**根因**：没脱离父进程。终端一关，进程收到 SIGHUP 或进程组被回收。

**修法**：

```python
kwargs = dict(stdin=subprocess.DEVNULL, stdout=fh, stderr=subprocess.STDOUT, cwd=str(cwd), env=env)
if IS_WINDOWS:
    kwargs["creationflags"] = (subprocess.DETACHED_PROCESS
                               | subprocess.CREATE_NEW_PROCESS_GROUP
                               | subprocess.CREATE_NO_WINDOW)
else:
    kwargs["start_new_session"] = True
```

结束进程同样分平台（Windows 没有 SIGTERM 语义）：

```python
def kill_pid(pid, tree=True) -> bool:
    if IS_WINDOWS:
        args = ["taskkill", "/PID", str(pid), "/F"] + (["/T"] if tree else [])   # /T 收子进程
        ...
    else:
        os.kill(pid, signal.SIGTERM)   # 最多等 2s
        ...
        os.kill(pid, signal.SIGKILL)
```

## 6. 症状：两个实例并发跑，断言全绿但读到的内容是对方的

**根因**：**会话名 / 锁名 / 临时目录名写死**。并发时两个进程抢同一个资源，
彼此读到对方的状态，而且**两边都不报错**（因为各自都"成功"了）。

**修法**：会话名按「子命令 + 端口/主机 + 进程号 + 时间戳」**派生**，并允许 `--session` 覆盖：

```js
function sessionName(prefix, url) {
  if (process.env.SESSION) return process.env.SESSION;
  const host = /* 从 url 取 host:port */;
  return `${prefix}-${host}-${process.pid}-${Date.now()}`;
}
```

⚠️ 改的时候注意：**同一处常量可能被引用多次**（例如调用一次 + 收尾关一次），
只改一处会漏掉收尾，留下常驻进程。改完全局搜一遍常量名。

这条不只适用于浏览器会话——**临时目录、pid 文件、下载缓存目录**同理。

## 7. 隔离测试脚本（真实服务在跑时用它）

**不要停正在服务的进程**。换运行时 + 换端口 + 用假进程：

```bash
PY=<python 路径>
cd <技能目录>

$PY scripts/launcher.py doctor          # 只读
$PY scripts/launcher.py status
printf '0\n' | $PY scripts/launcher.py  # 菜单能渲染、能退出（rc=10）

TMP=$(mktemp -d)
ISKILL_RUNTIME=$TMP $PY - <<'EOF'
import sys, os, subprocess, pathlib
sys.path.insert(0, "scripts"); import launcher
rt = pathlib.Path(os.environ["ISKILL_RUNTIME"])
launcher.RUNTIME, launcher.PIDS = rt, rt / "pids.json"
launcher.PORT_A, launcher.PORT_B = 18788, 18787        # 换成真实端口常量名
a = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
rt.mkdir(parents=True, exist_ok=True); launcher.write_pids(a.pid, a.pid)
assert launcher.do_stop() == 0
a.wait()
assert not launcher.pid_alive(a.pid) and not launcher.PIDS.exists()
print("✓ stop 隔离测试通过")
EOF

# 收尾必做：确认真实服务还在
curl -s -o /dev/null -w "%{http_code}\n" --noproxy '*' http://127.0.0.1:<真实端口>/health
```

⚠️ `curl` 本机服务要加 `--noproxy '*'` —— 环境里的 `HTTP(S)_PROXY` 会劫持 `127.0.0.1`。
