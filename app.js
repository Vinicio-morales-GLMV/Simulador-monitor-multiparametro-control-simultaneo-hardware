const canvas = document.getElementById("ecgCanvas");
const ctx = canvas.getContext("2d");
const plethCanvas = document.getElementById("plethCanvas");
const plethCtx = plethCanvas.getContext("2d");
const respCanvas = document.getElementById("respCanvas");
const respCtx = respCanvas.getContext("2d");

const bpmValue = document.getElementById("bpmValue");
const bpmValueSide = document.getElementById("bpmValueSide");
const spo2Value = document.getElementById("spo2Value");
const paValue = document.getElementById("paValue");
const tempValue = document.getElementById("tempValue");
const alertBox = document.getElementById("alertBox");
const logBox = document.getElementById("logBox");
const modeLabel = document.getElementById("modeLabel");
const serialStatus = document.getElementById("serialStatus");
const clock = document.getElementById("clock");

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const connectBtn = document.getElementById("connectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");

const bpmBase = document.getElementById("bpmBase");
const spo2Base = document.getElementById("spo2Base");
const paSysBase = document.getElementById("paSysBase");
const paDiaBase = document.getElementById("paDiaBase");
const tempBase = document.getElementById("tempBase");
const scenarioSelect = document.getElementById("scenarioSelect");
const alarmToggle = document.getElementById("alarmToggle");

const bpmBaseLabel = document.getElementById("bpmBaseLabel");
const spo2BaseLabel = document.getElementById("spo2BaseLabel");
const paSysBaseLabel = document.getElementById("paSysBaseLabel");
const paDiaBaseLabel = document.getElementById("paDiaBaseLabel");
const tempBaseLabel = document.getElementById("tempBaseLabel");

const LIMITS = {
  BPM_MIN: 60,
  BPM_MAX: 100,
  SPO2_MIN: 95,
  PA_SYS_MIN: 90,
  PA_SYS_MAX: 140,
  PA_DIA_MIN: 60,
  PA_DIA_MAX: 90,
  TEMP_MIN: 36.5,
  TEMP_MAX: 37.5,
};

const state = {
  bpm: 80,
  spo2: 97,
  paSys: 120,
  paDia: 80,
  temp: 37.0,
  running: false,
  mode: "sim",
  est: null,
};

let animationId = null;
let dataTimer = null;
let ecgX = 0;
let previousY = canvas.height / 2;
let gridReady = false;
let plethX = 0;
let respX = 0;
let plethPrev = plethCanvas.height / 2;
let respPrev = respCanvas.height / 2;
let audioCtx = null;
let alarmTimer = null;

let port = null;
let reader = null;
let readLoopAbort = false;

function log(message) {
  const stamp = new Date().toLocaleTimeString();
  logBox.textContent = `[${stamp}] ${message}\n` + logBox.textContent;
}

function updateLabels() {
  bpmBaseLabel.textContent = bpmBase.value;
  spo2BaseLabel.textContent = spo2Base.value;
  paSysBaseLabel.textContent = paSysBase.value;
  paDiaBaseLabel.textContent = paDiaBase.value;
  tempBaseLabel.textContent = (Number(tempBase.value) / 10).toFixed(1);
}

function smooth(current, target, factor = 0.2) {
  return current + (target - current) * factor;
}

