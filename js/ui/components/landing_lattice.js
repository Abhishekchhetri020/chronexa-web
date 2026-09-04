/**
 * Chronexa landing lattice.
 * WebGL draws the board/cards; a transparent 2D canvas carries timetable
 * labels and the conflict route. No product action depends on either canvas.
 */

const COLORS = {
  field: [0.071, 0.078, 0.09, 0.94],
  card: [0.16, 0.165, 0.185, 1],
  raised: [0.21, 0.22, 0.245, 1],
  cyan: [0.624, 0.906, 0.906, 1],
  red: [0.925, 0.404, 0.325, 1],
  grid: [0.30, 0.38, 0.39, 0.42],
  rail: [0.42, 0.72, 0.73, 0.34],
  edge: [0.47, 0.51, 0.53, 0.54],
  side: [0.055, 0.062, 0.071, 1],
  shadow: [0, 0, 0, 0.34],
};

const LESSONS = ["MATH", "BIO", "ENG", "HIST", "CHEM", "ART", "PHYS", "GEO"];
const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
const state = { mounted: false, active: false, inViewport: true, raf: 0, startedAt: 0, resizeObserver: null, intersectionObserver: null };

function seeded(index, salt = 0) {
  const value = Math.sin((index + 1) * 126.391 + salt * 73.117) * 43758.5453;
  return value - Math.floor(value);
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function easeOutExpo(value) { return value >= 1 ? 1 : 1 - Math.pow(2, -10 * value); }
function mix(a, b, amount) { return a + (b - a) * amount; }

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const reason = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(reason || "Unable to compile lattice shader");
  }
  return shader;
}

function createRenderer(canvas) {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: true,
    depth: false,
    powerPreference: "high-performance",
  });
  if (!gl) return null;

  const vertex = compile(gl, gl.VERTEX_SHADER, `#version 300 es
    in vec2 a_position;
    in vec4 a_color;
    uniform vec2 u_resolution;
    out vec4 v_color;
    void main() {
      vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
      gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
      v_color = a_color;
    }
  `);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, `#version 300 es
    precision mediump float;
    in vec4 v_color;
    out vec4 outColor;
    void main() { outColor = v_color; }
  `);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));

  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const stride = 6 * Float32Array.BYTES_PER_ELEMENT;
  const positionLocation = gl.getAttribLocation(program, "a_position");
  const colorLocation = gl.getAttribLocation(program, "a_color");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(colorLocation);
  gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  return {
    gl,
    draw(vertices, width, height) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), width, height);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 6);
    },
  };
}

function pushTriangle(vertices, a, b, c, color) {
  [a, b, c].forEach((point) => vertices.push(point.x, point.y, ...color));
}

function pushQuad(vertices, corners, color) {
  pushTriangle(vertices, corners[0], corners[1], corners[2], color);
  pushTriangle(vertices, corners[0], corners[2], corners[3], color);
}

function pushBeam(vertices, from, to, width, color) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = (-dy / length) * width * .5;
  const ny = (dx / length) * width * .5;
  pushQuad(vertices, [
    { x: from.x + nx, y: from.y + ny },
    { x: to.x + nx, y: to.y + ny },
    { x: to.x - nx, y: to.y - ny },
    { x: from.x - nx, y: from.y - ny },
  ], color);
}

