# -*- coding: utf-8 -*-
"""一键重置事件数据：清空 data/events.json 与 report/dormevent.json

什么时候用：
- 测试残留的未恢复事件干扰新流程时（未恢复事件会吸收同节点的新异常消息）
- 想要一张干净的「今日事件」时

用法（项目根目录）：
    python analysis/reset_events.py
"""
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
TARGETS = [
    PROJECT_ROOT / 'data' / 'events.json',
    PROJECT_ROOT / 'report' / 'dormevent.json',
]

for path in TARGETS:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('[]', encoding='utf-8')
    safe = str(path).encode('ascii', 'backslashreplace').decode('ascii')
    print('已清空：%s' % safe)

print('完成：事件数据已重置')
