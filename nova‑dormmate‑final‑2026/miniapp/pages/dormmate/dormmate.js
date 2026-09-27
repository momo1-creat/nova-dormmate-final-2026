// M4 小程序：DormMate 环境判断页
// 业务规则与 Web（web/script.js）完全一致：
// 温度 0~50、湿度 0~100；temp<18 偏冷 / temp>=30 偏热 / hum>=75 偏湿 / 其余正常
// 实现方式使用小程序原生 data / setData / bindinput / bindtap，不复制 Web DOM 代码

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

const STATUS_CLASS = {
  '偏冷': 'status-cold',
  '偏热': 'status-hot',
  '偏湿': 'status-humid',
  '正常': 'status-normal'
};

// 只允许常规数字格式，拒绝 abc、12.3.4、--5 等
function isValidNumber(str) {
  return /^-?\d+(\.\d+)?$/.test(String(str).trim());
}

// 校验：非空 → 必须为数字 → 数值合理；通过返回 { ok: true, temp, humidity }
function validate(tempStr, humidityStr) {
  if (String(tempStr).trim() === '' || String(humidityStr).trim() === '') {
    return { ok: false, error: '温度和湿度都不能为空' };
  }
  if (!isValidNumber(tempStr) || !isValidNumber(humidityStr)) {
    return { ok: false, error: '请输入有效的数字（支持小数）' };
  }
  const temp = Number(tempStr);
  const humidity = Number(humidityStr);
  if (temp < TEMP_MIN || temp > TEMP_MAX) {
    return { ok: false, error: '温度需在 0~50℃ 之间' };
  }
  if (humidity < HUMIDITY_MIN || humidity > HUMIDITY_MAX) {
    return { ok: false, error: '湿度需在 0~100% 之间' };
  }
  return { ok: true, temp, humidity };
}

// 统一环境判断规则（与 Web judgeEnv 逐条一致）
function judgeEnv(temp, humidity) {
  if (temp < 18) return '偏冷';
  if (temp >= 30) return '偏热';
  if (humidity >= 75) return '偏湿';
  return '正常';
}

Page({
  data: {
    temperature: '',
    humidity: '',
    status: '',
    advice: '',
    error: '',
    resultClass: ''
  },

  onTempInput(e) {
    this.setData({ temperature: e.detail.value });
  },

  onHumInput(e) {
    this.setData({ humidity: e.detail.value });
  },

  onAnalyze() {
    const result = validate(this.data.temperature, this.data.humidity);
    if (!result.ok) {
      this.setData({ error: result.error, status: '', advice: '', resultClass: '' });
      return;
    }
    const status = judgeEnv(result.temp, result.humidity);
    this.setData({
      error: '',
      status,
      advice: '温度 ' + result.temp + '℃，湿度 ' + result.humidity + '% · ' + ADVICE[status],
      resultClass: STATUS_CLASS[status]
    });
  }
});

// 导出纯函数供 Node 单测（小程序运行时忽略）
module.exports = { validate, judgeEnv, isValidNumber, ADVICE };
