// M5 Dashboard：MQTT 实时数据驱动 dorm-a/b/c 三节点状态卡片 + Canvas 趋势图
// 主题约定：订阅 dormmate/+/env（只收传感器数据，status/attention/control 等链路派生消息不进入）
// 消息 JSON 必须包含 nodeId：{nodeId, temperature, humidity, status?, time?}（time 缺省用到达时间）
(function () {
  const NODES = ['dorm-a', 'dorm-b', 'dorm-c'];
  const CHART_MAX = 30; // 趋势图最多显示条数
 const MQTT_URL = 'ws://127.0.0.1:8083/mqtt';
  const SUB_TOPIC = 'dormmate/+/env';

  // 统一环境判断规则（与 web/script.js 的 judgeEnv 逐条一致）
  function judgeEnv(temp, humidity) {
    if (temp < 18) return '偏冷';
    if (temp >= 30) return '偏热';
    if (humidity >= 75) return '偏湿';
    return '正常';
  }

  const STATUS_CLASS = {
    '偏冷': 'st-cold',
    '偏热': 'st-hot',
    '偏湿': 'st-humid',
    '正常': 'st-normal'
  };

  // 三节点独立历史（互不串线）
  const historyMap = {};
  NODES.forEach(function (n) { historyMap[n] = []; });

  let selectedNode = 'dorm-a';

  // ISO 8601 本地时间（与数据规范一致）
  function formatLocalISO(date) {
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
      'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
  }

  // 数据更新统一入口：MQTT 消息到达后按节点路由到这里
  function updateNode(nodeId, record) {
    historyMap[nodeId].push(record);
    renderCards();
    if (nodeId === selectedNode) renderChart();
    updateNodeState(nodeId, record);
    renderAttention(computeAttention());
    renderOverview();
    renderB2();
    renderDailySummary();
  }

  // ---- B2：最高优先级节点（三级排序 + 动态依据与来源） ----
  // 接收 B1 识别出的异常节点集合
  function getAbnormalNodes() {
    return NODES.filter(function (n) {
      const arr = historyMap[n];
      return arr.length > 0 && arr[arr.length - 1].status !== '正常';
    });
  }

  // 三级排序：① 连续异常时长 ② 异常次数 ③ nodeId 字典序（a<b<c）
  function computeB2Winner() {
    const abnormal = getAbnormalNodes();
    if (!abnormal.length) return null;
    const infos = abnormal.map(nodeAttention);
    infos.sort(function (x, y) {
      if (y.durationSec !== x.durationSec) return y.durationSec - x.durationSec;
      if (y.abnormalCount !== x.abnormalCount) return y.abnormalCount - x.abnormalCount;
      return x.nodeId < y.nodeId ? -1 : 1; // 字典序
    });
    return { winner: infos[0], rivals: infos.slice(1) };
  }

  function renderB2() {
    const el = document.getElementById('b2-text');
    const result = computeB2Winner();
    if (!result) {
      el.textContent = historyMap['dorm-a'].length
        ? '当前无异常节点，无需选择'
        : '等待数据…';
      return;
    }
    const w = result.winner;
    const parts = [
      '当前最值得关注：' + w.nodeId,
      '依据：来自各节点传感器上报数据——' + w.nodeId +
        ' 连续异常时长 ' + w.durationSec + 's、异常发生 ' + w.abnormalCount + ' 次'
    ];
    if (result.rivals.length) {
      const rivalText = result.rivals.map(function (r) {
        return r.nodeId + '（时长 ' + r.durationSec + 's、' + r.abnormalCount + ' 次）';
      }).join('、');
      parts.push('对比其余异常节点：' + rivalText);
    }
    el.textContent = parts.join('；');
  }

  // ---- B3：今日摘要（基于真实事件自动整理：谁出了问题、做了什么、结果如何） ----
  const PERIODS = [
    { max: 5, label: '凌晨' },
    { max: 8, label: '早晨' },
    { max: 11, label: '上午' },
    { max: 13, label: '中午' },
    { max: 17, label: '下午' },
    { max: 19, label: '傍晚' },
    { max: 22, label: '晚上' },
    { max: 24, label: '深夜' }
  ];

  const ACTION_TEXT = {
    'fan_on': '开启风扇',
    'window_close': '关闭窗户'
  };

  function periodOf(hhmm) {
    const h = parseInt(hhmm.slice(0, 2), 10);
    for (let i = 0; i < PERIODS.length; i++) {
      if (h < PERIODS[i].max) return PERIODS[i].label;
    }
    return '深夜';
  }

  function minutesBetween(startHHMM, endHHMM) {
    const s = parseInt(startHHMM.slice(0, 2), 10) * 60 + parseInt(startHHMM.slice(3, 5), 10);
    const e = parseInt(endHHMM.slice(0, 2), 10) * 60 + parseInt(endHHMM.slice(3, 5), 10);
    return Math.max(0, e - s);
  }

  function renderDailySummary() {
    const el = document.getElementById('daily-summary-text');
    const hasAnyData = NODES.some(function (n) { return historyMap[n].length > 0; });
    if (!hasAnyData) {
      el.textContent = '等待数据…';
      return;
    }
    const ongoingCount = NODES.filter(function (n) { return currentIncident[n]; }).length;
    const total = incidents.length + ongoingCount;
    if (!total) {
      el.textContent = '全部节点今日整体正常，未发生需要关注的环境事件。';
      return;
    }
    const nodeParts = NODES.map(function (n) {
      const inc = currentIncident[n];
      if (inc) {
        return n + ' ' + periodOf(inc.startTime) + ' 出现 1 次' + inc.status + '，目前仍未恢复';
      }
      const done = incidents.filter(function (i) { return i.nodeId === n; });
      if (done.length) {
        const last = done[done.length - 1];
        const mins = minutesBetween(last.startTime, last.endTime);
        const actionNames = last.actions.map(function (a) {
          return ACTION_TEXT[a.action] || a.action;
        }).join('、');
        const actionPart = actionNames
          ? (actionNames + '后 ' + mins + ' 分钟恢复')
          : (mins + ' 分钟后恢复');
        return n + ' ' + periodOf(last.startTime) + ' 发生 ' + done.length + ' 次持续' +
          last.status + '，' + actionPart;
      }
      return n + ' 全天整体正常';
    });
    el.textContent = nodeParts.join('；') + '。今日共发生 ' + total + ' 次需要关注的环境事件。';
  }

  // ---- B1：当前总览（客观罗列 3 节点状态，标记需要关注，统计异常数量；
  // 不做优先级排序、不选重点节点——动态拼接，无硬编码数据） ----
  function renderOverview() {
    const el = document.getElementById('overview-text');
    const segments = NODES.map(function (n) {
      const arr = historyMap[n];
      if (!arr.length) return null;
      const latest = arr[arr.length - 1];
      const abnormal = latest.status !== '正常';
      return n + '(' + latest.status + ')' + (abnormal ? '需要关注' : '');
    }).filter(Boolean);
    const abnormalCount = NODES.filter(function (n) {
      const arr = historyMap[n];
      return arr.length > 0 && arr[arr.length - 1].status !== '正常';
    }).length;
    el.textContent = segments.length
      ? '当前总览：' + segments.join('，') + '；共' + abnormalCount + '个节点存在异常。'
      : '等待数据…';
  }

  // ---- A1：判断当前最值得关注的宿舍 ----
  const NODE_ORDER = { 'dorm-a': 0, 'dorm-b': 1, 'dorm-c': 2 };

  function parseTime(str) {
    return new Date(str.replace(' ', 'T')).getTime();
  }

  // 单节点关注度信息：异常持续时间（连续异常段）、累计异常次数、是否异常
  function nodeAttention(nodeId) {
    const arr = historyMap[nodeId];
    if (!arr.length) {
      return { nodeId: nodeId, durationSec: 0, abnormalCount: 0, isAbnormal: false };
    }
    const abnormalCount = arr.filter(function (r) { return r.status !== '正常'; }).length;
    const latest = arr[arr.length - 1];
    if (latest.status === '正常') {
      return { nodeId: nodeId, durationSec: 0, abnormalCount: abnormalCount, isAbnormal: false };
    }
    // 从最新一条往前找连续异常段首
    // 异常持续时间 = 当前时间 − 本轮异常起始时间（由状态机在进入异常时记录、恢复时清空；
    // 恢复后再异常会重新记录，时长从 0 重新计时）
    // 上方【最高优先级节点】与下方【当前最值得关注】共用此变量，两处数字保持一致
    const startTime = anomalyStartTime[nodeId];
    const start = startTime
      ? parseTime(startTime)
      : parseTime(arr.find(function (r) { return r.status !== '正常'; }).time);
    const durationSec = Math.max(0, Math.round((Date.now() - start) / 1000));
    return { nodeId: nodeId, durationSec: durationSec, abnormalCount: abnormalCount, isAbnormal: true };
  }

  // 三级优先级：① 异常持续时间 ② 异常次数 ③ dorm-a>b>c 固定顺序；无异常节点返回 null
  // 返回 winner 并附判断理由维度（与第二名的对比依据）
  function computeAttention() {
    const infos = NODES.map(nodeAttention);
    const abnormal = infos.filter(function (i) { return i.isAbnormal; });
    if (!abnormal.length) return null;
    abnormal.sort(function (x, y) {
      if (y.durationSec !== x.durationSec) return y.durationSec - x.durationSec;
      if (y.abnormalCount !== x.abnormalCount) return y.abnormalCount - x.abnormalCount;
      return NODE_ORDER[x.nodeId] - NODE_ORDER[y.nodeId];
    });
    const winner = abnormal[0];
    const rival = abnormal[1] || null;
    let reasonKind = 'only';
    if (rival) {
      if (winner.durationSec > rival.durationSec) reasonKind = 'duration';
      else if (winner.abnormalCount > rival.abnormalCount) reasonKind = 'count';
      else reasonKind = 'order';
    }
    winner.reasonKind = reasonKind;
    winner.rival = rival;
    return winner;
  }

  function formatDuration(sec) {
    if (sec >= 3600) {
      return Math.floor(sec / 3600) + ' 小时 ' + Math.floor((sec % 3600) / 60) + ' 分钟';
    }
    if (sec >= 60) return Math.floor(sec / 60) + ' 分钟';
    return sec + ' 秒';
  }

  // 生效规则的明确标签（原样显示在卡片理由中）
  const RULE_LABEL = {
    'duration': '【异常持续时间更长优先】',
    'count': '【异常发生次数更多优先】',
    'order': '【并列时按 dorm-a>dorm-b>dorm-c固定顺序】'
  };

  const STATE_BADGE = {
    'needs': '【仍需关注】',
    'processing': '【处理中】',
    'recovered': '【已恢复】'
  };

  function renderAttention(winner) {
    const el = document.getElementById('attention-text');
    if (!winner) {
      const rec = NODES.filter(function (n) { return nodeState[n] === 'recovered'; })[0];
      el.textContent = rec
        ? rec + ' · 【已恢复】全部正常，无需关注'
        : (historyMap['dorm-a'].length ? '全部正常，无需关注' : '等待数据…');
      document.getElementById('attention-actions').hidden = true;
      return;
    }
    let reason;
    if (winner.reasonKind === 'duration') {
      reason = '持续异常 ' + formatDuration(winner.durationSec) +
        '（超过 ' + winner.rival.nodeId + ' 的 ' + formatDuration(winner.rival.durationSec) + '）' +
        '，累计异常 ' + winner.abnormalCount + ' 次';
    } else if (winner.reasonKind === 'count') {
      reason = '与 ' + winner.rival.nodeId + ' 持续异常时长相同（' + formatDuration(winner.durationSec) +
        '），但累计异常次数更多（' + winner.abnormalCount + ' 次 vs ' + winner.rival.abnormalCount + ' 次）';
    } else if (winner.reasonKind === 'order') {
      reason = '与 ' + winner.rival.nodeId + ' 持续异常时长与异常次数均相同，按固定顺序优先';
    } else {
      reason = '持续异常 ' + formatDuration(winner.durationSec) +
        '，累计异常 ' + winner.abnormalCount + ' 次';
    }
    const label = RULE_LABEL[winner.reasonKind] || '';
    const badge = STATE_BADGE[nodeState[winner.nodeId]] || '';
    el.textContent = (badge ? badge + ' ' : '') + winner.nodeId + ' · ' +
      (label ? label + ' ' : '') + reason;
    document.getElementById('attention-actions').hidden = false;
    // A4：记录该节点被优先关注的原因（事件复盘依据）
    const inc = currentIncident[winner.nodeId];
    if (inc && !inc.priorityNote) {
      inc.priorityNote = {
        time: hhmm(formatLocalISO(new Date())),
        reason: (label ? label + ' ' : '') + reason
      };
    }
  }

  // ---- A3：三状态机 + 事件链 ----
  // nodeState: needs（仍需关注）/ processing（处理中）/ recovered（已恢复）/ undefined（无异常历史）
  const nodeState = {};
  // 每节点本轮异常起始时间：进入异常时记录，恢复时清空，再异常重新记录（从 0 重新计时）
  const anomalyStartTime = {};
  const eventChain = [];

  function pushEvent(type, nodeId, detail) {
    eventChain.push({
      time: formatLocalISO(new Date()),
      type: type,
      nodeId: nodeId,
      detail: detail
    });
  }

  function publishAttentionState(nodeId, state) {
    if (mqttClient) {
      mqttClient.publish('dormmate/attention/' + nodeId,
        JSON.stringify({ nodeId: nodeId, state: state }));
    }
  }

  // ---- A4：完整事件聚合（异常发现 → 优先关注 → 动作 → 趋势 → 恢复） ----
  const incidents = [];
  const currentIncident = {};

  function hhmm(iso) {
    return iso.slice(11, 16);
  }

  function startIncident(nodeId, status, temp, time) {
    currentIncident[nodeId] = {
      nodeId: nodeId,
      startTime: hhmm(time),
      status: status,
      priorityNote: null,
      actions: [],
      trendTime: null,
      endTime: null,
      recovered: false,
      tempPeak: temp
    };
  }

  function finishIncident(nodeId, time) {
    const inc = currentIncident[nodeId];
    if (!inc) return;
    inc.endTime = hhmm(time);
    inc.recovered = true;
    incidents.push(inc);
    currentIncident[nodeId] = null;
    if (mqttClient) {
      mqttClient.publish('dormmate/event', JSON.stringify(inc));
    }
    renderIncidents();
    renderDailySummary();
  }

  function renderIncidents() {
    const wrap = document.getElementById('incident-list');
    const empty = document.getElementById('incident-empty');
    wrap.innerHTML = '';
    empty.hidden = incidents.length > 0;
    incidents.slice(-5).reverse().forEach(function (inc) {
      const parts = [
        inc.startTime + ' ' + inc.status + '异常',
        inc.priorityNote ? (inc.priorityNote.time + ' 优先关注') : null,
        inc.actions.map(function (a) { return a.time + ' ' + a.action; }).join('、'),
        inc.trendTime ? (inc.trendTime + ' 温度开始下降') : null,
        inc.endTime + ' 恢复正常'
      ].filter(Boolean);
      const li = document.createElement('li');
      li.textContent = inc.nodeId + ' · ' + parts.join(' → ');
      wrap.appendChild(li);
    });
  }

  // 状态只由传感器新上报数据触发变更（按钮不修改异常状态）
  function updateNodeState(nodeId, record) {
    const prev = nodeState[nodeId];
    const hasAction = actionLog.some(function (a) { return a.nodeId === nodeId; });
    if (record.status !== '正常') {
      pushEvent('data_received', nodeId, '异常(' + record.status + ')');
      if (!prev || prev === 'recovered') {
        // 首次异常 / 恢复后再异常：记录本轮异常起始时间，时长从 0 重新计时
        nodeState[nodeId] = hasAction ? 'processing' : 'needs';
        anomalyStartTime[nodeId] = record.time;
        pushEvent(prev === 'recovered' ? 'still_abnormal' : 'abnormal_detected',
          nodeId, hasAction ? '再次异常且有动作记录 → 处理中' : '发现异常 → 仍需关注');
        startIncident(nodeId, record.status, record.temperature, record.time);
      } else if (prev === 'needs' && hasAction) {
        nodeState[nodeId] = 'processing';
        pushEvent('still_abnormal', nodeId, '仍异常且已有动作 → 处理中');
      } else {
        pushEvent('still_abnormal', nodeId, '保持 ' + prev);
      }
      // 温度从峰值回落 → 记「温度开始下降」（仅一次）
      const inc = currentIncident[nodeId];
      if (inc && inc.trendTime === null && record.temperature < inc.tempPeak) {
        inc.trendTime = hhmm(formatLocalISO(new Date()));
      }
      publishAttentionState(nodeId, nodeState[nodeId]);
    } else {
      pushEvent('data_received', nodeId, '正常');
      if (prev === 'needs' || prev === 'processing') {
        nodeState[nodeId] = 'recovered';
        anomalyStartTime[nodeId] = null; // 恢复正常：清空异常起始时间，本轮异常结束
        pushEvent('recovered', nodeId, '收到正常数据 → 已恢复');
        publishAttentionState(nodeId, 'recovered');
        finishIncident(nodeId, record.time);
      } else if (prev === 'recovered') {
        nodeState[nodeId] = undefined; // 持续正常，解除状态
        publishAttentionState(nodeId, 'normal');
      }
    }
  }

  // ---- A2：异常处理动作 ----
  const actionLog = [];

  function handleAction(action) {
    const winner = computeAttention();
    if (!winner || !mqttClient) return;
    const topic = 'dormmate/control/' + winner.nodeId;
    const time = formatLocalISO(new Date());
    mqttClient.publish(topic, JSON.stringify({ action: action }));
    console.log('[A2] action=' + action + ' node=' + winner.nodeId + ' time=' + time);
    actionLog.push({ nodeId: winner.nodeId, action: action, time: time });
    // A4：动作写入当前事件（复盘依据）
    const incident = currentIncident[winner.nodeId];
    if (incident) {
      incident.actions.push({ action: action, time: hhmm(time) });
    }
    // 动作后进入处理中（不消除异常本身，仅标记处理状态）
    if (nodeState[winner.nodeId] === 'needs') {
      nodeState[winner.nodeId] = 'processing';
      publishAttentionState(winner.nodeId, 'processing');
    }
    pushEvent('action_taken', winner.nodeId, action);
    const pt = document.getElementById('processing-text');
    pt.textContent = '已发送 ' + action + ' → ' + winner.nodeId + '，处理中…';
    pt.hidden = false;
    clearTimeout(handleAction._timer);
    handleAction._timer = setTimeout(function () { pt.hidden = true; }, 3000);
  }

  document.getElementById('action-fan').addEventListener('click', function () { handleAction('fan_on'); });
  document.getElementById('action-window').addEventListener('click', function () { handleAction('window_close'); });

  // 状态卡片：每节点取各自历史最新一条；无数据显示占位
  function renderCards() {
    const wrap = document.getElementById('cards');
    wrap.innerHTML = '';
    NODES.forEach(function (n) {
      const el = document.createElement('div');
      el.className = 'card';
      const rec = historyMap[n][historyMap[n].length - 1];
      if (!rec) {
        el.innerHTML = '<div class="card-head">' + n + '</div>' +
          '<div class="card-placeholder">等待数据…</div>';
      } else {
        el.innerHTML =
          '<div class="card-head">' + n + '</div>' +
          '<div class="card-temp">' + rec.temperature + '<span>℃</span></div>' +
          '<div class="card-hum">湿度 ' + rec.humidity + '%</div>' +
          '<span class="badge ' + STATUS_CLASS[rec.status] + '">' + rec.status + '</span>' +
          '<div class="card-time">' + rec.time + '</div>';
      }
      wrap.appendChild(el);
    });
  }

  // Canvas 趋势图：当前选中节点的温度（左轴）+ 湿度（右轴）双折线
  function renderChart() {
    const data = historyMap[selectedNode].slice(-CHART_MAX);
    const canvas = document.getElementById('trend');
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const padL = 44;
    const padR = 44;
    const padT = 20;
    const padB = 30;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    ctx.clearRect(0, 0, W, H);

    // 网格与纵轴刻度：温度 0~50（左）、湿度 0~100（右）
    ctx.strokeStyle = '#2b3448';
    ctx.fillStyle = '#6b7385';
    ctx.font = '11px sans-serif';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padT + plotH - (plotH * i / 5);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();
      ctx.fillText(String(i * 10), 6, y + 4);
      ctx.fillText(String(i * 20), W - padR + 6, y + 4);
    }

    if (!data.length) return;

    const xFor = function (i) {
      return padL + (data.length === 1 ? plotW / 2 : plotW * i / (data.length - 1));
    };
    const yTemp = function (t) { return padT + plotH - (plotH * t / 50); };
    const yHum = function (h) { return padT + plotH - (plotH * h / 100); };

    // 湿度折线
    ctx.strokeStyle = '#1a8a8a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    data.forEach(function (r, i) {
      const x = xFor(i);
      if (i === 0) ctx.moveTo(x, yHum(r.humidity));
      else ctx.lineTo(x, yHum(r.humidity));
    });
    ctx.stroke();

    // 温度折线
    ctx.strokeStyle = '#4a90d9';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    data.forEach(function (r, i) {
      const x = xFor(i);
      if (i === 0) ctx.moveTo(x, yTemp(r.temperature));
      else ctx.lineTo(x, yTemp(r.temperature));
    });
    ctx.stroke();

    // 横轴时间标签（HH:mm，最多约 6 个）
    const step = Math.max(1, Math.ceil(data.length / 6));
    ctx.fillStyle = '#6b7385';
    data.forEach(function (r, i) {
      if (i % step !== 0 && i !== data.length - 1) return;
      const label = r.time.slice(11, 16);
      ctx.fillText(label, xFor(i) - 14, H - 8);
    });

    document.getElementById('chart-node').textContent = selectedNode;
  }

  // 节点切换
  document.getElementById('tabs').addEventListener('click', function (e) {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    selectedNode = btn.dataset.node;
    document.querySelectorAll('.tab').forEach(function (b) {
      b.classList.toggle('active', b === btn);
    });
    renderChart();
  });

  // ---- MQTT 连接（mqtt.js，vendor/mqtt.min.js） ----
  const statusEl = document.getElementById('mqtt-status');

  function setStatus(connected) {
    statusEl.textContent = connected ? '已连接' : '未连接';
    statusEl.className = connected ? 'mqtt-on' : 'mqtt-off';
  }

  let mqttClient = null;

  function initMQTT() {
    if (typeof mqtt === 'undefined') {
      setStatus(false);
      return;
    }
    const client = mqtt.connect(MQTT_URL);
    mqttClient = client;

    client.on('connect', function () {
      setStatus(true);
      client.subscribe(SUB_TOPIC, function (err) {
        if (err) setStatus(false);
      });
    });

    client.on('message', function (_topic, payload) {
      let msg;
      try {
        msg = JSON.parse(payload.toString());
      } catch (err) {
        return; // 非 JSON 消息忽略，不崩溃
      }
      // payload 必须包含 nodeId 字段，且为已注册节点；缺失/未知 → 忽略
      if (typeof msg.nodeId !== 'string' || !NODES.includes(msg.nodeId)) {
        return;
      }
      if (typeof msg.temperature !== 'number' || typeof msg.humidity !== 'number') {
        return; // 字段缺失/类型错误，忽略
      }
      updateNode(msg.nodeId, {
        nodeId: msg.nodeId,
        temperature: msg.temperature,
        humidity: msg.humidity,
        // 丢弃消息中的 status，强制用温湿度经 judgeEnv 计算
        status: judgeEnv(msg.temperature, msg.humidity),
        time: typeof msg.time === 'string' ? msg.time : formatLocalISO(new Date())
      });
    });

    client.on('error', function () { setStatus(false); });
    client.on('close', function () { setStatus(false); });
    // 断线重连由 mqtt.js 自动处理
  }

  // 测试/接缝暴露
  window.judgeEnv = judgeEnv;
  window.updateNode = updateNode;
  window.historyMap = historyMap;
  window.getSelectedNode = function () { return selectedNode; };
  window.computeAttention = computeAttention;
  window.nodeAttention = nodeAttention;
  window.actionLog = actionLog;
  window.nodeState = nodeState;
  window.eventChain = eventChain;
  window.incidents = incidents;

  renderCards();
  renderChart();
  renderAttention(computeAttention());
  renderIncidents();
  renderOverview();
  renderB2();
  renderDailySummary();
  initMQTT();

  // 每秒重算关注卡片与最高优先级节点：持续时间随真实时间增长，
  // 两处同一时刻刷新同一 durationSec 变量，数字保持一致
  setInterval(function () {
    renderAttention(computeAttention());
    renderB2();
  }, 1000);
})();