function makeGeometry(width, height, progress, pointer) {
  const mobile = width < 680;
  const columns = mobile ? 5 : 6;
  const rows = 9;
  const tileWidth = mobile ? Math.min(width * .18, 68) : clamp(width * .078, 82, 126);
  const tileHeight = mobile ? clamp(height * .075, 58, 70) : clamp(height * .08, 62, 86);
  const gap = mobile ? 3 : 5;
  const skewX = -tileWidth * (mobile ? .22 : .30) + pointer.x * 9;
  const skewY = tileHeight * .12 + pointer.y * 5;
  const origin = {
    x: mobile ? width * .45 : width * .61,
    y: mobile ? height * .12 : height * .17,
  };
  const vertices = [];
  const cards = [];

  const targetAt = (column, row) => ({
    x: origin.x + column * tileWidth + row * skewX,
    y: origin.y + row * tileHeight + column * skewY,
  });
  const board = [
    { x: origin.x - 20, y: origin.y - 20 },
    { x: origin.x + columns * tileWidth + 18, y: origin.y + columns * skewY - 20 },
    { x: origin.x + columns * tileWidth + rows * skewX + 24, y: origin.y + columns * skewY + rows * tileHeight + 24 },
    { x: origin.x + rows * skewX - 24, y: origin.y + rows * tileHeight + 18 },
  ];
  pushQuad(vertices, board.map((point) => ({ x: point.x + 12, y: point.y + 18 })), COLORS.shadow);
  pushQuad(vertices, board, COLORS.field);
  for (let row = 0; row <= rows; row++) pushBeam(vertices, targetAt(0, row), targetAt(columns, row), row === rows ? 2.4 : 1, COLORS.rail);
  for (let column = 0; column <= columns; column++) pushBeam(vertices, targetAt(column, 0), targetAt(column, rows), column === 0 ? 2.2 : 1, COLORS.grid);

  // A diagonal wake keeps Composition A's assembly motion legible even once
  // the timetable itself has settled into the horizon.
  if (!mobile) {
    for (let index = 0; index < 13; index++) {
      const wakeProgress = clamp((progress - index * .022) * 1.4, 0, 1);
      const x = width * .34 + index * width * .028;
      const y = height * .11 + index * height * .027;
      const w = mix(32, 58, wakeProgress);
      const h = mix(18, 31, wakeProgress);
      const angle = -.54 + index * .035;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const point = (dx, dy) => ({ x: x + dx * cos - dy * sin, y: y + dx * sin + dy * cos });
      const wake = [point(-w / 2, -h / 2), point(w / 2, -h / 2), point(w / 2, h / 2), point(-w / 2, h / 2)];
      pushQuad(vertices, wake.map((corner) => ({ x: corner.x + 5, y: corner.y + 8 })), [0, 0, 0, .26]);
      pushQuad(vertices, wake, [0.20, 0.21, 0.235, .42 + wakeProgress * .25]);
      pushBeam(vertices, wake[0], wake[1], 1, [0.52, 0.59, 0.60, .34]);
    }
  }

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const index = row * columns + column;
      const target = targetAt(column, row);
      const spread = mobile ? width * .72 : width * .72;
      const scatter = {
        x: width * .58 + (seeded(index, 2) - .5) * spread + (seeded(index, 6) > .76 ? width * .45 : 0),
        y: height * .08 + seeded(index, 4) * height * .76 - row * 8,
      };
      const stagger = clamp((progress - index * .006) / .68, 0, 1);
      const resolved = easeOutExpo(stagger);
      const x = mix(scatter.x, target.x, resolved);
      const y = mix(scatter.y, target.y, resolved);
      const angle = mix((seeded(index, 8) - .5) * 1.5, 0, resolved);
      const widthNow = tileWidth - gap;
      const heightNow = tileHeight - gap;
      const cx = x + widthNow / 2;
      const cy = y + heightNow / 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const corner = (dx, dy) => ({ x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos });
      const quad = [corner(-widthNow / 2, -heightNow / 2), corner(widthNow / 2, -heightNow / 2), corner(widthNow / 2, heightNow / 2), corner(-widthNow / 2, heightNow / 2)];
      const conflict = index === Math.min(columns * rows - 1, columns * 3 + 2);
      const valid = index === Math.min(columns * rows - 1, columns * 5 + 4);
      pushQuad(vertices, quad.map((point) => ({ x: point.x + 4, y: point.y + 7 })), COLORS.shadow);
      const depth = conflict ? 9 : 6;
      pushQuad(vertices, [quad[3], quad[2], { x: quad[2].x + 4, y: quad[2].y + depth }, { x: quad[3].x + 4, y: quad[3].y + depth }], COLORS.side);
      pushQuad(vertices, [quad[1], quad[2], { x: quad[2].x + 4, y: quad[2].y + depth }, { x: quad[1].x + 4, y: quad[1].y + depth }], COLORS.side);
      pushQuad(vertices, quad, conflict ? COLORS.red : valid ? COLORS.cyan : (index % 7 === 0 ? COLORS.raised : COLORS.card));
      pushBeam(vertices, quad[0], quad[1], conflict || valid ? 2 : 1, conflict ? [1, .76, .69, .9] : valid ? [.88, 1, 1, .9] : COLORS.edge);
      cards.push({ index, row, column, x, y, width: widthNow, height: heightNow, conflict, valid, alpha: resolved });
    }
  }

  return { vertices, cards, columns, rows, board };
}

