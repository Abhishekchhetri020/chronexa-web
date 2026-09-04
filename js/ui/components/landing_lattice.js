/**
 * Chronexa landing lattice.
 * WebGL draws the board/cards with jewel-toned subject palettes, physical depth,
 * and continuous harmonic floating animation. A transparent 2D canvas carries
 * timetable labels, traveling conflict photons, and rerouting paths.
 */

const COLORS = {
  field: [0.065, 0.072, 0.082, 0.95],
  cyan: [0.624, 0.906, 0.906, 1],
  red: [0.925, 0.38, 0.32, 1],
  grid: [0.28, 0.36, 0.38, 0.38],
  rail: [0.38, 0.68, 0.70, 0.32],
  shadow: [0, 0, 0, 0.36],
};

const SUBJECT_PALETTES = [
  { name: "MATH", color: [0.88, 0.52, 0.20, 1], edge: [1.0, 0.74, 0.44, 0.95], side: [0.55, 0.28, 0.08, 1] }, // amber gold
  { name: "ENG",  color: [0.86, 0.26, 0.32, 1], edge: [1.0, 0.52, 0.58, 0.95], side: [0.52, 0.12, 0.16, 1] }, // crimson coral
  { name: "BIO",  color: [0.18, 0.64, 0.38, 1], edge: [0.45, 0.90, 0.62, 0.95], side: [0.08, 0.38, 0.20, 1] }, // emerald mint
  { name: "PHYS", color: [0.20, 0.48, 0.85, 1], edge: [0.50, 0.75, 1.00, 0.95], side: [0.10, 0.28, 0.58, 1] }, // cobalt sapphire
  { name: "CHEM", color: [0.12, 0.62, 0.68, 1], edge: [0.45, 0.88, 0.92, 0.95], side: [0.06, 0.36, 0.42, 1] }, // ocean cyan
  { name: "HIST", color: [0.52, 0.32, 0.78, 1], edge: [0.75, 0.55, 0.98, 0.95], side: [0.30, 0.16, 0.50, 1] }, // royal amethyst
  { name: "GEO",  color: [0.85, 0.40, 0.16, 1], edge: [1.0, 0.65, 0.42, 0.95], side: [0.52, 0.22, 0.08, 1] }, // burnt orange
  { name: "ART",  color: [0.75, 0.25, 0.58, 1], edge: [0.98, 0.52, 0.82, 0.95], side: [0.45, 0.12, 0.34, 1] }, // magenta rose
];

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
const state = { mounted: false, active: false, inViewport: true, raf: 0, startedAt: 0, resizeObserver: null, intersectionObserver: null };

function seeded(index, salt = 0) {
  const value = Math.sin((index + 1) * 126.391 + salt * 73.117) * 43758.5453;
  return value - Math.floor(value);
}

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function easeOutExpo(value) { return value >= 1 ? 1 : 1 - Math.pow(2, -10 * value); }
function easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
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
  vertices.push(a.x, a.y, ...color);
  vertices.push(b.x, b.y, ...color);
  vertices.push(c.x, c.y, ...color);
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

// Sequence of automatic live-solving cycles that continuously demo constraint solving
const SOLVE_CYCLES = [
  { clashRow: 3, clashCol: 2, destRow: 5, destCol: 4, lesson: "MATH", class: "9A" },
  { clashRow: 2, clashCol: 1, destRow: 6, destCol: 3, lesson: "PHYS", class: "10B" },
  { clashRow: 4, clashCol: 4, destRow: 2, destCol: 0, lesson: "BIO",  class: "8A" },
  { clashRow: 1, clashCol: 3, destRow: 4, destCol: 1, lesson: "ENG",  class: "7B" },
];

