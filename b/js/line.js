(() => {
  const head = document.querySelector('.head');
  const area = document.querySelector('[data-line-area]');
  const cv = document.querySelector('[data-line-canvas]');
  if (!head || !area || !cv) return;
  const ctx = cv.getContext('2d');
  const countEl = document.querySelector('[data-line-count]');
  const nameEl = document.querySelector('[data-line-name]');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TAU = Math.PI * 2;
  const NAMES = { rest: '쉬는 선', projector: '영사기', film: '35mm 필름', pencil: '연필', stairs: '상상의 계단', hand: '동굴벽화 손바닥' };
  const ORDER = ['rest', 'projector', 'film', 'pencil', 'stairs'];
  const STEP = 1000 / 60;

  const P = {
    k: 0.055,
    c: 0.3,
    damp: 0.915,
    stagger: 0.5,
    move: 0.62,
    turb: 0.4,
    brushGain: 0.16,
    breath: 2,
    idle: 9000
  };

  let W = 0, H = 0, ox = 0, oy = 0, dpr = 1, N = 0, mobile = false, lastW = -1, cssW = 0, cssH = 0;
  let px, py, vx, vy, tx, ty, fx, fy, gx, gy;
  let shapes = {};
  let current = 'rest';
  let morphT0 = 0, morphing = false;
  let lastInput = performance.now();
  let hoverName = null;
  let visible = true, raf = 0, last = performance.now(), acc = 0;

  const ptr = { x: 0, y: 0, ix: 0, iy: 0, t: 0, active: false, grab: -1, down: false, sx: 0, sy: 0, moved: 0, type: 'mouse', gox: 0, goy: 0 };

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  const DRAW = {
    projector(g) {
      g.beginPath(); g.arc(30, 18.5, 15, 0, TAU); g.fill();
      g.beginPath(); g.arc(62.5, 23, 12.5, 0, TAU); g.fill();
      g.fillRect(28.8, 18, 2.4, 22);
      g.fillRect(61.3, 23, 2.4, 17);
      roundRect(g, 14, 38, 58, 24, 1.6); g.fill();
      g.fillRect(72, 44, 14, 12);
      g.fillRect(86, 42, 4.5, 16);
      g.fillRect(19, 62, 8, 8);
      g.fillRect(59, 62, 8, 8);
      g.fillRect(6, 47.6, 8.5, 2.6);
      g.beginPath(); g.arc(6.5, 48.9, 3, 0, TAU); g.fill();
    },
    film(g) {
      g.fillRect(27, 3, 46, 67);
      g.globalCompositeOperation = 'destination-out';
      for (let y = 7; y < 66; y += 8.4) {
        g.fillRect(26, y, 5.6, 4.2);
        g.fillRect(68.4, y, 5.6, 4.2);
      }
      g.globalCompositeOperation = 'source-over';
    },
    pencil(g) {
      g.translate(50, 40); g.rotate(-0.24); g.translate(-50, -40);
      roundRect(g, -4, 31, 12, 18, 5); g.fill();
      g.fillRect(5, 30, 10, 20);
      g.fillRect(15, 31, 64, 18);
      g.beginPath(); g.moveTo(79, 31); g.lineTo(101, 38.6); g.lineTo(101, 41.4); g.lineTo(79, 49); g.closePath(); g.fill();
    },
    stairs(g) {
      g.beginPath();
      const pts = [[6, 70], [6, 58], [22, 58], [22, 46], [38, 46], [38, 34], [54, 34], [54, 22], [70, 22], [70, 10], [94, 10], [94, 70]];
      g.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts) g.lineTo(p[0], p[1]);
      g.closePath();
      g.fill();
    },
    hand(g) {
      g.lineCap = 'round';
      const f = (x1, y1, x2, y2, w) => { g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
      roundRect(g, 37, 33, 28, 30, 11); g.fill();
      g.fillRect(41.5, 55, 19, 15);
      f(43, 40, 40.2, 11.5, 7.2);
      f(50.6, 38, 51.2, 6.2, 7.8);
      f(58, 40, 61, 10.2, 7.3);
      f(63.2, 46, 68.8, 21.5, 6.3);
      f(40.5, 53, 26.5, 38.5, 8.2);
    }
  };

  const DX = [-1, -1, 0, 1, 1, 1, 0, -1];
  const DY = [0, -1, -1, -1, 0, 1, 1, 1];
  function dirOf(dx, dy) {
    for (let i = 0; i < 8; i++) if (DX[i] === dx && DY[i] === dy) return i;
    return 0;
  }

  function trace(mask, w, h) {
    let sx = -1, sy = -1;
    outer: for (let x = 0; x < w; x++) {
      for (let y = h - 1; y >= 0; y--) {
        if (mask[y * w + x]) { sx = x; sy = y; break outer; }
      }
    }
    if (sx < 0) return [];
    const pts = [[sx, sy]];
    let cx = sx, cy = sy, dir = 0;
    const limit = w * h * 2;
    for (let it = 0; it < limit; it++) {
      let found = false;
      for (let k = 1; k <= 8; k++) {
        const d = (dir + k) % 8;
        const nx = cx + DX[d], ny = cy + DY[d];
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && mask[ny * w + nx]) {
          const bd = (d + 7) % 8;
          const bx = cx + DX[bd], by = cy + DY[bd];
          cx = nx; cy = ny;
          dir = dirOf(bx - cx, by - cy);
          found = true;
          break;
        }
      }
      if (!found || (cx === sx && cy === sy)) break;
      pts.push([cx, cy]);
    }
    return pts;
  }

  function smooth(pts, r) {
    const n = pts.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      let sx = 0, sy = 0;
      for (let k = -r; k <= r; k++) {
        const p = pts[(i + k + n) % n];
        sx += p[0]; sy += p[1];
      }
      out[i] = [sx / (2 * r + 1), sy / (2 * r + 1)];
    }
    return out;
  }

  function silhouette(name, bw, bh) {
    const S = mobile ? 3 : 1.6;
    const cw = Math.ceil(bw * S), ch = Math.ceil(bh * S);
    const c = document.createElement('canvas');
    c.width = cw + 6; c.height = ch + 6;
    const g = c.getContext('2d', { willReadFrequently: true });
    const s = Math.min(cw / 100, ch / 70);
    g.translate(3 + (cw - 100 * s) / 2, 3 + ch - 70 * s);
    g.scale(s, s);
    g.fillStyle = '#000';
    g.strokeStyle = '#000';
    DRAW[name](g);
    const w = c.width, h = c.height;
    const data = g.getImageData(0, 0, w, h).data;
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) mask[i] = data[i * 4 + 3] > 127 ? 1 : 0;
    const raw = trace(mask, w, h);
    const sm = smooth(raw, Math.max(2, Math.round(S * 1.6)));
    return sm.map((p) => [(p[0] - 3) / S, (p[1] - 3) / S]);
  }

  function resample(pts, corners, n) {
    const L = [0];
    for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = L[L.length - 1] || 1;
    const out = new Float32Array(n * 2);
    let j = 0;
    for (let k = 0; k < n; k++) {
      const s = total * k / (n - 1);
      while (j < pts.length - 2 && L[j + 1] < s) j++;
      const seg = (L[j + 1] - L[j]) || 1;
      const u = Math.min(1, Math.max(0, (s - L[j]) / seg));
      out[k * 2] = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * u;
      out[k * 2 + 1] = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * u;
    }
    for (const ci of corners) {
      const k = Math.round(L[ci] / total * (n - 1));
      out[k * 2] = pts[ci][0];
      out[k * 2 + 1] = pts[ci][1];
    }
    return out;
  }

  function geometry() {
    const f1 = mobile ? 0.5 : 0.552;
    return {
      f1,
      yg: (mobile ? 0.86 : 0.8) * H,
      bx0: f1 * W + (mobile ? 0.06 : 0.05) * W,
      bx1: W - (mobile ? 0.04 : 0.035) * W,
      by0: (mobile ? 0.04 : 0.05) * H
    };
  }

  function restShape() {
    const { f1 } = geometry();
    const t2 = mobile ? 0.78 : 0.8;
    const pts = [[0, 0], [f1 * W, H], [f1 * W, 0], [t2 * W, t2 * H], [t2 * W, 0], [W, 0.55 * H], [W, 0]];
    return resample(pts, pts.map((_, i) => i), N);
  }

  function objectShape(name) {
    const { f1, yg, bx0, bx1, by0 } = geometry();
    const bw = bx1 - bx0, bh = yg - by0;
    let c = silhouette(name, bw, bh);
    if (!c.length) return restShape();
    let maxY = -1;
    for (const p of c) if (p[1] > maxY) maxY = p[1];
    const dy = bh - maxY;
    c = c.map((p) => [bx0 + p[0], by0 + p[1] + dy]);
    let si = 0, best = Infinity;
    for (let i = 0; i < c.length; i++) {
      const sc = c[i][0] - c[i][1] * 3;
      if (sc < best) { best = sc; si = i; }
    }
    c = c.slice(si).concat(c.slice(0, si));
    const e = c[0];
    const head = [[0, 0], [f1 * W, H], [f1 * W, yg], [e[0], yg]];
    const pts = head.concat(c, [c[0], [e[0], yg], [W, yg], [W, 0]]);
    const n = pts.length;
    const corners = [0, 1, 2, 3, n - 3, n - 2, n - 1];
    return resample(pts, corners, N);
  }

  function buildShapes() {
    shapes = { rest: restShape() };
    for (const k of Object.keys(DRAW)) shapes[k] = objectShape(k);
  }

  function layout(force) {
    const hr = head.getBoundingClientRect();
    const ar = area.getBoundingClientRect();
    if (!force && Math.abs(ar.width - lastW) < 0.5) return;
    lastW = ar.width;
    mobile = window.innerWidth < 768;
    W = ar.width;
    H = ar.height;
    ox = ar.left - hr.left;
    oy = ar.top - hr.top;
    cssW = hr.width;
    cssH = Math.ceil(oy + H + (mobile ? 26 : 40));
    cv.style.height = cssH + 'px';
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    N = Math.round(Math.min(340, Math.max(200, W * 0.24)));
    px = new Float32Array(N); py = new Float32Array(N);
    vx = new Float32Array(N); vy = new Float32Array(N);
    tx = new Float32Array(N); ty = new Float32Array(N);
    fx = new Float32Array(N); fy = new Float32Array(N);
    gx = new Float32Array(N); gy = new Float32Array(N);
    buildShapes();
    const s = shapes[current];
    for (let i = 0; i < N; i++) {
      gx[i] = tx[i] = px[i] = s[i * 2];
      gy[i] = ty[i] = py[i] = s[i * 2 + 1];
    }
    morphing = false;
    ptr.grab = -1;
    if (countEl) countEl.textContent = String(N);
    draw();
  }

  function setName(name) {
    if (nameEl) nameEl.textContent = NAMES[name];
  }

  function morphTo(name) {
    if (!shapes[name]) return;
    if (name === current && !morphing) return;
    const s = shapes[name];
    for (let i = 0; i < N; i++) {
      fx[i] = tx[i]; fy[i] = ty[i];
      gx[i] = s[i * 2]; gy[i] = s[i * 2 + 1];
    }
    morphT0 = performance.now();
    morphing = true;
    current = name;
    setName(name);
    wake();
  }

  function nextShape() {
    const i = ORDER.indexOf(current);
    morphTo(ORDER[(i + 1) % ORDER.length]);
  }

  function noise(i, t) {
    return Math.sin(i * 0.083 + t * 2.1) * 0.55 + Math.sin(i * 0.031 - t * 1.37 + 2.1) * 0.45;
  }

  function updateTargets(now) {
    const t = (now - morphT0) / 1000;
    if (morphing) {
      const amp = P.turb * (mobile ? 22 : 46);
      let done = true;
      for (let i = 0; i < N; i++) {
        const d = P.stagger * i / (N - 1);
        let u = (t - d) / P.move;
        if (u < 1) done = false;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
        const tb = Math.sin(Math.PI * u) * amp;
        tx[i] = fx[i] + (gx[i] - fx[i]) * e + noise(i, t) * tb;
        ty[i] = fy[i] + (gy[i] - fy[i]) * e + noise(i + 977, t) * tb;
      }
      if (done) morphing = false;
      return;
    }
    const bt = reduce ? 0 : P.breath;
    const ph = now / 6000 * TAU;
    for (let i = 0; i < N; i++) {
      const win = Math.sin(Math.PI * i / (N - 1));
      tx[i] = gx[i];
      ty[i] = gy[i] + bt * win * Math.sin(ph - i * 0.045);
    }
  }

  function step(now) {
    updateTargets(now);
    const n = N;
    if (ptr.active && (ptr.ix || ptr.iy) && ptr.grab < 0) {
      const R = mobile ? 58 : 92;
      const lx = ptr.x - ox, ly = ptr.y - oy;
      for (let i = 1; i < n - 1; i++) {
        const dx = px[i] - lx, dy = py[i] - ly;
        const d2 = dx * dx + dy * dy;
        if (d2 > R * R) continue;
        const f = 1 - Math.sqrt(d2) / R;
        const w = f * f * P.brushGain;
        vx[i] += ptr.ix * w;
        vy[i] += ptr.iy * w;
      }
      ptr.ix = 0;
      ptr.iy = 0;
    }
    for (let i = 1; i < n - 1; i++) {
      const dx = px[i] - tx[i], dy = py[i] - ty[i];
      const lapx = ((px[i - 1] - tx[i - 1]) + (px[i + 1] - tx[i + 1])) * 0.5 - dx;
      const lapy = ((py[i - 1] - ty[i - 1]) + (py[i + 1] - ty[i + 1])) * 0.5 - dy;
      vx[i] = (vx[i] - P.k * dx + P.c * lapx) * P.damp;
      vy[i] = (vy[i] - P.k * dy + P.c * lapy) * P.damp;
    }
    for (let i = 1; i < n - 1; i++) {
      px[i] += vx[i];
      py[i] += vy[i];
    }
    px[0] = tx[0]; py[0] = ty[0];
    px[n - 1] = tx[n - 1]; py[n - 1] = ty[n - 1];
    if (ptr.grab >= 0) {
      const g = ptr.grab;
      const lx = ptr.x - ox, ly = ptr.y - oy;
      let Dx = lx - tx[g], Dy = ly - ty[g];
      const len = Math.hypot(Dx, Dy) || 1;
      const soft = 1 / (1 + len / (mobile ? 120 : 240));
      Dx *= soft; Dy *= soft;
      const sig = mobile ? 15 : 14;
      const span = Math.ceil(sig * 3);
      for (let j = Math.max(1, g - span); j <= Math.min(n - 2, g + span); j++) {
        const q = (j - g) / sig;
        const w = Math.exp(-q * q);
        const ax = tx[j] + Dx * w, ay = ty[j] + Dy * w;
        px[j] += (ax - px[j]) * 0.45;
        py[j] += (ay - py[j]) * 0.45;
        vx[j] *= 0.5;
        vy[j] *= 0.5;
      }
    }
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    if (!N) return;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#000';
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 4;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(ox + px[0], oy + py[0]);
    for (let i = 1; i < N; i++) ctx.lineTo(ox + px[i], oy + py[i]);
    ctx.stroke();
  }

  function energy() {
    let e = 0;
    for (let i = 0; i < N; i++) e += Math.abs(vx[i]) + Math.abs(vy[i]) + Math.abs(px[i] - tx[i]) + Math.abs(py[i] - ty[i]);
    return e;
  }

  function frame(now) {
    raf = 0;
    if (!visible || !N) return;
    let dt = now - last;
    last = now;
    if (dt > 100) dt = 100;
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 3) {
      step(now);
      acc -= STEP;
      steps++;
    }
    if (steps === 3) acc = 0;
    draw();
    if (!reduce && !hoverName && !morphing && ptr.grab < 0 && now - lastInput > P.idle) {
      lastInput = now;
      nextShape();
    }
    const calm = reduce && !morphing && ptr.grab < 0 && energy() < 0.05 * N;
    if (!calm) raf = requestAnimationFrame(frame);
  }

  function wake() {
    if (!raf && visible) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  function local(e) {
    const r = head.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  function nearest(x, y) {
    const lx = x - ox, ly = y - oy;
    let bi = -1, bd = Infinity;
    for (let i = 1; i < N - 1; i++) {
      const d = (px[i] - lx) ** 2 + (py[i] - ly) ** 2;
      if (d < bd) { bd = d; bi = i; }
    }
    return [bi, Math.sqrt(bd)];
  }

  head.addEventListener('pointermove', (e) => {
    const [x, y] = local(e);
    const now = e.timeStamp || performance.now();
    if (ptr.active) {
      const dtm = Math.max(4, now - ptr.t);
      let ix = (x - ptr.x) / dtm * STEP, iy = (y - ptr.y) / dtm * STEP;
      const m = Math.hypot(ix, iy);
      if (m > 60) { ix *= 60 / m; iy *= 60 / m; }
      ptr.ix += ix;
      ptr.iy += iy;
    }
    if (ptr.down) ptr.moved = Math.max(ptr.moved, Math.hypot(x - ptr.sx, y - ptr.sy));
    ptr.x = x;
    ptr.y = y;
    ptr.t = now;
    ptr.active = true;
    ptr.type = e.pointerType;
    lastInput = performance.now();
    wake();
  });

  head.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') ptr.active = false;
  });

  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('a,button')) return;
    const [x, y] = local(e);
    ptr.down = true;
    ptr.sx = x; ptr.sy = y; ptr.moved = 0;
    ptr.x = x; ptr.y = y; ptr.t = e.timeStamp || performance.now();
    ptr.active = true;
    const [i, d] = nearest(x, y);
    const reach = e.pointerType === 'mouse' ? 24 : 36;
    if (i > 0 && d < reach) {
      ptr.grab = i;
      if (e.pointerType === 'mouse') e.preventDefault();
    }
    lastInput = performance.now();
    wake();
  });

  function release() {
    ptr.down = false;
    ptr.grab = -1;
    if (ptr.type !== 'mouse') ptr.active = false;
  }
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  head.addEventListener('click', (e) => {
    if (e.target.closest('a,button')) return;
    if (ptr.moved > 8) return;
    lastInput = performance.now();
    nextShape();
  });

  document.querySelectorAll('[data-shape]').forEach((el) => {
    el.addEventListener('mouseenter', () => {
      if (mobile) return;
      hoverName = el.dataset.shape;
      morphTo(hoverName);
    });
    el.addEventListener('mouseleave', () => {
      if (mobile) return;
      hoverName = null;
      lastInput = performance.now();
      morphTo('rest');
    });
  });

  let rt = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { layout(false); wake(); }, 200);
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((ents) => {
      visible = ents[0].isIntersecting;
      if (visible) wake();
    }).observe(head);
  }

  setName(current);
  const start = () => { layout(true); wake(); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start); else start();
})();
