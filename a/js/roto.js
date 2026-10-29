(() => {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const canvas = hero.querySelector('.hero-gl');
  const cursor = hero.querySelector('.cursor');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const FY = 0.42;
  const SUBJ = 0.55;
  const HOLD = 1.1;
  const IMG_W = 1920;
  const IMG_H = 1071;
  const MS = 4;
  const TAU = 1.1;
  const STAMP = 0.34;

  let gl = null;
  try {
    gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false });
  } catch (e) {
    gl = null;
  }
  if (!gl) {
    hero.classList.add('no-gl');
    return;
  }

  const VS = 'attribute vec2 p;varying vec2 v;void main(){v=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}';
  const FS = [
    'precision mediump float;',
    'varying vec2 v;',
    'uniform sampler2D uPhoto,uCel,uLines,uMask;',
    'uniform vec4 uCrop;',
    'uniform float uFrame,uAspect,uWipeA;',
    'uniform vec3 uWipe;',
    'void main(){',
    ' vec2 iuv=uCrop.xy+v*uCrop.zw;',
    ' vec3 ph=texture2D(uPhoto,iuv).rgb;',
    ' vec3 ce=texture2D(uCel,iuv).rgb;',
    ' vec3 L=texture2D(uLines,iuv).rgb;',
    ' float ln=uFrame<.5?L.r:(uFrame<1.5?L.g:L.b);',
    ' float m=texture2D(uMask,v).r*1.25;',
    ' vec2 d=(v-uWipe.xy)*vec2(uAspect,1.);',
    ' float w=uWipeA*(1.-smoothstep(uWipe.z-.14,uWipe.z,length(d)));',
    ' m=max(m,w);',
    ' float fill=smoothstep(.42,.78,m);',
    ' float la=smoothstep(.08,.3,m);',
    ' vec3 c=mix(ph,ce,fill);',
    ' c=mix(c,vec3(.09,.08,.12),ln*la);',
    ' gl_FragColor=vec4(c,1.);',
    '}'
  ].join('\n');

  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
  } catch (e) {
    hero.classList.add('no-gl');
    return;
  }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aP = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(aP);
  gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  ['uPhoto', 'uCel', 'uLines', 'uMask', 'uCrop', 'uFrame', 'uAspect', 'uWipeA', 'uWipe'].forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });

  const tex = (unit) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const tPhoto = tex(0);
  const tCel = tex(1);
  const tLines = tex(2);
  const tMask = tex(3);
  gl.uniform1i(U.uPhoto, 0);
  gl.uniform1i(U.uCel, 1);
  gl.uniform1i(U.uLines, 2);
  gl.uniform1i(U.uMask, 3);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);

  let cw = 0;
  let ch = 0;
  let mw = 0;
  let mh = 0;
  let mask = new Float32Array(1);
  let stampT = new Float32Array(1);
  let mask8 = new Uint8Array(1);
  let crop = [0, 0, 1, 1];
  let ready = false;
  let active = false;
  let dirty = true;
  let last = null;
  let wipe = null;
  let demo = null;
  let lastInput = performance.now();
  let visible = true;
  let raf = 0;

  const brushR = () => (fine ? 105 : 72);

  const size = () => {
    const r = hero.getBoundingClientRect();
    const w = Math.round(r.width);
    const h = Math.round(r.height);
    if (w === cw && h === ch) return;
    cw = w;
    ch = h;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    mw = Math.max(1, Math.ceil(w / MS));
    mh = Math.max(1, Math.ceil(h / MS));
    mask = new Float32Array(mw * mh);
    stampT = new Float32Array(mw * mh);
    mask8 = new Uint8Array(mw * mh);
    const s = Math.max(w / IMG_W, h / IMG_H);
    const z = w / h > 1.2 ? 1.18 : 1;
    const su = w / s / IMG_W / z;
    const sv = h / s / IMG_H / z;
    const want = SUBJ - (w < 760 ? 0.8 : 0.68) * su;
    const ou = Math.max(0, Math.min(1 - su, want));
    crop = [ou, (1 - sv) * FY, su, sv];
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, tMask);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, mw, mh, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, mask8);
    if (cursor) cursor.style.setProperty('--d', Math.round(brushR() * 1.84) + 'px');
    dirty = true;
  };

  const stamp = (x, y, str) => {
    const r = brushR() / MS;
    const ts = performance.now() / 1000;
    const cx = x / MS;
    const cy = y / MS;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(mw - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(mh - 1, Math.ceil(cy + r));
    for (let j = y0; j <= y1; j++) {
      const dy = j + 0.5 - cy;
      for (let i = x0; i <= x1; i++) {
        const dx = i + 0.5 - cx;
        const d = Math.sqrt(dx * dx + dy * dy) / r;
        if (d >= 1) continue;
        const t = d < 0.5 ? 0 : (d - 0.5) / 0.5;
        const f = 1 - t * t * (3 - 2 * t);
        const k = j * mw + i;
        const nv = mask[k] + str * f;
        mask[k] = nv > 1.25 ? 1.25 : nv;
        stampT[k] = ts;
      }
    }
    active = true;
  };

  const strokeTo = (x, y, str) => {
    if (last) {
      const dx = x - last.x;
      const dy = y - last.y;
      const dist = Math.hypot(dx, dy);
      const step = brushR() * 0.3;
      const n = Math.min(60, Math.max(1, Math.ceil(dist / step)));
      for (let i = 1; i <= n; i++) stamp(last.x + (dx * i) / n, last.y + (dy * i) / n, str);
    } else {
      stamp(x, y, str);
    }
    last = { x, y };
  };

  const local = (cx, cy) => {
    const r = hero.getBoundingClientRect();
    return { x: cx - r.left, y: cy - r.top };
  };

  const startWipe = (x, y) => {
    const u = x / cw;
    const v = y / ch;
    const asp = cw / ch;
    let maxR = 0;
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([a, b]) => { maxR = Math.max(maxR, Math.hypot((a - u) * asp, b - v)); });
    wipe = { u, v, t0: performance.now(), maxR: maxR + 0.16 };
  };

  const toScreen = (u, v) => ({ x: ((u - crop[0]) / crop[2]) * cw, y: ((v - crop[1]) / crop[3]) * ch });
  const PATHS = [
    [[0.46, 0.1], [0.62, 0.18], [0.49, 0.3], [0.61, 0.43], [0.47, 0.56], [0.62, 0.7], [0.5, 0.86]],
    [[0.62, 0.62], [0.5, 0.48], [0.56, 0.3], [0.46, 0.18]],
    [[0.4, 0.7], [0.52, 0.6], [0.6, 0.72], [0.66, 0.58]]
  ];
  const catmull = (pts, t) => {
    const n = pts.length - 1;
    const f = Math.min(n - 1e-6, t * n);
    const i = Math.floor(f);
    const s = f - i;
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n, i + 2)];
    const c = (a, b, cc, d) => 0.5 * (2 * b + (-a + cc) * s + (2 * a - 5 * b + 4 * cc - d) * s * s + (-a + 3 * b - 3 * cc + d) * s * s * s);
    return [c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])];
  };
  const startDemo = (idx, dur) => {
    demo = { pts: PATHS[idx % PATHS.length], t0: performance.now(), dur };
    last = null;
  };

  hero.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const p = local(e.clientX, e.clientY);
    lastInput = performance.now();
    if (demo) { demo = null; last = null; }
    strokeTo(p.x, p.y, STAMP);
    if (cursor) {
      cursor.classList.add('on');
      cur.tx = p.x;
      cur.ty = p.y;
      if (!cur.seen) { cur.x = p.x; cur.y = p.y; cur.seen = true; }
    }
  });
  hero.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'touch') return;
    last = null;
    if (cursor) cursor.classList.remove('on');
    cur.seen = false;
  });
  hero.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    if (!t) return;
    lastInput = performance.now();
    demo = null;
    last = null;
    const p = local(t.clientX, t.clientY);
    strokeTo(p.x, p.y, STAMP);
  }, { passive: true });
  hero.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (!t) return;
    lastInput = performance.now();
    const p = local(t.clientX, t.clientY);
    strokeTo(p.x, p.y, STAMP);
  }, { passive: true });
  hero.addEventListener('touchend', () => { last = null; }, { passive: true });
  hero.addEventListener('click', (e) => {
    if (e.target.closest('a,button')) return;
    const p = local(e.clientX, e.clientY);
    lastInput = performance.now();
    startWipe(p.x, p.y);
  });

  const cur = { x: 0, y: 0, tx: 0, ty: 0, seen: false };

  let acc = 0;
  let prevT = performance.now();
  let nextIdle = 0;
  let idleIdx = 1;

  const frame = (now) => {
    raf = 0;
    if (!visible || !ready) return;
    const dt = Math.min(0.1, (now - prevT) / 1000);
    prevT = now;

    if (demo) {
      const t = (now - demo.t0) / demo.dur;
      if (t >= 1) {
        demo = null;
        last = null;
      } else {
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const uv = catmull(demo.pts, e);
        const p = toScreen(uv[0], uv[1]);
        strokeTo(Math.max(0, Math.min(cw, p.x)), Math.max(0, Math.min(ch, p.y)), STAMP);
      }
    } else if (!reduce && now > nextIdle && now - lastInput > 6000) {
      startDemo(idleIdx++, 900);
      nextIdle = now + 7000;
    }

    acc += dt;
    let steps = 0;
    const decay = Math.exp(-1 / 60 / TAU);
    while (acc >= 1 / 60 && steps < 3) {
      acc -= 1 / 60;
      steps++;
      if (active) {
        let any = false;
        const ns = now / 1000;
        for (let k = 0; k < mask.length; k++) {
          const m = mask[k];
          if (m > 0) {
            if (ns - stampT[k] < HOLD) { any = true; continue; }
            const nm = m * decay;
            mask[k] = nm < 0.004 ? 0 : nm;
            if (nm >= 0.004) any = true;
          }
        }
        active = any;
        dirty = true;
      }
    }
    if (acc > 1 / 20) acc = 0;

    let wipeA = 0;
    let wipeR = 0;
    if (wipe) {
      const t = (now - wipe.t0) / 1000;
      const e = 1 - Math.pow(1 - Math.min(1, t / 0.55), 3);
      wipeR = e * wipe.maxR;
      wipeA = t > 1.65 ? Math.exp(-(t - 1.65) / 0.6) : 1;
      if (wipeA < 0.01) wipe = null;
      dirty = true;
    }

    if (cursor && cur.seen) {
      const k = 1 - Math.exp(-dt * 15);
      cur.x += (cur.tx - cur.x) * k;
      cur.y += (cur.ty - cur.y) * k;
      cursor.style.transform = 'translate3d(' + cur.x.toFixed(1) + 'px,' + cur.y.toFixed(1) + 'px,0)';
    }

    if (dirty) {
      for (let k = 0; k < mask.length; k++) mask8[k] = mask[k] * 204;
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, tMask);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, mw, mh, gl.LUMINANCE, gl.UNSIGNED_BYTE, mask8);
      gl.uniform4f(U.uCrop, crop[0], crop[1], crop[2], crop[3]);
      gl.uniform1f(U.uFrame, Math.floor(now / (1000 / 12)) % 3);
      gl.uniform1f(U.uAspect, cw / ch);
      gl.uniform3f(U.uWipe, wipe ? wipe.u : 0, wipe ? wipe.v : 0, wipeR);
      gl.uniform1f(U.uWipeA, wipeA);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      dirty = active || !!wipe;
    }
    raf = requestAnimationFrame(frame);
  };

  const kick = () => {
    if (!raf && visible && ready) {
      prevT = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };
  ['pointermove', 'touchstart', 'touchmove', 'click'].forEach((ev) => hero.addEventListener(ev, kick, { passive: true }));

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => {
      visible = es[0].isIntersecting;
      if (visible) { dirty = true; kick(); }
    }).observe(hero);
  }

  let rt = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      const w = Math.round(hero.getBoundingClientRect().width);
      if (w === cw && Math.abs(Math.round(hero.getBoundingClientRect().height) - ch) < 2) return;
      size();
      dirty = true;
      kick();
    }, 200);
  });

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    ready = false;
    canvas.classList.remove('on');
    hero.classList.add('no-gl');
  });

  const load = (src) => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
  const upload = (unit, t, im) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im);
  };

  setTimeout(() => { if (!ready) hero.classList.add('slow'); }, 4000);
  Promise.all([load('../shared/photos/projector-toy.jpg'), load('img/cel.jpg'), load('img/lines.png')]).then(([a, b, c]) => {
    upload(0, tPhoto, a);
    upload(1, tCel, b);
    upload(2, tLines, c);
    size();
    ready = true;
    dirty = true;
    prevT = performance.now();
    frame(prevT);
    requestAnimationFrame(() => canvas.classList.add('on'));
    if (!reduce) {
      setTimeout(() => { if (performance.now() - lastInput > 1000) { startDemo(0, 1900); kick(); } }, 1200);
      nextIdle = performance.now() + 9000;
    }
  }).catch(() => hero.classList.add('no-gl'));
})();
