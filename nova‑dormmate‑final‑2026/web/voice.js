// M3 语音：ASR 识别 + 固定指令触发已有功能
(function () {
  const startBtn = document.getElementById('voice-start');
  const transcriptEl = document.getElementById('voice-transcript');
  const msgEl = document.getElementById('voice-msg');

  // 固定指令集中定义（改指令只改这里）
  const COMMANDS = {
    '判断环境': submitForm
  };

  let recognition = null;

  function showMsg(text) {
    msgEl.textContent = text;
    msgEl.hidden = false;
  }

  function initRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      showMsg('当前浏览器不支持语音识别，请使用 Edge/Chrome');
      return null;
    }
    const rec = new SR();
    rec.lang = 'zh-CN';
    rec.interimResults = true;
    return rec;
  }

  function submitForm() {
    // 复用 script.js 的提交逻辑（validate → judgeEnv → showResult → addHistory）
    const form = document.getElementById('env-form');
    form.dispatchEvent(new Event('submit', { cancelable: true }));
  }

  // 指令匹配并执行（供识别结果与测试调用）
  function handleCommand(text) {
    const t = String(text || '').trim();
    if (!t) return false;
    for (const [cmd, action] of Object.entries(COMMANDS)) {
      if (t.includes(cmd)) {
        action();
        showMsg('识别到指令「' + cmd + '」，已执行');
        return true;
      }
    }
    showMsg('未匹配到指令，可说「判断环境」');
    return false;
  }

  // TTS：朗读内容随当前状态变化
  const STATUS_SPEECH = {
    '偏冷': '当前环境偏冷，注意保暖',
    '偏热': '当前环境偏热，注意防暑通风',
    '偏湿': '当前环境偏湿，建议除湿通风',
    '正常': '当前环境正常，体感舒适'
  };

  function speakStatus(status) {
    if (!('speechSynthesis' in window)) {
      showMsg('当前浏览器不支持语音朗读');
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(
      STATUS_SPEECH[status] || ('当前环境' + status)
    );
    u.lang = 'zh-CN';
    window.speechSynthesis.speak(u);
  }

  // 判断结果变化（script.js 在 showResult 后派发）→ 朗读对应状态
  document.addEventListener('statuschange', function (e) {
    speakStatus(e.detail);
  });

  startBtn.addEventListener('click', function () {
    if (!recognition) {
      recognition = initRecognition();
      if (!recognition) return;
      recognition.onresult = function (e) {
        let finalText = '';
        let interimText = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript;
          else interimText += r[0].transcript;
        }
        transcriptEl.textContent = (finalText + interimText).trim();
        if (finalText.trim()) {
          handleCommand(finalText.trim());
        }
      };
      recognition.onend = function () {
        startBtn.textContent = '开始语音';
      };
      recognition.onerror = function (ev) {
        showMsg('语音识别出错：' + ev.error);
        startBtn.textContent = '开始语音';
      };
    }
    recognition.start();
    startBtn.textContent = '聆听中…';
    showMsg('请说指令，如「判断环境」');
  });

  window.handleCommand = handleCommand;
  window.voiceCommands = COMMANDS;
  window.speakStatus = speakStatus;
})();
