# Windows 启动器：`.ps1` + `.cmd`、BOM、控制台编码

> 按「症状 → 根因 → 修法」写。

## 1. 症状：双击 `.ps1` 打开了记事本，脚本没跑

**根因**：Windows 上 `.ps1` 的**默认关联是编辑**，不是执行。这是安全设计，改不了也不该改。

**修法**：必须配一个 `.cmd` 垫片（放在同目录，让用户双击它）：

```bat
@echo off
rem 双击 THIS 文件：双击 .ps1 会打开记事本而不是执行，
rem 所以这个垫片用 -ExecutionPolicy Bypass 调起 PowerShell。
rem 本文件刻意全 ASCII，避免 cmd.exe 的编码问题。
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
set rc=%ERRORLEVEL%
endlocal & exit /b %rc%
```

两个 flag 都不能省：

- `-ExecutionPolicy Bypass` —— 默认策略会拦下未签名脚本
- `%~dp0` —— 取**本文件所在目录**，这样从任何 cwd 双击都能找到 `.ps1`（用 `%CD%` 会随右键菜单的工作目录漂移）

`.cmd` 文件**刻意全 ASCII**（连注释都用英文），绕开 cmd.exe 的代码页问题。

## 2. 症状：`.ps1` 里的中文注释和提示全变乱码

**根因**：Windows PowerShell **5.1** 在没有 BOM 时按 **ANSI（中文机器上是 GBK）** 解码脚本文件。
`.ps1` 是 UTF-8 存的 → 每个中文字符被按 GBK 拆开 → 乱码。

**修法**：写文件时用 `encoding="utf-8-sig"`（带 BOM）。用 Write 工具落盘后确认：

```bash
head -c 3 run.ps1 | xxd | head -1    # 应该是 efbb bf
```

顺带在脚本开头设一次输出编码（管的是**输出**，不管脚本文本身）：

```powershell
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
```

> PowerShell 7（pwsh）默认 UTF-8，但机器上跑的往往是系统自带的 5.1，**一律加 BOM 最稳**。

## 3. 症状：脚本输出的中文在控制台是乱码（BOM 已经加了还是乱）

**根因**：控制台代码页默认是 **936（GBK）**，跟脚本编码无关，是 stdout 解码错了。

**修法**：在 Python 侧改（真源里改一次，两个平台都受益）：

```python
def _init_console() -> None:
    if not IS_WINDOWS:
        return
    try:
        k32 = ctypes.windll.kernel32
        k32.SetConsoleOutputCP(65001)     # 控制台输出改 UTF-8
        k32.SetConsoleCP(65001)           # 输入也改
    except Exception:
        pass
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
```

⚠️ 只在 `IS_WINDOWS` 时做；POSIX 上动 `SetConsoleOutputCP` 没意义，而 `reconfigure` 是无害的但也没必要。

## 4. 找 Python：Windows 有四层要试

```powershell
function Find-Python {
    if ($env:ISKILL_PYTHON -and (Test-Path $env:ISKILL_PYTHON)) { return $env:ISKILL_PYTHON }  # 1 显式指定
    $pyLauncher = Get-Command "py" -ErrorAction SilentlyContinue                               # 2 py -3 最可靠
    if ($pyLauncher) {
        $exe = & $pyLauncher.Source -3 -c "import sys;print(sys.executable)" 2>$null
        if ($LASTEXITCODE -eq 0 -and $exe) { return $exe.Trim() }
    }
    foreach ($name in @("python", "python3")) {                                               # 3 PATH
        $c = Get-Command $name -ErrorAction SilentlyContinue
        if ($c) { return $c.Source }
    }
    foreach ($guess in @("$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",             # 4 常见安装位
                         "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
                         "C:\Python313\python.exe")) {
        if (Test-Path $guess) { return $guess }
    }
    return $null
}
```

顺序不能反：**`py -3` 优先于 PATH 里的 `python`** —— PATH 上的 `python` 常常是 Microsoft Store 的
「Python 别名」（一运行就打开商店），或者是别的项目塞进去的旧版本。

找不到时给可执行的下一步，别只说「请先安装 Python」：

```powershell
Write-Host "  · winget install -e --id Python.Python.3.13"
Write-Host "  · 或 https://www.python.org/downloads/windows/ （安装时勾选 Add python.exe to PATH）"
```

## 5. 退出菜单：只跳过 `Read-Host` 就行

Windows 不需要像 macOS 那样判父进程（窗口生命周期天然分得开）：

```powershell
& $py $script @args
$rc = $LASTEXITCODE

if ($args.Count -eq 0) {
    if ($rc -eq 10) { exit 0 }        # 菜单选了退出：
                                      #  · 双击 .cmd 的窗口 → 脚本结束 cmd 自关
                                      #  · 已有 PowerShell → 只是返回提示符
    Write-Host ""
    Read-Host "按回车键关闭窗口"       # 其它情况才停一下，免得窗口一闪就关
}
exit $rc
```

`$ErrorActionPreference = "Stop"` 建议加在开头，否则 PowerShell 会把非终止错误继续往下跑。