function drawLabels(context, width, height, geometry, progress) {
  context.clearRect(0, 0, width, height);
  const { cards, columns } = geometry;
  const settled = progress > .72;
  context.save();
  context.textBaseline = "middle";
  context.lineCap = "round";
  context.lineJoin = "round";

  cards.forEach((card) => {
    if (card.alpha < .62 || card.width < 54) return;
    const darkInk = card.valid;
    context.globalAlpha = clamp((card.alpha - .55) * 2.2, 0, 1);
    context.fillStyle = darkInk ? "#101415" : card.conflict ? "#fff5f0" : "#d6dbdb";
    context.font = `600 ${card.width > 90 ? 9 : 7}px "JetBrains Mono", monospace`;
    context.fillText(card.conflict ? "! CLASH" : LESSONS[(card.index * 3 + card.row) % LESSONS.length], card.x + 9, card.y + card.height * .42);
    context.globalAlpha *= .58;
    context.font = `500 ${card.width > 90 ? 7 : 6}px "JetBrains Mono", monospace`;
    context.fillText(`${8 + card.row}${card.column % 2 ? "B" : "A"} · P${card.row + 1}`, card.x + 9, card.y + card.height * .69);
  });

  if (settled) {
    context.globalAlpha = clamp((progress - .7) * 3.4, 0, .72);
    context.fillStyle = "#a8b0b1";
    context.font = "600 8px \"JetBrains Mono\", monospace";
    for (let column = 0; column < columns; column++) {
      const card = cards[column];
      if (card) context.fillText(DAYS[column], card.x + 8, card.y - 13);
    }

    const conflict = cards.find((card) => card.conflict);
    const valid = cards.find((card) => card.valid);
    if (conflict && valid) {
      const startX = conflict.x + conflict.width * .78;
      const startY = conflict.y + conflict.height * .3;
      const endX = valid.x + valid.width * .3;
      const endY = valid.y + valid.height * .48;
      context.globalAlpha = clamp((progress - .78) * 4.5, 0, .88);
      context.strokeStyle = "rgba(236, 103, 83, .95)";
      context.lineWidth = 2.4;
      context.setLineDash([]);
      context.beginPath();
      context.moveTo(startX, startY);
      const splitX = mix(startX, endX, .27);
      const splitY = Math.min(startY, endY) - 82;
      context.bezierCurveTo(startX + 44, startY - 36, splitX - 18, splitY, splitX, splitY);
      context.stroke();
      context.strokeStyle = "#9fe7e7";
      context.lineWidth = 2;
      context.setLineDash([8, 8]);
      context.beginPath();
      context.moveTo(splitX, splitY);
      context.bezierCurveTo(splitX + 88, splitY - 10, endX + 62, endY - 64, endX, endY);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = "#9fe7e7";
      context.beginPath();
      context.arc(endX, endY, 3, 0, Math.PI * 2);
      context.fill();
      context.font = "600 8px \"JetBrains Mono\", monospace";
      context.textAlign = "right";
      context.fillText("REROUTED · VALID", valid.x + valid.width, valid.y - 12);
      context.textAlign = "left";
    }
  }
  context.restore();
}

function drawFallback2D(context, width, height, geometry) {
  context.clearRect(0, 0, width, height);
  geometry.cards.forEach((card) => {
    context.fillStyle = card.conflict ? "#ec6753" : card.valid ? "#9fe7e7" : (card.index % 7 === 0 ? "#35383f" : "#292a30");
    context.fillRect(card.x, card.y, card.width, card.height);
  });
  drawLabels(context, width, height, geometry, 1);
}

