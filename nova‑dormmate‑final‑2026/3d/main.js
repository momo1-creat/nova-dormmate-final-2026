// M6 3D：Three.js 简化宿舍场景（scene + camera + renderer + 基本几何体）
// 普通 script 加载（UMD），双击 file:// 可直接打开；轨道控制为自写简易实现
(function () {
  const container = document.getElementById('scene-container');

  // 1. 三要素：scene + camera + renderer
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1c2230);

  const camera = new THREE.PerspectiveCamera(
    55, container.clientWidth / container.clientHeight, 0.1, 100);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true // 便于自动化测试读取画面
  });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  // 2. 光照
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(5, 10, 5);
  scene.add(dirLight);

  // 3. 简化宿舍（全部基本几何体，不追求精细建模）
  function box(w, h, d, color, x, y, z) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color })
    );
    mesh.position.set(x, y, z);
    scene.add(mesh);
    return mesh;
  }

  // 地面（房间底板）
  box(8, 0.2, 8, 0x8a93a5, 0, -0.1, 0);
  // 床：床垫 + 枕头
  box(2.2, 0.5, 3.5, 0x6f9fd8, -2, 0.25, -1.5);
  box(0.6, 0.25, 1.2, 0xffffff, -2.5, 0.65, -2.4);
  // 书桌：桌面 + 4 条桌腿
  box(2.4, 0.15, 1.2, 0xa5805a, 2, 1.0, -1);
  [[-1.05, -0.45], [1.05, -0.45], [-1.05, 0.45], [1.05, 0.45]].forEach(function (off) {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 1.0, 12),
      new THREE.MeshLambertMaterial({ color: 0x5c4a33 })
    );
    leg.position.set(2 + off[0], 0.5, -1 + off[1]);
    scene.add(leg);
  });

  // 风扇：底座 + 立柱 + 电机 + 三片扇叶（书桌旁地面，Group 便于后续动画）
  const fan = new THREE.Group();
  fan.name = 'fan';
  const fanBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.45, 0.08, 24),
    new THREE.MeshLambertMaterial({ color: 0x555e6b })
  );
  fanBase.position.y = 0.04;
  fan.add(fanBase);
  const fanPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 1.2, 12),
    new THREE.MeshLambertMaterial({ color: 0x555e6b })
  );
  fanPole.position.y = 0.64;
  fan.add(fanPole);
  const fanMotor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.14, 0.16, 20),
    new THREE.MeshLambertMaterial({ color: 0x3a4250 })
  );
  fanMotor.position.y = 1.28;
  fan.add(fanMotor);
  const fanBlades = new THREE.Group();
  fanBlades.position.y = 1.28;
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.03, 0.12),
      new THREE.MeshLambertMaterial({ color: 0xd8dee7 })
    );
    blade.rotation.y = (i * Math.PI * 2) / 3;
    fanBlades.add(blade);
  }
  fan.add(fanBlades);
  fan.position.set(0.3, 0, -0.7);
  scene.add(fan);

  // 窗口：后墙 + 窗框 + 半透明玻璃
  const backWall = box(8, 3, 0.2, 0x6b7486, 0, 1.5, -4);
  backWall.name = 'back-wall';
  [[2, 0.1, 0.24, 0, 2.2], [2, 0.1, 0.24, 0, 1.0],
   [0.1, 1.2, 0.24, -0.95, 1.6], [0.1, 1.2, 0.24, 0.95, 1.6]].forEach(function (f) {
    box(f[0], f[1], f[2], 0x9aa3b2, f[3], f[4], -3.85);
  });
  const winGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 1.0),
    new THREE.MeshLambertMaterial({
      color: 0x9fd4e8, transparent: true, opacity: 0.45, side: THREE.DoubleSide
    })
  );
  winGlass.position.set(0, 1.6, -3.8);
  winGlass.name = 'window-glass';
  scene.add(winGlass);

  // 窗口雾气层：Canvas 生成斑驳雾斑纹理，偏湿时覆盖在玻璃上（起雾效果）
  const fogCanvas = document.createElement('canvas');
  fogCanvas.width = 256;
  fogCanvas.height = 128;
  const fctx = fogCanvas.getContext('2d');
  fctx.fillStyle = '#ffffff';
  fctx.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 128;
    const r = 6 + Math.random() * 22;
    const g = fctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    fctx.fillStyle = g;
    fctx.beginPath();
    fctx.arc(x, y, r, 0, Math.PI * 2);
    fctx.fill();
  }
  const fogTexture = new THREE.CanvasTexture(fogCanvas);
  const fogPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 1.0),
    new THREE.MeshLambertMaterial({
      map: fogTexture, transparent: true, opacity: 0.9, side: THREE.DoubleSide
    })
  );
  fogPlane.position.set(0, 1.6, -3.75);
  fogPlane.name = 'window-fog';
  fogPlane.visible = false;
  scene.add(fogPlane);

  // 窗帘：偏冷时关闭窗户（覆盖窗口），其余状态开窗
  const shutter = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 1.1),
    new THREE.MeshLambertMaterial({ color: 0x9aa3b2, side: THREE.DoubleSide })
  );
  shutter.position.set(0, 1.6, -3.72);
  shutter.name = 'window-shutter';
  shutter.visible = false;
  scene.add(shutter);

  // 两个可区分传感器节点：红球 dorm-a、蓝立方体 dorm-b（放桌面上）
  const nodeA = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 24, 24),
    new THREE.MeshLambertMaterial({ color: 0xe05a4a })
  );
  nodeA.position.set(1.6, 1.3, -1);
  nodeA.name = 'node-dorm-a';
  scene.add(nodeA);

  const nodeB = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.35, 0.35),
    new THREE.MeshLambertMaterial({ color: 0x4a90d9 })
  );
  nodeB.position.set(2.4, 1.25, -1);
  nodeB.name = 'node-dorm-b';
  scene.add(nodeB);

  // 3.5 状态 → 场景可见变化映射（颜色/旋转/窗口/缩放）
  let fanSpeed = 0;
  const STATUS_THEME = {
    '正常': { bg: 0x1c2230, light: 0xffffff, fanSpeed: 0, glassColor: 0x9fd4e8, glassOpacity: 0.45, nodeScale: 1.0, wallColor: 0x6b7486, shutterVisible: false },
    '偏热': { bg: 0x3c1f1a, light: 0xe05a4a, fanSpeed: 12, glassColor: 0x9fd4e8, glassOpacity: 0.45, nodeScale: 1.3, wallColor: 0x6b7486, shutterVisible: false },
    '偏湿': { bg: 0x16302e, light: 0x1a8a8a, fanSpeed: 0, glassColor: 0xe8ecf3, glassOpacity: 0.85, nodeScale: 1.1, wallColor: 0x6b7486, shutterVisible: false },
    '偏冷': { bg: 0x16283c, light: 0x4a90d9, fanSpeed: 0, glassColor: 0x9fd4e8, glassOpacity: 0.45, nodeScale: 0.8, wallColor: 0xa8c8ec, shutterVisible: true }
  };

  const STATUS_CLASS = {
    '偏冷': 'status-cold',
    '偏热': 'status-hot',
    '偏湿': 'status-humid',
    '正常': 'status-normal'
  };
  const curStatusEl = document.getElementById('cur-status');

  function setStatusDisplay(status) {
    curStatusEl.textContent = status;
    curStatusEl.className = STATUS_CLASS[status] || 'status-normal';
  }

  // A2 设备控制覆盖状态（控制指令优先于状态映射）
  let controlFanOn = false;
  let controlWindowClosed = false;
  let currentStatus = '正常';

  function updateScene(status) {
    currentStatus = status;
    const theme = STATUS_THEME[status] || STATUS_THEME['正常'];
    scene.background.setHex(theme.bg);
    ambientLight.color.setHex(theme.light);
    // 风扇只由传感器状态驱动：偏热转动，其余状态停止（control 指令不覆盖此规则）
    fanSpeed = theme.fanSpeed;
    winGlass.material.color.setHex(theme.glassColor);
    winGlass.material.opacity = theme.glassOpacity;
    fogPlane.visible = (status === '偏湿');
    nodeA.scale.setScalar(theme.nodeScale);
    backWall.material.color.setHex(theme.wallColor);
    shutter.visible = controlWindowClosed ? true : theme.shutterVisible;
    setStatusDisplay(status);
  }

  // 4. 简易轨道控制：拖拽旋转（球坐标）+ 滚轮缩放
  const orbit = {
    theta: Math.PI / 4,      // 方位角
    phi: Math.PI / 3,        // 极角（与水平面夹角）
    radius: 11,
    target: new THREE.Vector3(0, 0.5, 0)
  };
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function applyOrbit() {
    camera.position.set(
      orbit.target.x + orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta),
      orbit.target.y + orbit.radius * Math.cos(orbit.phi),
      orbit.target.z + orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta)
    );
    camera.lookAt(orbit.target);
  }
  applyOrbit();

  renderer.domElement.addEventListener('mousedown', function (e) {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  window.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    orbit.theta -= (e.clientX - lastX) * 0.01;
    orbit.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05,
      orbit.phi - (e.clientY - lastY) * 0.01));
    lastX = e.clientX;
    lastY = e.clientY;
    applyOrbit();
  });
  window.addEventListener('mouseup', function () { dragging = false; });
  renderer.domElement.addEventListener('wheel', function (e) {
    e.preventDefault();
    orbit.radius = Math.max(4, Math.min(25,
      orbit.radius * (e.deltaY > 0 ? 1.1 : 0.9)));
    applyOrbit();
  }, { passive: false });

  // 5. 动画循环（含风扇扇叶按 fanSpeed 旋转）
  let frameCount = 0;
  let lastTime = performance.now();
  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const delta = (now - lastTime) / 1000;
    lastTime = now;
    fanBlades.rotation.y += fanSpeed * delta;
    renderer.render(scene, camera);
    frameCount++;
  }
  animate();

  // 6. 窗口尺寸自适应
  window.addEventListener('resize', function () {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  // 7. MQTT 驱动：订阅 dormmate/#，收到节点消息后按状态更新场景
  // 统一环境判断规则（与 web/script.js 逐条一致，status 缺失时兜底）
  function judgeEnv(temp, humidity) {
    if (temp < 18) return '偏冷';
    if (temp >= 30) return '偏热';
    if (humidity >= 75) return '偏湿';
    return '正常';
  }

  const NODES = ['dorm-a', 'dorm-b', 'dorm-c'];
  const statusEl = document.getElementById('mqtt-status');

  function setMqttStatus(connected) {
    statusEl.textContent = connected ? '已连接' : '未连接';
    statusEl.className = connected ? 'mqtt-on' : 'mqtt-off';
  }

  function initMQTT() {
    if (typeof mqtt === 'undefined') {
      setMqttStatus(false);
      return;
    }
    const client = mqtt.connect('ws://127.0.0.1:8083/mqtt');

    client.on('connect', function () {
      setMqttStatus(true);
      client.subscribe('dormmate/#', function (err) {
        if (err) setMqttStatus(false);
      });
    });

    client.on('message', function (_topic, payload) {
      // A3 处理状态同步：dormmate/attention/{nodeId} → 页面显示
      if (_topic.startsWith('dormmate/attention/')) {
        let att;
        try {
          att = JSON.parse(payload.toString());
        } catch (err) {
          return;
        }
        if (att && att.nodeId && att.state) {
          const STATE_TEXT = {
            'needs': '仍需关注',
            'processing': '处理中',
            'recovered': '已恢复',
            'normal': '正常'
          };
          const attEl = document.getElementById('cur-attention');
          attEl.textContent = STATE_TEXT[att.state] || att.state;
        }
        return;
      }
      // A2 控制消息：dormmate/control/{nodeId} → 设备联动
      if (_topic.startsWith('dormmate/control/')) {
        let control;
        try {
          control = JSON.parse(payload.toString());
        } catch (err) {
          return;
        }
        if (control.action === 'fan_on') controlFanOn = true;
        else if (control.action === 'window_close') controlWindowClosed = true;
        else return;
        updateScene(currentStatus);
        return;
      }
      // 传感器数据只认 env 主题；status 等链路派生消息忽略（避免重复驱动场景）
      if (!_topic.endsWith('/env')) return;
      let msg;
      try {
        msg = JSON.parse(payload.toString());
      } catch (err) {
        return; // 非 JSON 忽略
      }
      if (typeof msg.nodeId !== 'string' || !NODES.includes(msg.nodeId)) {
        return; // 缺 nodeId / 未知节点忽略
      }
      if (typeof msg.temperature !== 'number' || typeof msg.humidity !== 'number') {
        return; // 字段缺失忽略
      }
      // 更新当前节点显示；状态不信任消息中的 status 字段，始终由温湿度按统一规则计算
      document.getElementById('cur-node').textContent = msg.nodeId;
      updateScene(judgeEnv(msg.temperature, msg.humidity));
    });

    client.on('error', function () { setMqttStatus(false); });
    client.on('close', function () { setMqttStatus(false); });
    // 断线重连由 mqtt.js 自动处理
  }

  // 暴露给测试
  window.scene3d = scene;
  window.camera3d = camera;
  window.renderer3d = renderer;
  window.getFrameCount = function () { return frameCount; };
  window.updateScene = updateScene;
  window.getFanBlades = function () { return fanBlades; };
  window.getFanSpeed = function () { return fanSpeed; };
  window.judgeEnv = judgeEnv;
  window.getControlState = function () {
    return { fanOn: controlFanOn, windowClosed: controlWindowClosed };
  };

  // 初始状态：正常（风扇停、窗口默认）
  updateScene('正常');
  initMQTT();
})();