function makeGeometry(width, height, progress, pointer, time = 0, reducedMotion = false) {
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
  pushQuad(vertices, board.map((point) => ({ x: point.x + 14, y: point.y + 20 })), COLORS.shadow);
  pushQuad(vertices, board, COLORS.field);
  for (let row = 0; row <= rows; row++) pushBeam(vertices, targetAt(0, row), targetAt(columns, row), row === rows ? 2.4 : 1, COLORS.rail);
  for (let column = 0; column <= columns; column++) pushBeam(vertices, targetAt(column, 0), targetAt(column, rows), column === 0 ? 2.2 : 1, COLORS.grid);

  // Diagonal floating wake tiles with subtle continuous drift in space
  if (!mobile) {
    for (let index = 0; index < 13; index++) {
      const wakeProgress = clamp((progress - index * .022) * 1.4, 0, 1);
      const pal = SUBJECT_PALETTES[index % SUBJECT_PALETTES.length];
      const driftX = reducedMotion ? 0 : Math.cos(time * 0.0012 + index * 0.75) * 4.5;
      const driftY = reducedMotion ? 0 : Math.sin(time * 0.0016 + index * 0.85) * 3.5;
      const x = width * .34 + index * width * .028 + driftX;
      const y = height * .11 + index * height * .027 + driftY;
      const w = mix(32, 58, wakeProgress);
      const h = mix(18, 31, wakeProgress);
      const angle = -.54 + index * .035 + (reducedMotion ? 0 : Math.sin(time * 0.001 + index) * 0.04);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const point = (dx, dy) => ({ x: x + dx * cos - dy * sin, y: y + dx * sin + dy * cos });
      const wake = [point(-w / 2, -h / 2), point(w / 2, -h / 2), point(w / 2, h / 2), point(-w / 2, h / 2)];
      pushQuad(vertices, wake.map((corner) => ({ x: corner.x + 5, y: corner.y + 8 })), [0, 0, 0, .26]);
      const cardColor = [pal.color[0], pal.color[1], pal.color[2], 0.35 + wakeProgress * 0.35];
      pushQuad(vertices, wake, cardColor);
      pushBeam(vertices, wake[0], wake[1], 1, [pal.edge[0], pal.edge[1], pal.edge[2], 0.4 + wakeProgress * 0.4]);
    }
  }

  // Active continuous live-solving state
  const cyclePeriod = 6500;
  const safeTime = Math.max(0, Number(time) || 0);
  const cycleIdx = Math.floor(safeTime / cyclePeriod);
  const cyclePhase = (safeTime % cyclePeriod) / cyclePeriod;
  const activeCycle = SOLVE_CYCLES[((cycleIdx % SOLVE_CYCLES.length) + SOLVE_CYCLES.length) % SOLVE_CYCLES.length] || SOLVE_CYCLES[0];
  const clashIdx = Math.min(columns * rows - 1, (activeCycle.clashRow || 0) * columns + (activeCycle.clashCol || 0));
  const destIdx = Math.min(columns * rows - 1, (activeCycle.destRow || 0) * columns + (activeCycle.destCol || 0));

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const index = row * columns + column;
      const target = targetAt(column, row);

      // Continuous harmonic breathing wave
      const floatY = (!reducedMotion && progress >= 0.95)
        ? Math.sin(time * 0.0018 + column * 0.55 + row * 0.35) * 2.5
        : 0;
      const floatX = (!reducedMotion && progress >= 0.95)
        ? Math.cos(time * 0.0014 + column * 0.45 + row * 0.40) * 1.2
        : 0;

      const spread = width * .72;
      const scatter = {
        x: width * .58 + (seeded(index, 2) - .5) * spread + (seeded(index, 6) > .76 ? width * .45 : 0),
        y: height * .08 + seeded(index, 4) * height * .76 - row * 8,
      };
      const stagger = clamp((progress - index * .006) / .68, 0, 1);
      const resolved = easeOutExpo(stagger);
      let x = mix(scatter.x, target.x, resolved) + floatX;
      let y = mix(scatter.y, target.y, resolved) + floatY;
      let angle = mix((seeded(index, 8) - .5) * 1.5, 0, resolved);

      const isConflictTile = (index === clashIdx);
      const isValidTile = (index === destIdx);

      // If this card is currently in flight during the solving cycle
      let inFlight = false;
      let flightProgress = 0;
      if (isConflictTile && progress >= 0.95 && !reducedMotion) {
        if (cyclePhase >= 0.22 && cyclePhase < 0.72) {
          inFlight = true;
          flightProgress = easeInOutQuad((cyclePhase - 0.22) / 0.50);
          const destTarget = targetAt(activeCycle.destCol, activeCycle.destRow);
          // Spline arc lifting high above the board
          const midX = mix(target.x, destTarget.x, 0.45);
          const midY = Math.min(target.y, destTarget.y) - 68;
          // Quadratic bezier interpolation
          const p0x = target.x, p0y = target.y;
          const p1x = midX, p1y = midY;
          const p2x = destTarget.x, p2y = destTarget.y;
          const u = 1 - flightProgress;
          x = u * u * p0x + 2 * u * flightProgress * p1x + flightProgress * flightProgress * p2x;
          y = u * u * p0y + 2 * u * flightProgress * p1y + flightProgress * flightProgress * p2y;
          angle = (flightProgress - 0.5) * 0.18;
        }
      }

      const widthNow = tileWidth - gap;
      const heightNow = tileHeight - gap;
      const cx = x + widthNow / 2;
      const cy = y + heightNow / 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const corner = (dx, dy) => ({ x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos });
      const quad = [corner(-widthNow / 2, -heightNow / 2), corner(widthNow / 2, -heightNow / 2), corner(widthNow / 2, heightNow / 2), corner(-widthNow / 2, heightNow / 2)];

      // Rich subject palette
      const pal = SUBJECT_PALETTES[(index * 3 + row) % SUBJECT_PALETTES.length];
      let cardColor = pal.color;
      let edgeColor = pal.edge;
      let sideColor = pal.side;
      let cardDepth = 6;
      let shadowOffset = 7;

      if (isConflictTile) {
        if (cyclePhase < 0.22) {
          // Pulsing clash
          const pulse = Math.sin(time * 0.008) * 0.15;
          cardColor = [COLORS.red[0] + pulse, COLORS.red[1], COLORS.red[2], 1];
          edgeColor = [1.0, 0.78, 0.70, 0.95];
          sideColor = [0.52, 0.12, 0.10, 1];
          cardDepth = 9;
        } else if (inFlight) {
          // Flying card in cyan transition
          cardColor = COLORS.cyan;
          edgeColor = [1, 1, 1, 1];
          sideColor = [0.25, 0.55, 0.58, 1];
          cardDepth = 14;
          shadowOffset = 18;
        } else if (cyclePhase >= 0.72) {
          // Solved resting
          cardColor = pal.color;
          edgeColor = pal.edge;
          sideColor = pal.side;
        }
      } else if (isValidTile) {
        if (cyclePhase >= 0.15 && cyclePhase < 0.72) {
          // Destination glow
          const pulse = Math.sin(time * 0.009) * 0.12;
          cardColor = [0.15, 0.25, 0.28, 0.9];
          edgeColor = [COLORS.cyan[0], COLORS.cyan[1], COLORS.cyan[2], 0.85 + pulse];
          sideColor = [0.08, 0.18, 0.20, 1];
        } else if (cyclePhase >= 0.72 && cyclePhase < 0.92) {
          // Freshly landed celebration
          cardColor = COLORS.cyan;
          edgeColor = [1, 1, 1, 1];
          sideColor = [0.25, 0.55, 0.58, 1];
        }
      }

      pushQuad(vertices, quad.map((point) => ({ x: point.x + 4, y: point.y + shadowOffset })), COLORS.shadow);
      pushQuad(vertices, [quad[3], quad[2], { x: quad[2].x + 4, y: quad[2].y + cardDepth }, { x: quad[3].x + 4, y: quad[3].y + cardDepth }], sideColor);
      pushQuad(vertices, [quad[1], quad[2], { x: quad[2].x + 4, y: quad[2].y + cardDepth }, { x: quad[1].x + 4, y: quad[1].y + cardDepth }], sideColor);
      pushQuad(vertices, quad, cardColor);
      pushBeam(vertices, quad[0], quad[1], (isConflictTile || isValidTile) ? 2.2 : 1.2, edgeColor);

      cards.push({
        index, row, column, x, y, width: widthNow, height: heightNow,
        pal, conflict: isConflictTile, valid: isValidTile, inFlight, flightProgress,
        alpha: resolved
      });
    }
  }

  return { vertices, cards, columns, rows, board, activeCycle, cyclePhase };
}

