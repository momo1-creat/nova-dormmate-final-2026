// M1 温湿度环境判断
// 统一环境判断规则（与 CLAUDE.md 一致）：
// 温度<18 → 偏冷；温度≥30 → 偏热；18≤温度<30 且湿度≥75 → 偏湿；其余 → 正常

const TEMP_MIN = 0;
const TEMP_MAX = 50;
const HUMIDITY_MIN = 0;
const HUMIDITY_MAX = 100;

const ADVICE = {
  '偏冷': '注意保暖，适当添加衣物或开启暖气',
  '偏热': '注意防暑，开窗通风或使用空调降温',
  '偏湿': '开启除湿，保持室内通风干燥',
  '正常': '环境舒适，保持现状即可'
};

// 历史记录：仅存内存数组，刷新页面后清空
let history = [];

const form = document.getElementById('env-form');
const tempInput = document.getElementById('temp');
const humidityInput = document.getElementById('humidity');
const errorEl = document.getElementById('error');
const resultEl = document.getElementById('result');
const statusEl = document.getElementById('status');
const adviceEl = document.getElementById('advice');
const historyListEl = document.getElementById('history-list');
const historyEmptyEl = document.getElementById('history-empty');

// 校验：非空 → 必须为数字 → 数值合理
function validate(tempStr, humidityStr) {
  if (tempStr.trim() === '' || humidityStr.trim() === '') {
    return { ok: false, error: '温度和湿度都不能为空' };
  }
  if (!isValidNumber(tempStr) || !isValidNumber(humidityStr)) {
    return { ok: false, error: '请输入有效的数字（支持小数）' };
  }
  const temp = Number(tempStr);
  const humidity = Number(humidityStr);
  if (temp < TEMP_MIN || temp > TEMP_MAX) {
    return { ok: false, error: `温度需在 ${TEMP_MIN}~${TEMP_MAX}℃ 之间` };
  }
  if (humidity < HUMIDITY_MIN || humidity > HUMIDITY_MAX) {
    return { ok: false, error: `湿度需在 ${HUMIDITY_MIN}~${HUMIDITY_MAX}% 之间` };
  }
  return { ok: true, temp, humidity };
}

// 只允许常规数字格式，拒绝 abc、12.3.4、--5 等
function isValidNumber(str) {
  return /^-?\d+(\.\d+)?$/.test(str.trim());
}

function judgeEnv(temp, humidity) {
  if (temp < 18) return '偏冷';
  if (temp >= 30) return '偏热';
  if (humidity >= 75) return '偏湿';
  return '正常';
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

// 状态 → 样式后缀映射
const statusMap = {
  '偏冷': 'cold',
  '偏热': 'hot',
  '偏湿': 'humid',
  '正常': 'normal'
};

function showResult(temp, humidity, status) {
  resultEl.hidden = false;
  resultEl.className = '';
  resultEl.classList.add('status-' + statusMap[status]);
  statusEl.textContent = status;
  adviceEl.textContent =
    `温度 ${temp}℃，湿度 ${humidity}% · ${ADVICE[status]}`;
}

function addHistory(temp, humidity, status) {
  history.push({
    time: formatLocalISO(new Date()),
    temp,
    humidity,
    status
  });
  renderHistory();
}

// ISO 8601 本地时间（YYYY-MM-DDTHH:mm:ss），按数据规范
function formatLocalISO(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// 展示全部记录（倒序，最新在前），旧记录保留在数组中不被覆盖
function renderHistory() {
  historyListEl.innerHTML = '';
  historyEmptyEl.hidden = history.length > 0;
  const recent = history.slice().reverse();
  for (const rec of recent) {
    const li = document.createElement('li');
    li.innerHTML =
      `<span class="rec-time">${rec.time}</span>` +
      `<span>${rec.temp}℃ / ${rec.humidity}%</span>` +
      `<span class="rec-status st-${statusMap[rec.status]}">${rec.status}</span>`;
    historyListEl.appendChild(li);
  }
}

form.addEventListener('submit', function (e) {
  e.preventDefault();
  errorEl.hidden = true;

  const result = validate(tempInput.value, humidityInput.value);
  if (!result.ok) {
    showError(result.error);
    return;
  }

  const status = judgeEnv(result.temp, result.humidity);
  showResult(result.temp, result.humidity, status);
  addHistory(result.temp, result.humidity, status);
});

// 初始渲染（空历史提示）
renderHistory();

// M2：导出 CSV（exportToCSV 由 ../analysis/export.js 提供）
const exportBtn = document.getElementById('export-btn');
exportBtn.addEventListener('click', function () {
  errorEl.hidden = true;
  if (history.length === 0) {
    showError('暂无历史记录可导出');
    return;
  }
  exportToCSV(history);
});
