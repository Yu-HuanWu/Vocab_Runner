(function () {
  'use strict';

  const WORD_DISPLAY = document.getElementById('word-display');
  const CANVAS = document.getElementById('game-canvas');
  const PRELEVEL_SCREEN = document.getElementById('prelevel-screen');
  const TARGET_WORD_EL = document.getElementById('target-word');
  const BEGIN_BTN = document.getElementById('begin-btn');

  const ctx = CANVAS.getContext('2d');
  const LANES = 2;
  const PENALTY_MS = 1000;
  const GATE_HEIGHT = 80;
  const GATE_GAP_MIN = 50;
  const GATE_GAP_MAX = 120;
  const VISUAL_GAP_TARGET = 100;
  const PLAYER_ZONE_TOP = 0.7;
  const SCROLL_SPEED = 120;
  const PATH_MARGIN_BOTTOM = 0.08;
  const PATH_MARGIN_TOP = 0.38;

  let vocabList = [];
  let currentWord = '';
  let currentWordUpper = '';
  let gateSets = [];
  let gateSetIndex = 0;
  let spelledWord = '';
  let playerLane = 0;
  let gameStarted = false;
  let penaltyUntil = 0;
  let lastTime = 0;
  let animId = null;
  let touchStartX = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = CANVAS.clientWidth;
    const h = CANVAS.clientHeight;
    CANVAS.width = w * dpr;
    CANVAS.height = h * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    CANVAS.style.width = w + 'px';
    CANVAS.style.height = h + 'px';
  }

  function getWrongLetter(correct) {
    const correctUpper = correct.toUpperCase();
    const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let pick = alpha[Math.floor(Math.random() * 26)];
    while (pick === correctUpper) pick = alpha[Math.floor(Math.random() * 26)];
    return pick;
  }

  function gapAfterForDepth(y, height) {
    const scale = depthScale(y, height);
    const visualGap = VISUAL_GAP_TARGET + (GATE_GAP_MAX - GATE_GAP_MIN) * 0.5 * (0.3 + 0.7 * Math.random());
    const gap = visualGap - GATE_HEIGHT * (1 + scale);
    return Math.max(GATE_GAP_MIN, Math.min(GATE_GAP_MAX, gap));
  }

  function buildGateSets(word, height) {
    const h = height || 600;
    const w = word.toUpperCase();
    const sets = [];
    let y = -GATE_HEIGHT;
    for (let i = 0; i < w.length; i++) {
      const correct = w[i];
      const wrong = getWrongLetter(correct);
      const correctOnLeft = Math.random() < 0.5;
      const gapAfter = i < w.length - 1 ? gapAfterForDepth(y, h) : 0;
      sets.push({
        leftLetter: correctOnLeft ? correct : wrong,
        rightLetter: correctOnLeft ? wrong : correct,
        correctOnLeft,
        gapAfter,
        y,
        evaluated: false
      });
      y -= GATE_HEIGHT + gapAfter;
    }
    return sets;
  }

  function loadVocabulary() {
    const url = new URL('vocabulary.txt', window.location.href).toString();
    return fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(r.statusText);
        return r.text();
      })
      .then(text => {
        vocabList = text.split('\n').map(s => s.trim().toLowerCase()).filter(Boolean);
        if (vocabList.length === 0) vocabList = ['world'];
        return vocabList;
      })
      .catch((e) => {
        console.warn('Vocabulary load failed:', e.message);
        vocabList = ['idk', 'idc', 'huh'];
        return vocabList;
      });
  }

  function pickRandomWord() {
    return vocabList[Math.floor(Math.random() * vocabList.length)];
  }

  function startLevel(word) {
    currentWord = word;
    currentWordUpper = word.toUpperCase();
    const height = CANVAS.clientHeight || 600;
    gateSets = buildGateSets(word, height);
    gateSetIndex = 0;
    spelledWord = '';
    playerLane = 0;
    penaltyUntil = 0;
    gameStarted = true;
    updateWordDisplay();
  }

  function showPreLevel(word) {
    currentWord = word;
    currentWordUpper = word.toUpperCase();
    TARGET_WORD_EL.textContent = currentWordUpper;
    PRELEVEL_SCREEN.classList.remove('hidden');
    gameStarted = false;
  }

  function hidePreLevelAndStart() {
    PRELEVEL_SCREEN.classList.add('hidden');
    startLevel(currentWord);
  }

  function updateWordDisplay() {
    const len = currentWordUpper.length;
    const display = spelledWord + '_'.repeat(Math.max(0, len - spelledWord.length));
    WORD_DISPLAY.textContent = 'Word: ' + display;
  }

  function onWordComplete() {
    gameStarted = false;
    gateSets = [];
    gateSetIndex = 0;
    spelledWord = '';
    const next = pickRandomWord();
    showPreLevel(next);
  }

  function pathLeft(y, height, width) {
    const t = 1 - Math.max(0, Math.min(1, y / height));
    return (PATH_MARGIN_BOTTOM + (PATH_MARGIN_TOP - PATH_MARGIN_BOTTOM) * t) * width;
  }

  function pathRight(y, height, width) {
    const t = 1 - Math.max(0, Math.min(1, y / height));
    return (1 - PATH_MARGIN_BOTTOM - (PATH_MARGIN_TOP - PATH_MARGIN_BOTTOM) * t) * width;
  }

  function pathCenterY(height) {
    return height * PLAYER_ZONE_TOP;
  }

  function depthScale(gateY, height) {
    const playerY = pathCenterY(height);
    if (gateY >= playerY) return 1;
    return 0.55 + 0.45 * Math.max(0, gateY / playerY);
  }

  function drawPath(width, height) {
    const pl = pathLeft(height, height, width);
    const pr = pathRight(height, height, width);
    const ptL = pathLeft(0, height, width);
    const ptR = pathRight(0, height, width);
    ctx.fillStyle = '#f5f0e8';
    ctx.strokeStyle = '#e8e0d4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pl, height);
    ctx.lineTo(pr, height);
    ctx.lineTo(ptR, 0);
    ctx.lineTo(ptL, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function drawGateSet(set, width, height) {
    const top = set.y;
    const gateH = GATE_HEIGHT * depthScale(top, height);
    const bottom = top + gateH;
    if (bottom < 0 || top > height) return;

    const plTop = pathLeft(top, height, width);
    const prTop = pathRight(top, height, width);
    const pathW = prTop - plTop;
    const centerX = (plTop + prTop) / 2;
    const gateWidthLeft = centerX - plTop;
    const gateWidthRight = prTop - centerX;

    const lanesToDraw = set.evaluated
      ? [set.correctOnLeft ? 1 : 0]
      : [0, 1];

    ctx.save();
    ctx.font = 'bold ' + Math.round(20 + 14 * depthScale(top, height)) + 'px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    lanesToDraw.forEach(i => {
      const letter = i === 0 ? set.leftLetter : set.rightLetter;
      const gx = i === 0 ? plTop : centerX;
      const gw = i === 0 ? gateWidthLeft : gateWidthRight;
      ctx.fillStyle = '#2d3d5c';
      ctx.strokeStyle = '#1a2440';
      ctx.lineWidth = 2;
      ctx.fillRect(gx, top, gw, gateH);
      ctx.strokeRect(gx, top, gw, gateH);
      ctx.fillStyle = '#1a2440';
      ctx.fillRect(gx, bottom - 6, gw, 6);
      ctx.fillStyle = '#e8e8e8';
      ctx.fillText(letter, gx + gw / 2, top + gateH / 2);
    });

    ctx.restore();
  }

  function drawPlayer(width, height, isFallen) {
    const playerY = pathCenterY(height);
    const pl = pathLeft(playerY, height, width);
    const pr = pathRight(playerY, height, width);
    const pathW = pr - pl;
    const laneCenterX = pl + pathW * (0.25 + playerLane * 0.5);
    const size = Math.min(pathW * 0.12, 28);
    const now = Date.now();
    const isPenalty = now < penaltyUntil;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 4;
    if (isFallen) {
      ctx.globalAlpha = 0.8;
      ctx.translate(laneCenterX, playerY + size * 0.4);
      ctx.rotate(0.35);
      ctx.translate(-laneCenterX, -(playerY + size * 0.4));
    }
    ctx.fillStyle = isPenalty ? '#c0392b' : '#4a90d9';
    ctx.beginPath();
    ctx.arc(laneCenterX, playerY, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = isPenalty ? '#a02820' : '#2d6bb5';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function runCollision(width, height) {
    const playerY = height * PLAYER_ZONE_TOP;
    const now = Date.now();
    if (now < penaltyUntil) return;
    if (gateSetIndex >= gateSets.length) return;

    const set = gateSets[gateSetIndex];
    if (set.evaluated) return;
    const gateCenterY = set.y + GATE_HEIGHT / 2;
    const dist = Math.abs(gateCenterY - playerY);
    if (dist < GATE_HEIGHT * 0.6) {
      const correctLane = set.correctOnLeft ? 0 : 1;
      if (playerLane === correctLane) {
        set.evaluated = true;
        spelledWord += currentWordUpper[gateSetIndex];
        gateSetIndex++;
        updateWordDisplay();
        if (gateSetIndex >= gateSets.length) {
          onWordComplete();
        }
      } else {
        penaltyUntil = now + PENALTY_MS;
        const baseY = playerY - GATE_HEIGHT - 140;
        gateSets[gateSetIndex].y = baseY;
        for (let i = gateSetIndex + 1; i < gateSets.length; i++) {
          gateSets[i].y = gateSets[i - 1].y - GATE_HEIGHT - gateSets[i - 1].gapAfter;
        }
        for (let i = gateSetIndex - 1; i >= 0; i--) {
          gateSets[i].y = gateSets[i + 1].y + GATE_HEIGHT + gateSets[i].gapAfter;
        }
      }
    }
  }

  function update(dt, width, height) {
    if (!gameStarted || !gateSets.length) return;
    const now = Date.now();
    if (now < penaltyUntil) return;

    for (let i = 0; i < gateSets.length; i++) {
      const scale = Math.max(0.4, depthScale(gateSets[i].y, height));
      gateSets[i].y += (SCROLL_SPEED / 1000) * scale * dt;
    }

    runCollision(width, height);
  }

  function draw(width, height) {
    ctx.fillStyle = '#c9a86c';
    ctx.fillRect(0, 0, width, height);
    drawPath(width, height);

    const now = Date.now();
    const isFallen = now < penaltyUntil;

    gateSets.forEach(set => drawGateSet(set, width, height));
    drawPlayer(width, height, isFallen);
  }

  function gameLoop(now) {
    const width = CANVAS.clientWidth;
    const height = CANVAS.clientHeight;
    const dt = lastTime ? Math.min(now - lastTime, 100) : 16;
    lastTime = now;

    update(dt, width, height);
    draw(width, height);

    animId = requestAnimationFrame(gameLoop);
  }

  function startGameLoop() {
    lastTime = 0;
    if (animId) cancelAnimationFrame(animId);
    animId = requestAnimationFrame(gameLoop);
  }

  function setLane(lane) {
    if (Date.now() < penaltyUntil) return;
    playerLane = Math.max(0, Math.min(LANES - 1, lane));
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      setLane(0);
      e.preventDefault();
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      setLane(1);
      e.preventDefault();
    }
  }

  function onPointerDown(x) {
    if (!gameStarted) return;
    const width = CANVAS.clientWidth;
    setLane(x < width / 2 ? 0 : 1);
  }

  function onPointerMove(x) {
    if (!gameStarted) return;
    const width = CANVAS.clientWidth;
    const lane = x < width / 2 ? 0 : 1;
    setLane(lane);
  }

  function initInput() {
    window.addEventListener('keydown', onKeyDown);
    CANVAS.addEventListener('click', e => onPointerDown(e.clientX));
    CANVAS.addEventListener('touchstart', e => {
      e.preventDefault();
      touchStartX = e.touches[0].clientX;
      onPointerDown(touchStartX);
    }, { passive: false });
    CANVAS.addEventListener('touchmove', e => {
      e.preventDefault();
      onPointerMove(e.touches[0].clientX);
    }, { passive: false });
  }

  function init() {
    resize();
    window.addEventListener('resize', resize);
    initInput();

    startGameLoop();

    loadVocabulary().then(() => {
      const word = pickRandomWord();
      showPreLevel(word);
    });

    BEGIN_BTN.addEventListener('click', () => {
      if (!currentWord) return;
      hidePreLevelAndStart();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