function simulateVitals() {
  const baseBpm = Number(bpmBase.value);
  const baseSpo2 = Number(spo2Base.value);
  const basePaSys = Number(paSysBase.value);
  const basePaDia = Number(paDiaBase.value);
  const baseTemp = Number(tempBase.value) / 10;

  let bpmTarget = baseBpm;
  let spo2Target = baseSpo2;
  let paSysTarget = basePaSys;
  let paDiaTarget = basePaDia;
  let tempTarget = baseTemp;

  const scenario = scenarioSelect.value;
  if (scenario === "shock") {
    spo2Target -= 6;
    paSysTarget -= 25;
    paDiaTarget -= 15;
    bpmTarget += 18;
  }
  if (scenario === "sepsis") {
    tempTarget += 1.5;
    bpmTarget += 12;
    spo2Target -= 4;
    paSysTarget -= 10;
  }
  if (scenario === "asma") {
    spo2Target -= 8;
    bpmTarget += 10;
  }
  if (scenario === "iam") {
    bpmTarget += 6;
    paSysTarget -= 8;
    spo2Target -= 2;
  }

  if (spo2Target < 95) bpmTarget += 4;
  if (spo2Target < 90) bpmTarget += 8;
  if (spo2Target < 90) paSysTarget += 4;
  if (spo2Target < 85) {
    paSysTarget -= 10;
    paDiaTarget -= 6;
  }

  if (tempTarget > 38.0) {
    bpmTarget += (tempTarget - 37.0) * 10;
    spo2Target -= (tempTarget - 37.0) * 0.6;
  }
  if (tempTarget < 35.0) {
    bpmTarget -= (35.0 - tempTarget) * 8;
    paSysTarget -= (35.0 - tempTarget) * 5;
    paDiaTarget -= (35.0 - tempTarget) * 3;
  }

  if (paSysTarget < 90 || paDiaTarget < 60) {
    bpmTarget += 10;
  }

  bpmTarget += randomNoise(5);
  spo2Target += randomNoise(1.5);
  paSysTarget += randomNoise(4);
  paDiaTarget += randomNoise(3);
  tempTarget += randomNoise(0.1);

  state.bpm = Math.round(smooth(state.bpm, clamp(bpmTarget, 35, 180)));
  state.spo2 = Math.round(smooth(state.spo2, clamp(spo2Target, 70, 100)));
  state.paSys = Math.round(smooth(state.paSys, clamp(paSysTarget, 70, 190)));
  state.paDia = Math.round(smooth(state.paDia, clamp(paDiaTarget, 40, 130)));
  state.temp = Number(smooth(state.temp, clamp(tempTarget, 32, 42)).toFixed(1));
}

