# -*- coding: utf-8 -*-
"""M2 离线分析：读取 dormmate.csv → 统计 → trend.png → report.html

用法: python analysis/analyze.py [--csv 路径]
每次运行全量重算，覆盖重写 report/trend.png 与 report/report.html，
CSV 数据变化后重跑即可让统计、图、报告全部跟着重新生成。
"""
import argparse
import csv
import html
import json
import sys
from datetime import datetime
from pathlib import Path

import matplotlib

matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import rcParams

rcParams['font.sans-serif'] = ['Microsoft YaHei', 'SimHei']
rcParams['axes.unicode_minus'] = False

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CSV = PROJECT_ROOT / 'data' / 'dormmate.csv'
REPORT_DIR = PROJECT_ROOT / 'report'

ALL_STATUSES = ['偏冷', '偏热', '偏湿', '正常']

STATUS_STYLES = {
    '偏冷': ('#e8f2fd', '#1d5fa8'),
    '偏热': ('#fdeee8', '#b5502a'),
    '偏湿': ('#e5f6f6', '#1a8a8a'),
    '正常': ('#eaf5e9', '#3c7a34'),
}


def compute_status(temp, humidity):
    """按统一环境判断规则由温湿度计算状态（与前端 judgeEnv 完全一致）：
    temp<18→偏冷；否则 temp≥30→偏热；否则 hum≥75→偏湿；剩下→正常。"""
    if temp < 18:
        return '偏冷'
    if temp >= 30:
        return '偏热'
    if humidity >= 75:
        return '偏湿'
    return '正常'


def format_time(time_str):
    """ISO 时间（YYYY-MM-DDTHH:mm:ss）转为 YYYY-MM-DD HH:mm:ss。"""
    return time_str.replace('T', ' ')


def read_records(csv_path):
    """读取 CSV，返回记录列表。按数据规范（CLAUDE.md）表头定位列：
    nodeId,temperature,humidity,status,time。
    status 列不读取——状态由温湿度按统一规则计算。文件异常时明确报错退出。"""
    if not csv_path.is_file():
        print(f'错误：找不到 CSV 文件 {csv_path}')
        sys.exit(1)
    with open(csv_path, encoding='utf-8-sig', newline='') as f:
        rows = [r for r in csv.reader(f) if r and any(r)]
    if len(rows) <= 1:
        print('错误：CSV 没有数据记录（只有表头或为空）')
        sys.exit(1)
    header = rows[0]
    required = ['nodeId', 'temperature', 'humidity', 'time']
    missing = [c for c in required if c not in header]
    if missing:
        print('错误：CSV 表头缺少列：' + '，'.join(missing) +
              '（规范：nodeId,temperature,humidity,status,time）')
        sys.exit(1)
    idx = {c: header.index(c) for c in header}
    records = []
    for r in rows[1:]:
        temp = float(r[idx['temperature']])
        humidity = float(r[idx['humidity']])
        records.append({
            'nodeId': r[idx['nodeId']],
            'time': format_time(r[idx['time']]),
            'temp': temp,
            'humidity': humidity,
            'status': compute_status(temp, humidity),
        })
    return records


def compute_stats(records):
    """统计极值、状态数量与需要关注的记录。"""
    stats = {
        'max_temp': max(records, key=lambda r: r['temp']),
        'min_temp': min(records, key=lambda r: r['temp']),
        'max_humidity': max(records, key=lambda r: r['humidity']),
        'min_humidity': min(records, key=lambda r: r['humidity']),
        'counts': {s: 0 for s in ALL_STATUSES},
        'attention': [r for r in records if r['status'] != '正常'],
    }
    for r in records:
        stats['counts'][r['status']] = stats['counts'].get(r['status'], 0) + 1
    return stats


def print_summary(records, stats):
    print(f'共 {len(records)} 条记录')
    print(f"最高温度：{stats['max_temp']['temp']}℃（{stats['max_temp']['time']}）")
    print(f"最低温度：{stats['min_temp']['temp']}℃（{stats['min_temp']['time']}）")
    print(f"最高湿度：{stats['max_humidity']['humidity']}%（{stats['max_humidity']['time']}）")
    print(f"最低湿度：{stats['min_humidity']['humidity']}%（{stats['min_humidity']['time']}）")
    counts = '，'.join(f'{s} {n} 次' for s, n in stats['counts'].items())
    print(f'各状态数量：{counts}')
    if stats['attention']:
        print(f"需要关注的记录 {len(stats['attention'])} 条：")
        for r in stats['attention']:
            print(f"  {r['time']}  温度{r['temp']}℃  湿度{r['humidity']}%  {r['status']}")
    else:
        print('需要关注的记录：无（全部正常）')


