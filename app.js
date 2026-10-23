(() => {
  'use strict';

  const CYCLE = 4;
  const MINUTE = 60 * 1000;

  const MODES = {
    focus: { label: '专注', duration: 25 * MINUTE },
    short: { label: '短休', duration: 5 * MINUTE },
    long: { label: '长休', duration: 15 * MINUTE },
  };

  const RADIUS = 192;
  const CIRC = 2 * Math.PI * RADIUS;
  const SOUND_KEY = 'focus-ring:sound';
  const TODAY_KEY = 'focus-ring:today';

  const els = {
    phase: document.getElementById('phaseLabel'),
    time: document.getElementById('timeDisplay'),
    toggle: document.getElementById('toggleBtn'),
    reset: document.getElementById('resetBtn'),
    skip: document.getElementById('skipBtn'),
    status: document.getElementById('status'),
    today: document.getElementById('todayCount'),
    rounds: document.getElementById('rounds'),
    sound: document.getElementById('soundBtn'),
    progress: document.getElementById('progress'),
    marker: document.getElementById('marker'),
    dialWrap: document.querySelector('.dial-wrap'),
    ticks: document.getElementById('ticks'),
    modeButtons: Array.from(document.querySelectorAll('.mode')),
    dots: Array.from(document.querySelectorAll('.dot')),
  };

  const state = {
    mode: 'focus',
    remaining: MODES.focus.duration,
    endAt: 0,
    running: false,
    focusInCycle: 0,
    sound: loadSoundPref(),
    ticker: null,
    statusTimer: null,
    doneTimer: null,
  };

  let today = loadToday();
  let audioCtx = null;

  /* ---------- 存储 ---------- */

  function loadSoundPref() {
    try {
      const value = localStorage.getItem(SOUND_KEY);
      return value === null ? true : value === '1';
    } catch {
      return true;
    }
  }

  function saveSoundPref() {
    try {
      localStorage.setItem(SOUND_KEY, state.sound ? '1' : '0');
    } catch {
      /* 无痕模式等场景下不可写，忽略 */
    }
  }

  function todayKey() {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  }

  function loadToday() {
    const fresh = { date: todayKey(), count: 0 };
    try {
      const raw = localStorage.getItem(TODAY_KEY);
      if (!raw) return fresh;
      const saved = JSON.parse(raw);
      if (
        saved &&
        saved.date === fresh.date &&
        Number.isInteger(saved.count) &&
        saved.count >= 0
      ) {
        return saved;
      }
    } catch {
      /* 数据损坏时从零开始 */
    }
    return fresh;
  }

  function saveToday() {
    try {
      localStorage.setItem(TODAY_KEY, JSON.stringify(today));
    } catch {
      /* 同上 */
    }
  }

  function addCompletedFocus() {
    if (today.date !== todayKey()) {
      today = { date: todayKey(), count: 0 };
    }
    today.count += 1;
    saveToday();
    renderToday();
  }

  /* ---------- 刻度 ---------- */

  function buildTicks() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 60; i += 1) {
      const angle = ((i * 6 - 90) * Math.PI) / 180;
      const major = i % 5 === 0;
      const inner = major ? 206 : 214;
      const outer = 224;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', (240 + inner * Math.cos(angle)).toFixed(2));
      line.setAttribute('y1', (240 + inner * Math.sin(angle)).toFixed(2));
      line.setAttribute('x2', (240 + outer * Math.cos(angle)).toFixed(2));
      line.setAttribute('y2', (240 + outer * Math.sin(angle)).toFixed(2));
      line.setAttribute('class', major ? 'tick major' : 'tick');
      frag.appendChild(line);
    }
    els.ticks.appendChild(frag);
  }

  /* ---------- 渲染 ---------- */

  function totalFor(mode) {
    return MODES[mode].duration;
  }

  function remainingNow() {
    if (!state.running) return state.remaining;
    return Math.max(0, state.endAt - Date.now());
  }

  function formatTime(ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function renderTime() {
    const remaining = remainingNow();
    const text = formatTime(remaining);
    if (els.time.textContent !== text) {
      els.time.textContent = text;
      els.time.setAttribute('aria-label', `剩余 ${text}`);
    }
    if (state.running) {
      document.title = `${text} · ${MODES[state.mode].label} — focus ring`;
    } else {
      document.title = 'focus ring · 专注计时器';
    }
  }

  function renderRing() {
    const total = totalFor(state.mode);
    const remaining = remainingNow();
    const fraction = Math.min(1, Math.max(0, remaining / total));
    const elapsed = 1 - fraction;

    els.progress.setAttribute(
      'stroke-dasharray',
      `${(CIRC * fraction).toFixed(3)} ${CIRC.toFixed(3)}`
    );
    els.progress.setAttribute('stroke-dashoffset', (-CIRC * elapsed).toFixed(3));

    const angle = elapsed * Math.PI * 2 - Math.PI / 2;
    els.marker.setAttribute('cx', (240 + RADIUS * Math.cos(angle)).toFixed(2));
    els.marker.setAttribute('cy', (240 + RADIUS * Math.sin(angle)).toFixed(2));
    els.marker.style.opacity =
      elapsed > 0.0005 && fraction > 0.0005 ? '1' : '0';
  }

  function renderControls() {
    const remaining = remainingNow();
    let label = '开始';
    if (state.running) label = '暂停';
    else if (remaining < totalFor(state.mode)) label = '继续';
    els.toggle.textContent = label;
  }

  function renderModes() {
    for (const button of els.modeButtons) {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.mode === state.mode)
      );
    }
    els.phase.textContent = MODES[state.mode].label;
  }

  function renderRounds() {
    els.dots.forEach((dot, index) => {
      dot.classList.toggle('filled', index < state.focusInCycle);
    });
    els.rounds.setAttribute(
      'aria-label',
      `本轮进度：${state.focusInCycle} / ${CYCLE}`
    );
  }

  function renderToday() {
    if (today.date !== todayKey()) {
      today = { date: todayKey(), count: 0 };
    }
    els.today.textContent = String(today.count);
  }

  function renderSound() {
    els.sound.setAttribute('aria-pressed', String(state.sound));
    els.sound.textContent = state.sound ? '提示音 开' : '提示音 关';
  }

  function renderAll() {
    renderModes();
    renderTime();
    renderRing();
    renderControls();
    renderRounds();
    renderToday();
  }

  /* ---------- 计时 ---------- */

  function startTicker() {
    stopTicker();
    state.ticker = setInterval(() => {
      renderTime();
      renderRing();
      if (remainingNow() <= 0) finishPhase();
    }, 200);
  }

  function stopTicker() {
    if (state.ticker !== null) {
      clearInterval(state.ticker);
      state.ticker = null;
    }
  }

  function start() {
    if (state.running) return;
    ensureAudio();
    state.running = true;
    state.endAt = Date.now() + state.remaining;
    startTicker();
    renderControls();
    renderTime();
  }

  function pause() {
    if (!state.running) return;
    state.remaining = remainingNow();
    state.running = false;
    stopTicker();
    renderTime();
    renderRing();
    renderControls();
  }

  function toggle() {
    if (state.running) pause();
    else start();
  }

  function reset() {
    stopTicker();
    state.running = false;
    state.remaining = totalFor(state.mode);
    renderAll();
    clearStatus();
  }

  function finishPhase() {
    stopTicker();
    state.running = false;
    playChime();
    flashDial();

    const finished = state.mode;
    if (finished === 'focus') {
      state.focusInCycle = Math.min(CYCLE, state.focusInCycle + 1);
      addCompletedFocus();
      state.mode = state.focusInCycle >= CYCLE ? 'long' : 'short';
      state.remaining = totalFor(state.mode);
      renderAll();
      announce(
        state.mode === 'long'
          ? '第四轮专注完成，休息 15 分钟。'
          : '专注完成，休息 5 分钟。'
      );
      return;
    }

    if (finished === 'long') {
      state.focusInCycle = 0;
    }
    state.mode = 'focus';
    state.remaining = totalFor('focus');
    renderAll();
    announce('休息结束，下一轮专注准备好了。');
  }

  function skipPhase() {
    stopTicker();
    state.running = false;

    if (state.mode === 'focus') {
      state.mode = 'short';
      state.remaining = totalFor('short');
      renderAll();
      announce('已跳到短休。');
      return;
    }

    if (state.mode === 'long') {
      state.focusInCycle = 0;
    }
    state.mode = 'focus';
    state.remaining = totalFor('focus');
    renderAll();
    announce('已跳到专注。');
  }

  function setMode(mode) {
    if (!MODES[mode] || mode === state.mode) {
      if (mode === state.mode) reset();
      return;
    }
    stopTicker();
    state.running = false;
    state.mode = mode;
    state.remaining = totalFor(mode);
    renderAll();
    clearStatus();
  }

  /* ---------- 提示 ---------- */

  function announce(message) {
    els.status.textContent = message;
    if (state.statusTimer !== null) clearTimeout(state.statusTimer);
    state.statusTimer = setTimeout(() => {
      els.status.textContent = '';
      state.statusTimer = null;
    }, 6000);
  }

  function clearStatus() {
    if (state.statusTimer !== null) {
      clearTimeout(state.statusTimer);
      state.statusTimer = null;
    }
    els.status.textContent = '';
  }

  function flashDial() {
    els.dialWrap.classList.remove('done');
    void els.dialWrap.offsetWidth;
    els.dialWrap.classList.add('done');
    if (state.doneTimer !== null) clearTimeout(state.doneTimer);
    state.doneTimer = setTimeout(() => {
      els.dialWrap.classList.remove('done');
      state.doneTimer = null;
    }, 1000);
  }

  /* ---------- 声音 ---------- */

  function ensureAudio() {
    if (!state.sound && !audioCtx) return;
    if (!audioCtx) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      audioCtx = new AudioCtor();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  function playChime() {
    if (!state.sound) return;
    ensureAudio();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const notes = [
      [880, 0],
      [659.25, 0.22],
    ];
    for (const [frequency, offset] of notes) {
      const oscillator = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.12, now + offset + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 1.1);
      oscillator.connect(gain);
      gain.connect(audioCtx.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 1.2);
    }
  }

  function toggleSound() {
    state.sound = !state.sound;
    saveSoundPref();
    renderSound();
  }

  /* ---------- 事件 ---------- */

  els.toggle.addEventListener('click', toggle);
  els.reset.addEventListener('click', reset);
  els.skip.addEventListener('click', skipPhase);
  els.sound.addEventListener('click', toggleSound);
  els.modeButtons.forEach((button) => {
    button.addEventListener('click', () => setMode(button.dataset.mode));
  });

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
    ) {
      return;
    }
    if (event.code === 'Space') {
      if (target instanceof Element && target.closest('button, a')) return;
      event.preventDefault();
      toggle();
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'r') {
      event.preventDefault();
      reset();
    } else if (key === 's') {
      event.preventDefault();
      skipPhase();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.running) {
      renderTime();
      renderRing();
      if (remainingNow() <= 0) finishPhase();
    }
  });

  /* ---------- 启动 ---------- */

  buildTicks();
  renderSound();
  renderAll();
})();