function randomNoise(max) {
  return (Math.random() * 2 - 1) * max;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function drawEcgFrame() {
  const width = canvas.width;
  const height = canvas.height;
  const center = height / 2;

  if (!gridReady) {
    drawGrid();
    gridReady = true;
  }

  const time = performance.now() / 1000;
  const bpm = Math.max(40, state.bpm);
  const beatPeriod = 60 / bpm;
  const phase = (time % beatPeriod) / beatPeriod;

  const baseline = Math.sin(time * 2) * 2;
  const wave = ecgWave(phase);
  const y = center - wave * 30 + baseline;

  ctx.strokeStyle = "#3ef5b3";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(ecgX - 1, previousY);
  ctx.lineTo(ecgX, y);
  ctx.stroke();

  previousY = y;
  ecgX += 1;

  if (ecgX >= width) {
    ecgX = 0;
    gridReady = false;
  }

}

function ecgWave(phase) {
  const p = 0.12 * gaussian(phase, 0.18, 0.025);
  const q = -0.18 * gaussian(phase, 0.24, 0.012);
  const r = 1.0 * gaussian(phase, 0.26, 0.008);
  const s = -0.35 * gaussian(phase, 0.30, 0.012);
  const t = 0.35 * gaussian(phase, 0.45, 0.04);
  return p + q + r + s + t;
}

function gaussian(x, mu, sigma) {
  const z = (x - mu) / sigma;
  return Math.exp(-z * z);
}

function drawPlethFrame() {
  const width = plethCanvas.width;
  const height = plethCanvas.height;
  const center = height / 2;

  if (plethX === 0) drawSmallGrid(plethCtx, width, height);

  const time = performance.now() / 1000;
  const bpm = Math.max(40, state.bpm);
  const beatPeriod = 60 / bpm;
  const phase = (time % beatPeriod) / beatPeriod;

  let y = center + Math.sin(time * 6) * 2;
  if (phase < 0.2) {
    y = center - 30 * Math.sin((phase / 0.2) * Math.PI);
  } else if (phase < 0.35) {
    y = center + 12 * Math.sin(((phase - 0.2) / 0.15) * Math.PI);
  }

  plethCtx.strokeStyle = "#4cc9ff";
  plethCtx.lineWidth = 2;
  plethCtx.beginPath();
  plethCtx.moveTo(plethX - 1, plethPrev);
  plethCtx.lineTo(plethX, y);
  plethCtx.stroke();

  plethPrev = y;
  plethX += 2;
  if (plethX >= width) plethX = 0;
}

function drawRespFrame() {
  const width = respCanvas.width;
  const height = respCanvas.height;
  const center = height / 2;

  if (respX === 0) drawSmallGrid(respCtx, width, height);

  const time = performance.now() / 1000;
  const rate = 12 + Math.max(0, (state.temp - 37)) * 2;
  const y = center + Math.sin(time * (rate / 60) * Math.PI * 2) * 25;

  respCtx.strokeStyle = "#f3ba4a";
  respCtx.lineWidth = 2;
  respCtx.beginPath();
  respCtx.moveTo(respX - 1, respPrev);
  respCtx.lineTo(respX, y);
  respCtx.stroke();

  respPrev = y;
  respX += 2;
  if (respX >= width) respX = 0;
}

function drawGrid() {
  const width = canvas.width;
  const height = canvas.height;
  const minor = 10;
  const major = 50;

  ctx.fillStyle = "#020406";
  ctx.fillRect(0, 0, width, height);

  for (let x = 0; x <= width; x += minor) {
    ctx.strokeStyle = x % major === 0 ? "#0f2a3a" : "#07151f";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = 0; y <= height; y += minor) {
    ctx.strokeStyle = y % major === 0 ? "#0f2a3a" : "#07151f";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawSmallGrid(context, width, height) {
  const minor = 10;
  const major = 50;
  context.fillStyle = "#020406";
  context.fillRect(0, 0, width, height);
  for (let x = 0; x <= width; x += minor) {
    context.strokeStyle = x % major === 0 ? "#0f2a3a" : "#07151f";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 0; y <= height; y += minor) {
    context.strokeStyle = y % major === 0 ? "#0f2a3a" : "#07151f";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
}

function updateUI() {
  bpmValue.textContent = `${state.bpm}`;
  bpmValueSide.textContent = `${state.bpm}`;
  spo2Value.textContent = `${state.spo2}%`;
  paValue.textContent = `${state.paSys}/${state.paDia}`;
  tempValue.textContent = `${state.temp.toFixed(1)} C`;

  const status = resolveStatus();
  alertBox.textContent = `ESTADO: ${status}`;
  alertBox.classList.remove("warn", "critical");
  if (status === "PRECAUCION") alertBox.classList.add("warn");
  if (status === "CRITICO") alertBox.classList.add("critical");

  updateAlarm(status);
}

function resolveStatus() {
  if (state.mode === "serial" && state.est) {
    if (state.est === "C") return "CRITICO";
    if (state.est === "P") return "PRECAUCION";
    if (state.est === "N") return "NORMAL";
  }
  return evaluateStatus();
}

function evaluateStatus() {
  let abnormal = 0;
  let critical = false;

  if (state.bpm < 60 || state.bpm > 100) {
    abnormal += 1;
    if (state.bpm < 40 || state.bpm > 150) critical = true;
  }
  if (state.spo2 < LIMITS.SPO2_MIN) {
    abnormal += 1;
    if (state.spo2 < 90) critical = true;
  }
  if (
    state.paSys < LIMITS.PA_SYS_MIN ||
    state.paSys > LIMITS.PA_SYS_MAX ||
    state.paDia < LIMITS.PA_DIA_MIN ||
    state.paDia > LIMITS.PA_DIA_MAX
  ) {
    abnormal += 1;
    if (state.paSys < 80 || state.paSys > 160 || state.paDia < 50) {
      critical = true;
    }
  }
  if (state.temp < LIMITS.TEMP_MIN || state.temp > LIMITS.TEMP_MAX) {
    abnormal += 1;
    if (state.temp < 35.0 || state.temp > 39.0) critical = true;
  }

  if (critical) return "CRITICO";
  if (abnormal >= 2) return "PRECAUCION";
  if (abnormal === 1) return "PRECAUCION";
  return "NORMAL";
}

function start() {
  if (state.running) return;
  state.running = true;
  startBtn.disabled = true;
  stopBtn.disabled = false;
  log("Simulador iniciado");

  if (!dataTimer) {
    dataTimer = setInterval(() => {
      if (state.mode === "sim") simulateVitals();
      updateUI();
    }, 200);
  }

  if (!animationId) {
    const loop = () => {
      drawEcgFrame();
      drawPlethFrame();
      drawRespFrame();
      animationId = requestAnimationFrame(loop);
    };
    animationId = requestAnimationFrame(loop);
  }
}

function stop() {
  state.running = false;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  log("Simulador detenido");

  if (dataTimer) {
    clearInterval(dataTimer);
    dataTimer = null;
  }
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  stopAlarm();
}

function setMode(mode) {
  state.mode = mode;
  modeLabel.textContent = mode === "sim" ? "SIM" : "SERIAL";
}

async function connectSerial() {
  if (!("serial" in navigator)) {
    log("Web Serial no disponible en este navegador");
    return;
  }
  try {
    port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });
    reader = port.readable
      .pipeThrough(new TextDecoderStream())
      .getReader();
    readLoopAbort = false;
    setMode("serial");
    serialStatus.textContent = "SERIAL ON";
    connectBtn.disabled = true;
    disconnectBtn.disabled = false;
    log("Serial conectado");
    start();
    readSerialLoop();
  } catch (err) {
    log(`Error al conectar: ${err.message}`);
  }
}

async function disconnectSerial() {
  try {
    readLoopAbort = true;
    if (reader) {
      await reader.cancel();
      reader = null;
    }
    if (port) {
      await port.close();
      port = null;
    }
    setMode("sim");
    serialStatus.textContent = "SERIAL OFF";
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
    log("Serial desconectado");
  } catch (err) {
    log(`Error al desconectar: ${err.message}`);
  }
}

async function readSerialLoop() {
  let buffer = "";
  while (!readLoopAbort && reader) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      parseSerialLine(line.trim());
    }
  }
}