def make_chart(records, out_path):
    """温度/湿度随时间双折线，输出 trend.png。"""
    x = range(1, len(records) + 1)
    temps = [r['temp'] for r in records]
    hums = [r['humidity'] for r in records]
    labels = [r['time'][:-3] for r in records]  # 去掉秒，如 2026-09-26 17:51

    fig, ax1 = plt.subplots(figsize=(10, 5))
    ax1.plot(x, temps, 'o-', color='#4a90d9', label='温度 (℃)', linewidth=1.8)
    ax1.set_ylabel('温度 (℃)')
    ax1.set_xlabel('记录序号（时间）')
    ax2 = ax1.twinx()
    ax2.plot(x, hums, 's--', color='#1a8a8a', label='湿度 (%)', linewidth=1.5)
    ax2.set_ylabel('湿度 (%)')

    ax1.set_xticks(list(x))
    step = max(1, len(labels) // 12)
    ax1.set_xticklabels(
        [labels[i] if i % step == 0 else '' for i in range(len(labels))],
        rotation=30, fontsize=8,
    )
    lines1, labels1 = ax1.get_legend_handles_labels()
    lines2, labels2 = ax2.get_legend_handles_labels()
    ax1.legend(lines1 + lines2, labels1 + labels2, loc='upper left')
    ax1.grid(True, alpha=0.3)
    ax1.set_title('宿舍温湿度趋势')

    fig.tight_layout()
    fig.savefig(out_path, dpi=120)
    plt.close(fig)


def write_json(records, out_path):
    """导出 dormmate.json，元素字段与题目示例逐字一致：
    {"nodeId":"dorm-a","temperature":31,"humidity":78,"status":"偏热","time":"2026-09-22 20:30:00"}
    """

    def num(v):
        # 整数不带小数点（31 而非 31.0）
        return int(v) if float(v).is_integer() else float(v)

    payload = [{
        'nodeId': r['nodeId'],
        'temperature': num(r['temp']),
        'humidity': num(r['humidity']),
        'status': r['status'],
        'time': r['time'],
    } for r in records]
    out_path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(',', ':')),
        encoding='utf-8')


def build_report(records, stats, csv_path, out_path):
    """自动生成 report.html（覆盖写）。"""
    n = len(records)
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    extremes = ''
    for title, r, unit, key in [
        ('最高温度', stats['max_temp'], '℃', 'temp'),
        ('最低温度', stats['min_temp'], '℃', 'temp'),
        ('最高湿度', stats['max_humidity'], '%', 'humidity'),
        ('最低湿度', stats['min_humidity'], '%', 'humidity'),
    ]:
        extremes += (
            '<div class="stat">'
            f'<div class="stat-title">{title}</div>'
            f'<div class="num">{r[key]}{unit}</div>'
            f'<div class="meta">{html.escape(r["time"])}</div>'
            '</div>'
        )

    dist_rows = ''
    for s in ALL_STATUSES:
        c = stats['counts'][s]
        bg, fg = STATUS_STYLES[s]
        dist_rows += (
            '<tr>'
            f'<td><span class="status" style="background:{bg};color:{fg}">{s}</span></td>'
            f'<td>{c}</td><td>{c / n:.1%}</td>'
            '</tr>'
        )

    if stats['attention']:
        attn_rows = ''
        for r in stats['attention']:
            bg, fg = STATUS_STYLES[r['status']]
            attn_rows += (
                '<tr>'
                f'<td>{html.escape(r["time"])}</td>'
                f'<td>{r["temp"]}℃</td><td>{r["humidity"]}%</td>'
                f'<td><span class="status" style="background:{bg};color:{fg}">{html.escape(r["status"])}</span></td>'
                '</tr>'
            )
        attn_html = (
            f'<p class="meta">共 {len(stats["attention"])} 条需要关注</p>'
            '<table><tr><th>时间</th><th>温度</th><th>湿度</th><th>状态</th></tr>'
            f'{attn_rows}</table>'
        )
    else:
        attn_html = '<p>无，全部记录均为正常状态</p>'

    page = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>宿舍环境分析报告</title>
<style>
body{{font-family:"PingFang SC","Microsoft YaHei",sans-serif;max-width:860px;margin:24px auto;color:#2b3440;background:#f4f6f9;padding:16px}}
.card{{background:#fff;border-radius:12px;padding:20px 24px;margin-bottom:16px;box-shadow:0 2px 8px rgba(43,52,64,.08)}}
h1{{font-size:22px;margin:0 0 4px}}h2{{font-size:16px;margin:0 0 12px;color:#4a90d9}}
.meta{{color:#7a8494;font-size:13px}}
.stats{{display:flex;gap:12px;flex-wrap:wrap}}
.stat{{flex:1;min-width:150px;background:#f4f6f9;border-radius:8px;padding:12px;text-align:center}}
.stat .stat-title{{font-size:13px;color:#7a8494}}
.stat .num{{font-size:22px;font-weight:700;margin:4px 0}}
table{{width:100%;border-collapse:collapse;font-size:14px}}
th,td{{padding:8px 10px;border-bottom:1px solid #e5e9ef;text-align:left}}
th{{background:#f4f6f9}}
.status{{padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600}}
img{{max-width:100%;border-radius:8px}}
</style>
</head>
<body>
<div class="card">
<h1>宿舍环境分析报告</h1>
<p class="meta">生成时间：{now} · 数据来源：{csv_path} · 共 {n} 条记录</p>
</div>
<div class="card">
<h2>温湿度极值</h2>
<div class="stats">{extremes}</div>
</div>
<div class="card">
<h2>环境状态分布</h2>
<table><tr><th>状态</th><th>次数</th><th>占比</th></tr>{dist_rows}</table>
</div>
<div class="card">
<h2>需要关注的记录</h2>
{attn_html}
</div>
<div class="card">
<h2>温湿度趋势</h2>
<img src="trend.png" alt="温湿度趋势图">
</div>
</body>
</html>
'''
    out_path.write_text(page, encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description='分析 dormmate.csv，生成统计、趋势图与报告')
    parser.add_argument('--csv', default=str(DEFAULT_CSV),
                        help=f'CSV 路径（默认 {DEFAULT_CSV}）')
    args = parser.parse_args()

    csv_path = Path(args.csv)
    records = read_records(csv_path)
    stats = compute_stats(records)
    print_summary(records, stats)

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    make_chart(records, REPORT_DIR / 'trend.png')
    build_report(records, stats, csv_path, REPORT_DIR / 'report.html')
    write_json(records, REPORT_DIR / 'dormmate.json')
    print(f'\n已生成 report/trend.png、report/report.html 与 report/dormmate.json（{len(records)} 条记录）')


if __name__ == '__main__':
    main()
