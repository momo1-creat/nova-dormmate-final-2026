# -*- coding: utf-8 -*-
"""M5 事件收集器：订阅 dormmate/+/env（原始传感器数据），推导异常事件写入 data/events.json

用法（常驻运行，Ctrl+C 退出）：
    python analysis/event_collector.py

收到原始传感器 JSON 后按统一规则判断状态：
异常且无未关闭事件 → 新建事件；异常且已有未关闭事件 → 更新峰值温度；
恢复正常 → 关闭事件（写 endTime、recovered=true）。
"""
import json
import time
from datetime import datetime
from pathlib import Path

import paho.mqtt.client as mqtt

PROJECT_ROOT = Path(__file__).resolve().parent.parent
EVENTS_FILE = PROJECT_ROOT / 'data' / 'events.json'


def judge_env(temp, humidity):
    """统一环境判断规则（与 dashboard/web 的 judgeEnv 逐条一致）。"""
    if temp < 18:
        return '偏冷'
    if temp >= 30:
        return '偏热'
    if humidity >= 75:
        return '偏湿'
    return '正常'


def read_events():
    """读取 data/events.json 为列表；文件不存在/损坏 → 空数组。"""
    events = []
    if EVENTS_FILE.is_file():
        try:
            events = json.loads(EVENTS_FILE.read_text(encoding='utf-8'))
            if not isinstance(events, list):
                events = []
        except (json.JSONDecodeError, OSError):
            events = []
    return events


def write_events(events):
    EVENTS_FILE.write_text(
        json.dumps(events, ensure_ascii=False, indent=2), encoding='utf-8')


def upsert_dashboard_event(event):
    """Dashboard 发布的完整事件（dormmate/event）落盘。

    key = nodeId + startTime：已有同 key 记录 → 整体替换为完整版；
    否则末尾追加。这样 Dashboard 开与不开（env 推导兜底）两种来源不会重复。
    """
    events = read_events()
    key_node = event.get('nodeId')
    key_start = event.get('startTime')
    for i, e in enumerate(events):
        if e.get('nodeId') == key_node and e.get('startTime') == key_start:
            events[i] = event
            write_events(events)
            print('更新事件（dashboard 完整版）：%s %s %s' % (
                key_start, key_node, event.get('status', '')))
            return
    events.append(event)
    write_events(events)
    print('新存事件（dashboard 完整版）：%s %s %s' % (
        key_start, key_node, event.get('status', '')))


def on_message(client, userdata, msg):
    # dormmate/event：Dashboard 发布的完整事件链（发现→优先关注→动作→趋势→恢复），直接落盘
    if msg.topic == 'dormmate/event':
        try:
            event = json.loads(msg.payload.decode('utf-8'))
        except json.JSONDecodeError:
            return
        if event.get('nodeId') is None or event.get('startTime') is None:
            return
        upsert_dashboard_event(event)
        return
    # dormmate/+/env：原始传感器数据，自行推导异常事件（Dashboard 未开启时的兜底）
    try:
        data = json.loads(msg.payload.decode('utf-8'))
    except json.JSONDecodeError:
        return
    node_id = data.get('nodeId')
    temp = data.get('temperature')
    hum = data.get('humidity')
    if node_id is None or not isinstance(temp, (int, float)) or not isinstance(hum, (int, float)):
        return
    status = judge_env(temp, hum)

    raw_time = data.get('time')
    if isinstance(raw_time, str) and len(raw_time) >= 16:
        hhmm = raw_time[11:16]
    else:
        hhmm = datetime.now().strftime('%H:%M')

    events = read_events()
    open_event = next(
        (e for e in events if e.get('nodeId') == node_id and e.get('recovered') is False),
        None)

    if status != '正常':
        if open_event is None:
            events.append({
                'nodeId': node_id,
                'status': status,
                'startTime': hhmm,
                'endTime': None,
                'recovered': False,
                'tempPeak': temp,
            })
            print('新建事件：%s %s 开始异常（%s，温度峰值 %.1f）' % (hhmm, node_id, status, temp))
        else:
            if temp > open_event.get('tempPeak', -999):
                open_event['tempPeak'] = temp
            print('更新事件：%s %s 持续异常（%s，温度峰值 %.1f）' % (
                hhmm, node_id, status, open_event['tempPeak']))
    else:
        if open_event is not None:
            open_event['endTime'] = hhmm
            open_event['recovered'] = True
            print('关闭事件：%s %s 恢复正常（%s -> %s）' % (
                hhmm, node_id, open_event.get('startTime'), hhmm))
        else:
            print('正常数据：%s %s（无未关闭事件，忽略）' % (hhmm, node_id))

    write_events(events)


def main():
    # client_id 带时间戳后缀：避免与 broker 上残留的同名会话冲突（同 id 新连接订阅会失效）
    client = mqtt.Client(
        client_id='dormmate-event-collector-' + str(int(time.time())))
    client.on_message = on_message
    client.connect('127.0.0.1', 1883, 60)
    client.subscribe('dormmate/+/env')
    client.subscribe('dormmate/event')
    # 路径含特殊字符，控制台 GBK 编码可能失败——用安全转义打印
    safe_path = str(EVENTS_FILE).encode('ascii', 'backslashreplace').decode('ascii')
    print('事件收集器已启动：dormmate/+/env、dormmate/event -> %s（Ctrl+C 退出）' % safe_path)
    client.loop_forever()


if __name__ == '__main__':
    main()