function mount(root = document.querySelector("[data-lattice-scene]")) {
  if (!root || state.mounted) {
    state.active = !!root && !document.getElementById("step-1")?.classList.contains("hidden");
    return;
  }

  const webglCanvas = root.querySelector("[data-lattice-webgl]");
  const labelCanvas = root.querySelector("[data-lattice-labels]");
  const labelContext = labelCanvas && labelCanvas.getContext("2d");
  if (!webglCanvas || !labelCanvas || !labelContext) return;

  let renderer = null;
  try { renderer = createRenderer(webglCanvas); } catch (error) { console.warn("[landing-lattice] WebGL fallback:", error); }
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
  let lastWidth = 0;
  let lastHeight = 0;
  let lastDpr = 0;

  function resize() {
    const rect = root.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (width === lastWidth && height === lastHeight && dpr === lastDpr) return { width, height, dpr };
    [webglCanvas, labelCanvas].forEach((canvas) => {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    });
    labelContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    lastWidth = width;
    lastHeight = height;
    lastDpr = dpr;
    return { width, height, dpr };
  }

  function render(timestamp = performance.now()) {
    state.raf = 0;
    if (!state.active || !state.inViewport || document.hidden || !root.isConnected) return;
    const { width, height, dpr } = resize();
    const elapsed = reducedMotion ? 1 : clamp((timestamp - state.startedAt) / 2700, 0, 1);
    const scrollOrder = clamp(window.scrollY / Math.max(height * .72, 1), 0, 1);
    const progress = reducedMotion ? 1 : Math.max(.17 + elapsed * .83, .17 + scrollOrder * .83);
    pointer.x += (pointer.targetX - pointer.x) * .07;
    pointer.y += (pointer.targetY - pointer.y) * .07;
    const geometry = makeGeometry(width, height, progress, pointer);
    if (renderer) renderer.draw(geometry.vertices.map((value, index) => index % 6 < 2 ? value * dpr : value), width * dpr, height * dpr);
    else drawFallback2D(labelContext, width, height, geometry);
    if (renderer) drawLabels(labelContext, width, height, geometry, progress);
    root.classList.add("is-ready");

    const pointerMoving = Math.abs(pointer.targetX - pointer.x) + Math.abs(pointer.targetY - pointer.y) > .002;
    if (!reducedMotion && (elapsed < 1 || pointerMoving)) state.raf = requestAnimationFrame(render);
  }

  function requestRender() {
    if (!state.raf && state.active && state.inViewport && !document.hidden) state.raf = requestAnimationFrame(render);
  }

  root.addEventListener("pointermove", (event) => {
    if (reducedMotion || event.pointerType === "touch") return;
    const rect = root.getBoundingClientRect();
    pointer.targetX = clamp((event.clientX - rect.left) / rect.width - .5, -.5, .5);
    pointer.targetY = clamp((event.clientY - rect.top) / rect.height - .5, -.5, .5);
    requestRender();
  }, { passive: true });
  root.addEventListener("pointerleave", () => {
    pointer.targetX = 0;
    pointer.targetY = 0;
    requestRender();
  }, { passive: true });
  window.addEventListener("scroll", requestRender, { passive: true });
  document.addEventListener("visibilitychange", requestRender);
  document.addEventListener("step:changed", (event) => {
    state.active = event.detail?.step === 1;
    if (state.active) requestRender();
    else if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }
  });
  state.resizeObserver = new ResizeObserver(requestRender);
  state.resizeObserver.observe(root);
  state.intersectionObserver = new IntersectionObserver(([entry]) => {
    state.inViewport = entry.isIntersecting;
    if (state.inViewport) requestRender();
    else if (state.raf) { cancelAnimationFrame(state.raf); state.raf = 0; }
  }, { rootMargin: "120px" });
  state.intersectionObserver.observe(root);
  webglCanvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    renderer = null;
    root.classList.remove("is-ready");
    requestRender();
  });
  state.mounted = true;
  state.active = !document.getElementById("step-1")?.classList.contains("hidden");
  state.startedAt = performance.now();
  requestRender();
}

export const LandingLattice = { mount };
