#!/usr/bin/env bash
# ⚠️ 改这里：脚本名 · 薄壳（放在 scripts/ 下，给习惯敲 ./scripts/x.sh 的人用）
#
# ⚠️ 这里只是一层薄壳：真正的实现在 scripts/launcher.py（跨 macOS / Windows / Linux 一份代码）。
#    **不要在 bash 里实现任何逻辑** —— 逻辑写两份必然漂移。
# 最后一行改成对应动作即可（start / stop / restart / status / doctor …）。
set -e
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PY="${ISKILL_PYTHON:-}"
if [ -z "$PY" ] || [ ! -x "$PY" ]; then
  PY="$(command -v python3 || command -v python || echo python3)"
fi
exec "$PY" "$SKILL_DIR/scripts/launcher.py" start "$@"
