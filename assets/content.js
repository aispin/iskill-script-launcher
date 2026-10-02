/* ============================================================================
 * iskill-promo-page · 内容（唯一需要逐技能改的文件）
 *
 * 结构：
 *   PROMO.brand / brand2  —— 品牌色（会注入 CSS 变量，换色不用改样式）
 *   PROMO.name / repo / installPrompt / license …—— 全局信息
 *   PROMO.lang.zh / .en   —— 双语文案（键必须两边都有，缺了会显示成空）
 *
 * 文案里的 HTML 只允许少量行内标签（<code>、<b>），卡片描述走 innerHTML，
 * 其余一律 textContent，别塞脚本。
 *
 * 安装方式默认是「让 agent 去装」——一键复制的是说给 AI 的一句话，
 * 由 repo 自动推导，**不需要你写安装命令**。
 * ==========================================================================*/
window.PROMO = {
  name: "ISKILL-SCRIPT-LAUNCHER",
  brand: "#f59e0b",
  brand2: "#38bdf8",
  repo: "https://github.com/aispin/iskill-script-launcher",
  repoLabel: "aispin/iskill-script-launcher",

  /* 默认提示词就是「请帮我安装 Skill：<repo>，并告诉我它的用法」，中英各一份。
     只有想换话术时才需要打开下面这段（可用 {repo} / {repoShort} / {name} 占位符）。 */
  license: "MIT",

  /* ── 平台兼容性标签（Hero 标题上方，「AI 技能」右边那枚）──────────────────
   *
   * 取值："mac-windows" | "macos" | "windows" | "linux" | "all" | "" | {zh,en}
   *
   * 本技能是**方法论 + 模板**：内容是 Markdown 与可直接抄的骨架代码，
   * 自身不调用任何平台专属命令 → "all"。它教的是「怎么让脚本跨三个平台」，
   * 而不是它自己依赖某个平台。
   */
  platform: "all",

  lang: {
    /* ── 中文 ───────────────────────────────────────────────────────── */
    zh: {
      meta: {
        title: "ISKILL-SCRIPT-LAUNCHER · 让用户双击就能跑的跨平台脚本",
        description: "一份 Python 实现 + 各平台薄壳：macOS 双击 .command、Windows 双击 .cmd、Linux 敲 .sh。附 15 条按症状归档的真机踩坑与可抄骨架。"
      },
      a11y: { skip: "跳到主要内容" },
      ui: { copy: "复制", copied: "已复制", failed: "复制失败" },
      nav: { features: "能力", how: "上手", faq: "问答" },

      hero: {
        badge: "AI 技能",
        titlePre: "让用户双击就跑，",
        titleAccent: "别写两套脚本",
        titlePost: "",
        sub: "把「一份 Python 真源 + 各平台薄壳」的架构、三个双击入口的骨架，以及真机上返工四次换来的踩坑清单，一次交给 agent。",
        ctaPrimary: "复制安装提示词",
        ctaSecondary: "看源码",
        meta1: "纯标准库",
        meta2: "本地运行",
        meta3: "MIT 许可"
      },
      terminal: {
        title: "zsh — iskill-script-launcher",
        lines: [
          [{ t: "$ ", c: "p" }, { t: "./run.command doctor", c: "k" }],
          [{ t: "  ", c: "p" }, { t: "平台      : darwin（Windows=False）", c: "s" }],
          [{ t: "  ", c: "p" }, { t: "Python    : 3.13.12", c: "s" }],
          [{ t: "  ", c: "p" }, { t: "端口 8801 : 空闲", c: "s" }]
        ]
      },

      stats: [
        { value: "1", label: "份真源，不是两套脚本", note: "逻辑只写一遍，行为就不会漂移" },
        { value: "3", label: "个双击入口", note: ".command / .cmd+.ps1 / .sh" },
        { value: "15", label: "条按症状归档的坑", note: "每条都是真机返工换来的" }
      ],

      compare: {
        eyebrow: "对比",
        title: "以前 vs 现在",
        sub: "给 agent 一份方法论，它才不会每次都从零猜。",
        before: {
          title: "让 agent 自己想办法",
          items: [
            "把 bash 逻辑翻译成第二份 PowerShell，改一处漏一处",
            "双击 .ps1 打开记事本，不知道要配 .cmd 垫片",
            "中文注释乱码，不知道 .ps1 要带 UTF-8 BOM",
            "用 os.kill(pid, 0) 探活 —— Windows 上直接把进程杀了",
            "退出菜单后窗口死在 [Process completed]，只能一轮轮口头反馈"
          ]
        },
        after: {
          title: "装上这个技能",
          items: [
            "默认架构就是「一份实现 + 薄壳」，并说清什么时候该换选型",
            "四件套骨架可直接抄，每处要改的地方标了 ⚠️",
            "坑按「症状 → 根因 → 修法」写，agent 拿着报错就能反查",
            "进程探活、结束、端口清理都给了两个平台的正确写法",
            "关窗的三条硬约束写死：先 exit 再后台关、别用 try 吞错、必须落日志"
          ]
        }
      },

      features: {
        eyebrow: "能力",
        title: "它能做什么",
        sub: "",
        items: [
          {
            icon: "terminal",
            title: "一份真源，三个平台",
            desc: "先判断你的脚本本来就依赖什么运行时（Python / Node），真源就用它写 —— 零新增依赖，还白得 Linux 支持。<b>绝不把 bash 翻译成第二份 PowerShell</b>：逻辑写两遍必然漂移。"
          },
          {
            icon: "grid",
            title: "四件套骨架可直接抄",
            desc: "<code>launcher.py</code>（唯一真源，纯标准库）+ <code>run.command</code>（macOS 双击，含场景判定与关窗）+ <code>run.ps1</code>（带 UTF-8 BOM）+ <code>run.cmd</code>（双击垫片）。每个要改的地方都标了 <code>⚠️ 改这里</code>。"
          },
          {
            icon: "shield",
            title: "踩坑清单按症状索引",
            desc: "15 条坑都按「症状 → 根因 → 修法」组织：agent 手里只有症状（<code>osascript rc=0 但窗口没关</code>、<code>stop 报已停止但进程还在</code>），靠症状反查才找得到。按知识点写的文档查不到。"
          },
          {
            icon: "zap",
            title: "进程管理两平台正确写法",
            desc: "Windows 上 <code>os.kill(pid,0)</code> 会真的杀掉进程 → 改用 <code>OpenProcess + GetExitCodeProcess == 259</code>；POSIX 未收尸的僵尸会被误判为活 → 先 <code>waitpid(WNOHANG)</code>；按端口清理必须先验进程名，名字取不到就跳过。"
          }
        ]
      },

      showcase: {
        eyebrow: "实拍",
        title: "看一眼真东西",
        sub: "",
        items: []
      },

      steps: {
        eyebrow: "上手",
        title: "三步跑起来",
        sub: "",
        items: [
          { title: "交给 AI 装", desc: "把这句话粘进对话框，agent 会自己拉代码、读文档，再告诉你用法。", codeKey: "install" },
          { title: "抄骨架", desc: "把 templates/ 里的四件套复制到你的技能目录，改各处 ⚠️ 标记（技能名、端口、进程名前缀、菜单项）。", codeName: "bash", code: "cp -R templates/ ./my-scripts/\nchmod +x run.command" },
          { title: "双击就跑", desc: "macOS 双击 .command，Windows 双击 .cmd（不是 .ps1 —— 双击 .ps1 会打开记事本）。无参数进交互菜单，带参数直接执行动作。", codeName: "bash", code: "./run.command          # 交互菜单\n./run.command doctor   # 环境体检\n./run.command start    # 启动" }
        ]
      },

      faq: {
        eyebrow: "问答",
        title: "常见问题",
        items: [
          {
            q: "我只有 macOS 脚本，能用吗？",
            a: "能，这正是它的主场景。它会先帮你定架构：如果你的服务本来就依赖某个运行时（Python venv / Node），真源就用那个语言写，macOS 与 Windows 各配一个薄壳。**判据是真源语言 = 你已经依赖的运行时**，不要为了写启动器引入新语言。"
          },
          {
            q: "为什么不能把 bash 翻译成 PowerShell 两套并存？",
            a: "逻辑写两遍，改一处漏一处，行为必然漂移 —— 而且这种漂移不会报错，只会「两边行为不太一样」。薄壳方案里，<code>.command</code> / <code>.ps1</code> 各自只有十几行，只做「找到解释器 → 转参数 → 收尾」。"
          },
          {
            q: "关窗那些坑我一定要处理吗？",
            a: "如果你的脚本不给用户双击（只在 CI 或你自己终端里跑），可以跳过。但只要涉及双击，macOS 上就有三条硬约束：① 必须先判是不是双击打开的，判不了就不关（误关会干掉用户的 shell 会话）；② 先 <code>exit</code>、再让后台 osascript 关，反过来留个活 shell 就会弹确认框；③ <code>osascript rc=0</code> 不等于真关了，别用 try 吞错，要落日志。"
          },
          {
            q: "这些坑你们是怎么验证的？",
            a: "真机返工四次换来的，而且每一次根因都推翻了上一轮的假设：先怀疑改错了副本、再怀疑判定层漏了 login 进程、最后是 AppleScript 把错误吞了。所以技能里第一条原则就是「GUI 行为必须内置可回读的日志」——关窗这类动作在 agent 沙箱里根本无法验证，<code>osascript</code> 会被系统权限直接拦。"
          },
          { q: "需要联网吗？", a: "装的时候需要，之后默认全部本地运行。模板是纯标准库 Python，离线可用。" }
        ]
      },

      cta: { title: "下次写脚本前先装上", desc: "把提示词粘给 AI，30 秒后它就知道该怎么起手。", primary: "去 GitHub 看看", secondary: "复制安装提示词" },
      footer: { license: "MIT 许可", madeWith: "由 iskill-promo-page 生成" }
    },

    /* ── English ────────────────────────────────────────────────────── */
    en: {
      meta: {
        title: "ISKILL-SCRIPT-LAUNCHER · Cross-platform scripts users can just double-click",
        description: "One Python implementation plus thin per-platform shells: .command on macOS, .cmd on Windows, .sh on Linux. Ships 15 symptom-indexed pitfalls from real machines and copy-paste skeletons."
      },
      a11y: { skip: "Skip to main content" },
      ui: { copy: "Copy", copied: "Copied", failed: "Copy failed" },
      nav: { features: "Features", how: "Get started", faq: "FAQ" },

      hero: {
        badge: "AI Skill",
        titlePre: "Double-clickable scripts —",
        titleAccent: "without writing them twice",
        titlePost: "",
        sub: "Hands your agent the \"one real implementation + thin shells\" architecture, skeletons for three double-click entry points, and 15 pitfalls paid for with four rounds of rework on real machines.",
        ctaPrimary: "Copy install prompt",
        ctaSecondary: "View source",
        meta1: "Stdlib only",
        meta2: "Runs locally",
        meta3: "MIT licensed"
      },
      terminal: {
        title: "zsh — iskill-script-launcher",
        lines: [
          [{ t: "$ ", c: "p" }, { t: "./run.command doctor", c: "k" }],
          [{ t: "  ", c: "p" }, { t: "platform  : darwin (Windows=False)", c: "s" }],
          [{ t: "  ", c: "p" }, { t: "python    : 3.13.12", c: "s" }],
          [{ t: "  ", c: "p" }, { t: "port 8801 : free", c: "s" }]
        ]
      },

      stats: [
        { value: "1", label: "real source, not two scripts", note: "Logic written once never drifts" },
        { value: "3", label: "double-click entry points", note: ".command / .cmd+.ps1 / .sh" },
        { value: "15", label: "symptom-indexed pitfalls", note: "Each paid for with real-machine rework" }
      ],

      compare: {
        eyebrow: "Compare",
        title: "Before vs after",
        sub: "Give the agent a method, and it stops guessing from scratch every time.",
        before: {
          title: "Agent figures it out alone",
          items: [
            "Translates bash into a second PowerShell copy — change one, miss the other",
            "Double-clicking .ps1 opens Notepad; no idea a .cmd shim is required",
            "Chinese comments turn to mojibake; doesn't know .ps1 needs a UTF-8 BOM",
            "Probes processes with os.kill(pid, 0) — which kills them on Windows",
            "Window dies at [Process completed] after menu exit; feedback takes rounds"
          ]
        },
        after: {
          title: "With this skill",
          items: [
            "Default architecture is \"one implementation + shells\", plus when to deviate",
            "Copy-paste four-file skeleton, every edit point marked ⚠️",
            "Pitfalls indexed by symptom → cause → fix, so the agent can reverse-lookup",
            "Correct per-platform code for probing, killing and port cleanup",
            "Three hard rules for closing windows: exit first, never swallow errors, always log"
          ]
        }
      },

      features: {
        eyebrow: "Features",
        title: "What it does",
        sub: "",
        items: [
          {
            icon: "terminal",
            title: "One source, three platforms",
            desc: "First decide what runtime your script already depends on (Python / Node) and write the real source in that — zero new dependencies, and Linux comes free. <b>Never translate bash into a second PowerShell</b>: logic written twice always drifts."
          },
          {
            icon: "grid",
            title: "Copy-paste four-file skeleton",
            desc: "<code>launcher.py</code> (the single source, stdlib only) + <code>run.command</code> (macOS double-click, with scene detection and window closing) + <code>run.ps1</code> (with UTF-8 BOM) + <code>run.cmd</code> (double-click shim). Every edit point is marked <code>⚠️</code>."
          },
          {
            icon: "shield",
            title: "Pitfalls indexed by symptom",
            desc: "All 15 are written as \"symptom → cause → fix\". The agent only ever holds a symptom (<code>osascript rc=0 but the window stayed open</code>, <code>stop said stopped but the process is alive</code>) — symptom is the only usable index key. Docs organized by topic can't be searched this way."
          },
          {
            icon: "zap",
            title: "Process management done right per platform",
            desc: "On Windows <code>os.kill(pid, 0)</code> actually kills the process → use <code>OpenProcess + GetExitCodeProcess == 259</code>; on POSIX an unreaped zombie reads as alive → <code>waitpid(WNOHANG)</code> first; port-based cleanup must verify the process name, and skip when the name is unknown."
          }
        ]
      },

      showcase: {
        eyebrow: "Screens",
        title: "See the real thing",
        sub: "",
        items: []
      },

      steps: {
        eyebrow: "Get started",
        title: "Three steps",
        sub: "",
        items: [
          { title: "Let AI install it", desc: "Paste this into your agent — it pulls the repo, reads the docs, and tells you how to use it.", codeKey: "install" },
          { title: "Copy the skeleton", desc: "Copy templates/ into your skill directory and edit every ⚠️ marker (skill name, port, process-name prefix, menu entries).", codeName: "bash", code: "cp -R templates/ ./my-scripts/\nchmod +x run.command" },
          { title: "Double-click and go", desc: "On macOS double-click .command; on Windows double-click .cmd (not .ps1 — that opens Notepad). No args opens the interactive menu; args run the action directly.", codeName: "bash", code: "./run.command          # interactive menu\n./run.command doctor   # environment check\n./run.command start    # start" }
        ]
      },

      faq: {
        eyebrow: "FAQ",
        title: "Common questions",
        items: [
          {
            q: "I only have a macOS script — is this useful?",
            a: "That's exactly the main scenario. It first helps you pick the architecture: if your service already depends on a runtime (a Python venv, Node), write the real source in that language and give macOS and Windows each a thin shell. The rule is: <b>source language = the runtime you already depend on</b>. Don't add a new language just to write a launcher."
          },
          {
            q: "Why not translate bash into PowerShell and keep both?",
            a: "Logic written twice means every change drifts somewhere — and this kind of drift never raises an error, it just makes the two sides behave slightly differently. In the shell approach, <code>.command</code> / <code>.ps1</code> are a dozen lines each and only do \"find interpreter → forward args → finish up\"."
          },
          {
            q: "Do I have to deal with all those window-closing pitfalls?",
            a: "Skip them if your script is never double-clicked (CI only, or your own terminal). But the moment users double-click, three hard rules apply on macOS: ① detect whether it really was a double-click, and don't close anything when you can't tell (closing the wrong thing kills the user's shell session); ② <code>exit</code> first, then let a background osascript close it — leaving a live shell instead triggers a confirmation dialog; ③ <code>osascript rc=0</code> does not mean it closed — never swallow the error in a try block, and always log."
          },
          {
            q: "How were these pitfalls verified?",
            a: "Four rounds of rework on a real machine, and each root cause overturned the previous hypothesis: first we suspected the wrong copy was edited, then a missing <code>login</code> process in the detection list, and finally AppleScript swallowing the error. That's why the skill's first principle is \"GUI actions must ship a readable log\" — closing windows simply cannot be verified from an agent sandbox, because <code>osascript</code> is blocked by system permissions there."
          },
          { q: "Does it need internet?", a: "Only to install. After that everything runs locally — the templates are stdlib-only Python." }
        ]
      },

      cta: { title: "Install it before your next script", desc: "Paste the prompt into your agent and it will know how to start in 30 seconds.", primary: "Open on GitHub", secondary: "Copy install prompt" },
      footer: { license: "MIT licensed", madeWith: "Built with iskill-promo-page" }
    }
  }
};
