// M3 Camera：请求摄像头权限 → video 预览 → canvas 快照 → PNG 下载
(function () {
  const video = document.getElementById('camera-video');
  const startBtn = document.getElementById('camera-start');
  const snapBtn = document.getElementById('camera-snap');
  const downloadBtn = document.getElementById('camera-download');
  const snapshotImg = document.getElementById('snapshot');
  const msgEl = document.getElementById('camera-msg');
  const canvas = document.createElement('canvas');

  let stream = null;

  function showMsg(text) {
    msgEl.textContent = text;
    msgEl.hidden = false;
  }

  startBtn.addEventListener('click', async function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showMsg('当前浏览器不支持摄像头，请使用 Edge/Chrome 并通过 localhost 打开');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;
      await video.play();
      snapBtn.disabled = false;
      showMsg('摄像头已开启');
    } catch (err) {
      showMsg('无法开启摄像头：' +
        (err.name === 'NotAllowedError' ? '权限被拒绝' : err.message));
    }
  });

  snapBtn.addEventListener('click', function () {
    if (!video.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    snapshotImg.src = canvas.toDataURL('image/png');
    snapshotImg.hidden = false;
    downloadBtn.disabled = false;
    showMsg('快照已保存');
  });

  downloadBtn.addEventListener('click', function () {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'snapshot.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });
})();