function drawLabels(context, width, height, geometry, progress, time = 0, reducedMotion = false) {
  context.clearRect(0, 0, width, height);
  const { cards, columns, activeCycle, cyclePhase } = geometry;
  const settled = progress > .72;
  context.save();
  context.textBaseline = "middle";
  context.lineCap = "round";
  context.lineJoin = "round";

  cards.forEach((card) => {
    if (card.alpha < .62 || card.width < 54) return;
    context.globalAlpha = clamp((card.alpha - .55) * 2.2, 0, 1);

    // High-contrast clean white typography with subtle drop shadow
    context.shadowColor = "rgba(0, 0, 0, 0.65)";
    context.shadowBlur = 4;
    context.shadowOffsetX = 1;
    context.shadowOffsetY = 1;

    let title = card.pal.name;
    let isClash = false;
    if (card.conflict) {
      if (cyclePhase < 0.22) { title = "! CLASH"; isClash = true; }
      else if (card.inFlight) { title = "SOLVING"; }
      else if (cyclePhase < 0.90) { title = "RESOLVED"; }
    }

    context.fillStyle = isClash ? "#ffffff" : (card.valid && cyclePhase >= 0.72 && cyclePhase < 0.92 ? "#082024" : "#ffffff");
    context.font = `700 ${card.width > 90 ? 10 : 8}px "JetBrains Mono", monospace`;
    context.fillText(title, card.x + 9, card.y + card.height * .40);

    context.shadowBlur = 2;
    context.fillStyle = isClash ? "#ffded9" : (card.valid && cyclePhase >= 0.72 && cyclePhase < 0.92 ? "#15353a" : "rgba(255, 255, 255, 0.82)");
    context.font = `600 ${card.width > 90 ? 8 : 6.5}px "JetBrains Mono", monospace`;
    context.fillText(`${8 + card.row}${card.column % 2 ? "B" : "A"} · P${card.row + 1}`, card.x + 9, card.y + card.height * .68);
  });

  // Reset shadows for lines and UI markers
  context.shadowColor = "transparent";
  context.shadowBlur = 0;

  if (settled) {
    // Day headers
    context.globalAlpha = clamp((progress - .7) * 3.4, 0, .85);
    context.fillStyle = "#c5d0d2";
    context.font = "700 8.5px \"JetBrains Mono\", monospace";
    for (let column = 0; column < columns; column++) {
      const card = cards[column];
      if (card) context.fillText(DAYS[column], card.x + 8, card.y - 14);
    }

    // Dynamic rerouting arc
    const conflictCard = cards.find((c) => c.conflict);
    const validCard = cards.find((c) => c.valid);

    if (conflictCard && validCard && !reducedMotion) {
      const startX = conflictCard.x + conflictCard.width * .6;
      const startY = conflictCard.y + conflictCard.height * .3;
      const endX = validCard.x + validCard.width * .4;
      const endY = validCard.y + validCard.height * .4;
      const midX = mix(startX, endX, 0.45);
      const midY = Math.min(startY, endY) - 72;

      context.globalAlpha = 0.92;
      context.lineWidth = 2.2;

      // Glow spline
      context.strokeStyle = "rgba(159, 231, 231, 0.85)";
      context.setLineDash([7, 8]);
      context.beginPath();
      context.moveTo(startX, startY);
      context.quadraticCurveTo(midX, midY, endX, endY);
      context.stroke();
      context.setLineDash([]);

      // Traveling photon particle along the spline
      const photonT = (time * 0.0008) % 1;
      const u = 1 - photonT;
      const px = u * u * startX + 2 * u * photonT * midX + photonT * photonT * endX;
      const py = u * u * startY + 2 * u * photonT * midY + photonT * photonT * endY;

      context.fillStyle = "#ffffff";
      context.beginPath();
      context.arc(px, py, 4, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "#9fe7e7";
      context.beginPath();
      context.arc(px, py, 8, 0, Math.PI * 2);
      context.globalAlpha = 0.4;
      context.fill();
      context.globalAlpha = 0.95;

      // Destination target pin
      context.fillStyle = "#9fe7e7";
      context.beginPath();
      context.arc(endX, endY, 3.5, 0, Math.PI * 2);
      context.fill();

      // Dynamic status readout
      context.font = "700 8.5px \"JetBrains Mono\", monospace";
      context.textAlign = "right";
      const statusText = cyclePhase < 0.22 ? "CLASH DETECTED" : (cyclePhase < 0.72 ? "AUTO-REROUTING..." : "CONSTRAINT SATISFIED");
      context.fillStyle = cyclePhase < 0.22 ? "#ff8b7d" : "#9fe7e7";
      context.fillText(statusText, validCard.x + validCard.width, validCard.y - 12);
      context.textAlign = "left";
    }
  }
  context.restore();
}

function drawFallback2D(context, width, height, geometry) {
  context.clearRect(0, 0, width, height);
  geometry.cards.forEach((card) => {
    const c = card.conflict ? [0.925, 0.38, 0.32] : (card.valid ? [0.624, 0.906, 0.906] : card.pal.color);
    context.fillStyle = `rgb(${Math.round(c[0]*255)}, ${Math.round(c[1]*255)}, ${Math.round(c[2]*255)})`;
    context.fillRect(card.x, card.y, card.width, card.height);
  });
  drawLabels(context, width, height, geometry, 1, 0, true);
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
    const time = timestamp - state.startedAt;
    const elapsed = reducedMotion ? 1 : clamp(time / 2200, 0, 1);
    const scrollOrder = clamp(window.scrollY / Math.max(height * .72, 1), 0, 1);
    const progress = reducedMotion ? 1 : Math.max(.17 + elapsed * .83, .17 + scrollOrder * .83);
    pointer.x += (pointer.targetX - pointer.x) * .07;
    pointer.y += (pointer.targetY - pointer.y) * .07;

    const geometry = makeGeometry(width, height, progress, pointer, time, reducedMotion);
    if (renderer) renderer.draw(geometry.vertices.map((value, index) => index % 6 < 2 ? value * dpr : value), width * dpr, height * dpr);
    else drawFallback2D(labelContext, width, height, geometry);
    if (renderer) drawLabels(labelContext, width, height, geometry, progress, time, reducedMotion);
    root.classList.add("is-ready");

    // Continuous, living animation loop: always keeps playing!
    if (!reducedMotion) {
      state.raf = requestAnimationFrame(render);
    }
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
