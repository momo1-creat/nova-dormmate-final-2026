// M3 Camera：请求摄像头权限 → video 预览 → ImageCapture.takePhoto 拍照 → canvas 导出
(function () {
  const video = document.getElementById('camera-video');
  const startBtn = document.getElementById('camera-start');
  const snapBtn = document.getElementById('camera-snap');
  const downloadBtn = document.getElementById('camera-download');
  const snapshotImg = document.getElementById('snapshot');
  const msgEl = document.getElementById('camera-msg');
  const canvas = document.createElement('canvas');

  let stream = null;
  let imageCapture = null;

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

      // 用摄像头轨道创建 ImageCapture（拍照使用 takePhoto 抓帧，
      // 不经 drawImage(video) 的 YUV 转换，避免快照偏色）
      const track = stream.getVideoTracks()[0];
      if (window.ImageCapture) {
        imageCapture = new ImageCapture(track);
      } else {
        showMsg('当前浏览器不支持 ImageCapture，请使用最新版 Edge/Chrome');
      }

      snapBtn.disabled = false;
      showMsg('摄像头已开启');
    } catch (err) {
      showMsg('无法开启摄像头：' +
        (err.name === 'NotAllowedError' ? '权限被拒绝' : err.message));
    }
  });

  snapBtn.addEventListener('click', async function () {
    if (!video.videoWidth || video.readyState < 2) return;
    if (!imageCapture) {
      showMsg('浏览器不支持 ImageCapture，无法拍照');
      return;
    }

    // 1. ImageCapture.takePhoto() 获取照片 Blob
    let blob;
    try {
      blob = await imageCapture.takePhoto();
    } catch (err) {
      showMsg('拍照失败：' + err.message);
      return;
    }

    // 2. Blob 转 Image 对象
    const img = await new Promise(function (resolve, reject) {
      const image = new Image();
      image.onload = function () { resolve(image); };
      image.onerror = function () { reject(new Error('照片加载失败')); };
      image.src = URL.createObjectURL(blob);
    });

    // 3. 把 Image 对象画到 canvas（尺寸以照片为准）
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { colorSpace: 'srgb' });
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(img.src);

    // 4. canvas 导出：toDataURL 用于页面展示，下载同样取 canvas 数据
    snapshotImg.src = canvas.toDataURL('image/png');
    snapshotImg.hidden = false;
    downloadBtn.disabled = false;
    showMsg('快照已保存（takePhoto）');
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
