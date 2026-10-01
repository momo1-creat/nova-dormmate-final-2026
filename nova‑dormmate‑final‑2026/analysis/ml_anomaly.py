# -*- coding: utf-8 -*-
"""C1+C2+C3：IsolationForest 训练、预测与 MQTT 本地推理（dorm-a 历史数据）

读取 data/dormmate.csv，过滤 nodeId 为 dorm-a 的记录，
以 temperature、humidity 两列作为特征训练 IsolationForest。
- 带 --temp/--humidity：对新输入单次预测，打印异常标记（1=正常，-1=异常）
- 不带参数：训练后订阅 dormmate/+/env，接收 MQTT 消息本地推理并打印
- 每次预测完成后，将记录追加写入 report/dormevent.json（JSON 数组，不覆盖历史）
"""
import argparse
import csv
import json
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path

import paho.mqtt.client as mqtt
from sklearn.ensemble import IsolationForest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = PROJECT_ROOT / 'data' / 'dormmate.csv'
EVENT_FILE = PROJECT_ROOT / 'report' / 'dormevent.json'

# 模块级全局模型：main() 训练后赋值，MQTT 回调内引用
MODEL = None


def judge_env(temp, humidity):
    """统一环境判断规则（与 dashboard/web/event_collector 的 judgeEnv 逐条一致）：
    temp<18→偏冷；temp≥30→偏热；18≤temp<30 且湿度≥75→偏湿；其余→正常。"""
    if temp < 18:
        return '偏冷'
    if temp >= 30:
        return '偏热'
    if humidity >= 75:
        return '偏湿'
    return '正常'


def append_event(node_id, temp, humidity, rule_status, ml_status, time_str):
    """将本条预测记录追加写入 report/dormevent.json（末尾追加，不覆盖历史）。"""
    try:
        events = []
        if EVENT_FILE.is_file():
            try:
                events = json.loads(EVENT_FILE.read_text(encoding='utf-8'))
                if not isinstance(events, list):
                    events = []
            except (json.JSONDecodeError, OSError):
                events = []
        events.append({
            'nodeId': node_id,
            'temperature': temp,
            'humidity': humidity,
            'rule_status': rule_status,
            'ml_status': ml_status,
            'time': time_str,
        })
        EVENT_FILE.parent.mkdir(parents=True, exist_ok=True)
        EVENT_FILE.write_text(
            json.dumps(events, ensure_ascii=False, indent=2), encoding='utf-8')
        print('已写入 report/dormevent.json')
    except OSError as e:
        print(f'错误：写入 report/dormevent.json 失败（{e}）')


def on_message(client, userdata, msg):
    print(f'【收到MQTT原始消息】topic={msg.topic}, payload={msg.payload.decode("utf-8", errors="replace")}')
    try:
        data = json.loads(msg.payload.decode('utf-8'))
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        print(f'错误：JSON 解析失败（{e}）')
        return
    temp = data.get('temperature')
    humidity = data.get('humidity')
    if not isinstance(temp, (int, float)) or not isinstance(humidity, (int, float)):
        print('错误：消息缺少 temperature/humidity 字段')
        return
    result = int(MODEL.predict([[temp, humidity]])[0])
    rule_status = judge_env(temp, humidity)
    label = '正常' if result == 1 else '异常'
    print(f'【收到数据: temperature={temp}, humidity={humidity}; 预测结果:{result}({label})】')
    print(f'【固定规则判断: {rule_status}】')

    # B 模块：组装状态 JSON 并推送（原有接收/推理逻辑不动，仅在其后追加）
    status_payload = {
        'nodeId': data.get('nodeId') or 'dorm-a',
        'temperature': temp,
        'humidity': humidity,
        'status': result,
        'time': data.get('time') or datetime.now().strftime('%Y-%m-%dT%H:%M:%S'),
    }
    status_json = json.dumps(status_payload, ensure_ascii=False)
    # 按消息里的 nodeId 动态拼接发布主题：dormmate/{nodeId}/status
    status_topic = f'dormmate/{status_payload["nodeId"]}/status'
    client.publish(status_topic, status_json)
    print('【向外推送状态消息】', status_json)
    print(f'已发起发布：{status_topic}')

    # C3 完善：预测记录追加写入 report/dormevent.json（含固定规则与 ML 双重判断）
    append_event(
        status_payload['nodeId'], temp, humidity, rule_status, result,
        status_payload['time'])


def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print('MQTT监听中，等待消息...')
        # 连接成功后再订阅
        client.subscribe('dormmate/+/env')
        print('成功订阅主题 dormmate/+/env')
    else:
        print(f'错误：MQTT 连接失败（rc={rc}）')
        sys.exit(1)


def on_disconnect(client, userdata, rc, properties=None):
    if rc != 0:
        print(f'警告：MQTT 连接意外断开（rc={rc}），自动重连中…')


def on_subscribe(client, userdata, mid, granted_qos, properties=None):
    print(f'订阅确认：mid={mid}, granted_qos={granted_qos}')


def main():
    global MODEL

    parser = argparse.ArgumentParser(description='训练 IsolationForest 并可选预测新数据')
    parser.add_argument('--temp', type=float, default=None, help='新输入温度（℃）')
    parser.add_argument('--humidity', type=float, default=None, help='新输入湿度（%）')
    args = parser.parse_args()

    if not CSV_PATH.is_file():
        print(f'错误：找不到 CSV 文件 {CSV_PATH}')
        sys.exit(1)

    with open(CSV_PATH, encoding='utf-8-sig', newline='') as f:
        rows = [r for r in csv.reader(f) if r and any(r)]
    if len(rows) <= 1:
        print('错误：CSV 没有数据记录（只有表头或为空）')
        sys.exit(1)

    header = rows[0]
    idx = {c: header.index(c) for c in header}

    features = []
    for r in rows[1:]:
        if r[idx['nodeId']] != 'dorm-a':
            continue
        features.append([
            float(r[idx['temperature']]),
            float(r[idx['humidity']]),
        ])

    print(f'共读取 {len(features)} 条 dorm-a 历史记录')

    MODEL = IsolationForest(
        n_estimators=100,
        contamination='auto',
        random_state=42,
    )
    MODEL.fit(features)
    print('模型训练完成')

    # C2：提供新输入时单次预测（只打印结果，不写文件）
    if args.temp is not None and args.humidity is not None:
        result = MODEL.predict([[args.temp, args.humidity]])[0]
        label = '正常' if result == 1 else '异常'
        print(f'预测结果：{result}（{label}）')
        return

    # C3：先绑定所有回调，再连接；client_id 用 uuid 保证每次启动唯一
    # （避免同一秒多次启动时 client_id 冲突被 broker 互相踢下线）
    client = mqtt.Client(client_id='ml-anomaly-' + uuid.uuid4().hex[:8])
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = on_message
    client.on_subscribe = on_subscribe
    try:
        client.connect('127.0.0.1', 1883, 60)
    except Exception as e:
        print(f'错误：无法连接 MQTT broker 127.0.0.1:1883（{e}），请先启动 broker')
        sys.exit(1)
    # 后台循环，主线程保持运行（Ctrl+C 退出）
    client.loop_start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