function parseSerialLine(line) {
  if (!line) return;
  log(line);

  if (line.includes("BPM=")) {
    parseCompactLine(line);
    return;
  }

  const bpmMatch = line.match(/Frecuencia\s*Card[ií]aca:\s*(\d+)/i);
  if (bpmMatch) state.bpm = Number(bpmMatch[1]);

  const spo2Match = line.match(/Saturaci[oó]n\s*O2:\s*(\d+)/i);
  if (spo2Match) state.spo2 = Number(spo2Match[1]);

  const paMatch = line.match(/Presi[oó]n\s*Arterial:\s*(\d+)\s*\/\s*(\d+)/i);
  if (paMatch) {
    state.paSys = Number(paMatch[1]);
    state.paDia = Number(paMatch[2]);
  }

  const tempMatch = line.match(/Temperatura:\s*([\d.]+)/i);
  if (tempMatch) state.temp = Number(tempMatch[1]);
}

function parseCompactLine(line) {
  const parts = line.split(",");
  for (const part of parts) {
    const [key, valueRaw] = part.split("=");
    if (!key || !valueRaw) continue;
    const value = valueRaw.trim();
    const upper = key.trim().toUpperCase();

    if (upper === "BPM") state.bpm = Number(value);
    if (upper === "SPO2") state.spo2 = Number(value);
    if (upper === "PA") {
      const [sys, dia] = value.split("/");
      if (sys && dia) {
        state.paSys = Number(sys);
        state.paDia = Number(dia);
      }
    }
    if (upper === "T") state.temp = Number(value);
    if (upper === "EST") state.est = value.trim().toUpperCase();
  }
}

function bindEvents() {
  startBtn.addEventListener("click", start);
  stopBtn.addEventListener("click", stop);
  connectBtn.addEventListener("click", connectSerial);
  disconnectBtn.addEventListener("click", disconnectSerial);

  const inputs = [bpmBase, spo2Base, paSysBase, paDiaBase, tempBase];
  inputs.forEach((input) =>
    input.addEventListener("input", () => {
      updateLabels();
      if (state.mode === "sim") updateUI();
    })
  );

  scenarioSelect.addEventListener("change", () => {
    log(`Escenario: ${scenarioSelect.options[scenarioSelect.selectedIndex].text}`);
    if (state.mode === "sim") updateUI();
  });

  alarmToggle.addEventListener("change", () => {
    updateUI();
  });
}

function init() {
  updateLabels();
  updateUI();
  bindEvents();
  updateClock();
  setInterval(updateClock, 1000);

  if (!("serial" in navigator)) {
    serialStatus.textContent = "SERIAL N/A";
    connectBtn.disabled = true;
    log("Web Serial no esta disponible. Use Chrome/Edge/Vivaldi.");
  }
}

init();

function updateClock() {
  const now = new Date();
  clock.textContent = now.toLocaleTimeString();
}

function updateAlarm(status) {
  if (!alarmToggle.checked) {
    stopAlarm();
    return;
  }
  if (status === "CRITICO") {
    startAlarm(1000, 300);
  } else if (status === "PRECAUCION") {
    startAlarm(600, 120);
  } else {
    stopAlarm();
  }
}

function startAlarm(freq, duration) {
  if (alarmTimer) return;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  alarmTimer = setInterval(() => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      osc.disconnect();
    }, duration);
  }, 700);
}

function stopAlarm() {
  if (alarmTimer) {
    clearInterval(alarmTimer);
    alarmTimer = null;
  }
}
