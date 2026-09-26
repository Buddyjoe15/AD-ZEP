/* GPU unit renderer (WebGL2).
   Units are stamped from the shared sprite atlas (src/render/sprites.js) as one instanced
   textured quad each, all in a single draw call. Health bars
   are a second instanced call. This moves the per-unit cost from ~10 Canvas 2D commands to
   a few floats in a buffer, which is what lets tens of thousands of units share the screen.
   Without WebGL2 the game keeps using the Canvas 2D renderer. */
(function(){
  'use strict';
  const G = GW;

  const SA = () => G.SpriteAtlas;
  const FLOATS = 12;                    // per sprite: x, y, angle, radius | u0, v0 | rect x, y, w, h (world) | scale | pad
  const BAR_FLOATS = 8;                 // per bar: x, y, width, frac, r, g, b, pad

  const SPRITE_VS = `#version 300 es
    layout(location=0) in vec2 corner;
    layout(location=1) in vec4 inst;      // x, y, angle, radius
    layout(location=2) in vec2 uv0;       // atlas uv of the art's top-left
    layout(location=3) in vec4 rect;      // art bounds relative to the unit (world px): x, y, w, h
    layout(location=4) in float scale;    // atlas px per world px for this sprite
    uniform vec3 cam;                     // camera x, y, zoom
    uniform vec2 view;                    // viewport CSS px
    uniform vec2 cell;                    // atlas uv per atlas px (1 / atlas size)
    uniform float minPx;
    out vec2 vUv;
    void main(){
      float grow = max(1.0, minPx / max(0.001, inst.w * 2.0 * cam.z));   // keep tiny units visible
      vec2 local = (rect.xy + corner * rect.zw) * grow;
      float c = cos(inst.z), s = sin(inst.z);
      vec2 world = inst.xy + vec2(local.x * c - local.y * s, local.x * s + local.y * c);
      vec2 px = (world - cam.xy) * cam.z;
      gl_Position = vec4(px.x / view.x * 2.0 - 1.0, 1.0 - px.y / view.y * 2.0, 0.0, 1.0);
      vUv = uv0 + corner * rect.zw * scale * cell;
    }`;
  const SPRITE_FS = `#version 300 es
    precision mediump float;
    in vec2 vUv; uniform sampler2D atlas; uniform float shadow; out vec4 color;
    void main(){
      color = texture(atlas, vUv);
      if (shadow > 0.0){ if (color.a < 0.5) discard; color = vec4(0.0, 0.0, 0.0, shadow); return; }
      if (color.a < 0.02) discard;
    }`;
  const BAR_VS = `#version 300 es
    layout(location=0) in vec2 corner;
    layout(location=1) in vec4 inst;      // x (centre), y (top), width, fraction
    layout(location=2) in vec3 rgb;
    uniform vec3 cam; uniform vec2 view;
    out vec2 vC; out float vFrac; out vec3 vRgb;
    void main(){
      float h = max(4.0, 3.0 / cam.z);
      vec2 world = vec2(inst.x - inst.z * 0.5 + corner.x * inst.z, inst.y + corner.y * h);
      vec2 px = (world - cam.xy) * cam.z;
      gl_Position = vec4(px.x / view.x * 2.0 - 1.0, 1.0 - px.y / view.y * 2.0, 0.0, 1.0);
      vC = corner; vFrac = inst.w; vRgb = rgb;
    }`;
  const BAR_FS = `#version 300 es
    precision mediump float;
    in vec2 vC; in float vFrac; in vec3 vRgb; out vec4 color;
    void main(){ color = vC.x <= vFrac ? vec4(vRgb, 1.0) : vec4(0.067, 0.067, 0.067, 1.0); }`;

  function compile(gl, vs, fs){
    const mk = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  const hex = c => { const n = parseInt(c.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

  G.GPU = {
    ok: false, gl: null, canvas: null, reason: '',
    sprites: new Float32Array(FLOATS * 1024), shadows: new Float32Array(FLOATS * 256), bars: new Float32Array(BAR_FLOATS * 256),
    init(canvas){
      this.canvas = canvas;
      if (G.GPU_DISABLED){ this.reason = 'disabled'; return false; }
      // `?renderer=2d` forces Canvas 2D; `?renderer=gpu` allows a software (CPU-emulated) GPU,
      // which is otherwise refused because it would be slower than Canvas 2D.
      const mode = (typeof location !== 'undefined' && new URLSearchParams(location.search).get('renderer')) || 'auto';
      if (mode === '2d'){ this.reason = 'Canvas 2D requested'; return false; }
      let gl = null;
      try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: mode !== 'gpu' }); } catch (e){ gl = null; }
      if (!gl){ this.reason = mode === 'gpu' ? 'WebGL2 unavailable' : 'no hardware-accelerated WebGL2'; return false; }
      try {
        this.gl = gl;
        this.sprite = { prog: compile(gl, SPRITE_VS, SPRITE_FS) };
        this.bar = { prog: compile(gl, BAR_VS, BAR_FS) };
        for (const P of [this.sprite, this.bar]) for (const n of ['cam', 'view', 'cell', 'minPx', 'atlas', 'shadow']) P[n] = gl.getUniformLocation(P.prog, n);
        const quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
        const vao = (instBuf, layout) => {
          const v = gl.createVertexArray(); gl.bindVertexArray(v);
          gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
          for (const [loc, size, offset, stride] of layout){ gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, offset * 4); gl.vertexAttribDivisor(loc, 1); }
          gl.bindVertexArray(null);
          return v;
        };
        this.sprite.buf = gl.createBuffer(); this.bar.buf = gl.createBuffer();
        this.sprite.vao = vao(this.sprite.buf, [[1, 4, 0, FLOATS], [2, 2, 4, FLOATS], [3, 4, 6, FLOATS], [4, 1, 10, FLOATS]]);
        this.bar.vao = vao(this.bar.buf, [[1, 4, 0, BAR_FLOATS], [2, 3, 4, BAR_FLOATS]]);
        this.tex = gl.createTexture(); this.uploaded = -1;
        canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.ok = false; this.reason = 'context lost'; });
        this.ok = true;
      } catch (err){
        console.error('GPU renderer disabled:', err);
        this.ok = false; this.reason = String(err.message || err);
      }
      return this.ok;
    },
    resize(w, h, dpr){
      if (!this.canvas) return;
      this.canvas.width = Math.floor(w * dpr); this.canvas.height = Math.floor(h * dpr);
      this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    },
    clear(){ if (this.ok){ const gl = this.gl; gl.viewport(0, 0, this.canvas.width, this.canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); } },

    upload(){
      const gl = this.gl, A = SA();
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, A.canvas);
      if (G.PixelArt.enabled){
        // Pixel art: mipmaps point-sampled from the atlas (not averaged), and the nearest
        // texel of the nearest level, so zoomed-out units stay sharp instead of smudging.
        for (let n = 1; ; n++){
          const lv = A.level(n);
          gl.texImage2D(gl.TEXTURE_2D, n, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, lv);
          if (lv.width === 1 && lv.height === 1) break;
        }
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
      } else {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      }
      // Pixel art stays crisp when magnified; Canvas art is smoothed.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, G.PixelArt.enabled ? gl.NEAREST : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.uploaded = A.version;
    },
    grow(name, floats, n){
      if (this[name].length >= floats * n) return this[name];
      let size = this[name].length;
      while (size < floats * n) size *= 2;
      return (this[name] = new Float32Array(size));
    },
    // Draws `units` (already culled) and health bars for those in `barUnits`.
    draw(units, barUnits, t){
      if (!this.ok || !units.length && !barUnits.length) return;
      const gl = this.gl, S = G.State, c = S.camera, R = G.Renderer, D = G.Defs.units;
      // Pass 1: make sure every visible visual has atlas cells, then upload once if needed.
      const ents = this.ents || (this.ents = []);
      ents.length = units.length;
      for (let i = 0; i < units.length; i++){ const def = D.get(units[i].type); ents[i] = def ? SA().entryFor(def, units[i].team) : null; }
      if (this.uploaded !== SA().version) this.upload();
      // Pass 2: instance data. Pixel-art sprites also get a shadow instance at their offset.
      const A = SA(), AH = A.canvas.height, AW = A.canvas.width;
      const buf = this.grow('sprites', FLOATS, units.length), sb = this.grow('shadows', FLOATS, units.length);
      let n = 0, ns = 0;
      for (let i = 0; i < units.length; i++){
        const u = units[i], e = ents[i];
        if (!e) continue;
        const at = e.at[A.frame(e, u, t)], o = n * FLOATS;
        buf[o] = u.x; buf[o + 1] = u.y; buf[o + 2] = e.upright ? 0 : u.heading; buf[o + 3] = u.radius;
        buf[o + 4] = at[0] / AW; buf[o + 5] = at[1] / AH;
        buf[o + 6] = e.rect.x; buf[o + 7] = e.rect.y; buf[o + 8] = e.rect.w; buf[o + 9] = e.rect.h; buf[o + 10] = e.scale;
        n++;
        if (e.shadow){
          const q = ns * FLOATS;
          for (let k = 0; k < FLOATS; k++) sb[q + k] = buf[o + k];
          sb[q] += e.shadow[0]; sb[q + 1] += e.shadow[1];
          ns++;
        }
      }
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      if (n){
        const P = this.sprite;
        gl.useProgram(P.prog);
        gl.uniform3f(P.cam, c.x, c.y, c.z); gl.uniform2f(P.view, R.w, R.h);
        gl.uniform2f(P.cell, 1 / AW, 1 / AH);
        gl.uniform1f(P.minPx, 5);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.uniform1i(P.atlas, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, P.buf);
        gl.bindVertexArray(P.vao);
        if (ns){
          // Shadows first. MAX blending: where shadows overlap the result is one 55% shadow,
          // not two stacked ones. The layer is composited over the map, darkening it.
          gl.bufferData(gl.ARRAY_BUFFER, sb.subarray(0, ns * FLOATS), gl.STREAM_DRAW);
          gl.uniform1f(P.shadow, G.PixelArt.SHADOW_ALPHA);
          gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, ns);
          gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        }
        gl.uniform1f(P.shadow, 0);
        gl.bufferData(gl.ARRAY_BUFFER, buf.subarray(0, n * FLOATS), gl.STREAM_DRAW);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
      }
      if (barUnits.length){
        const bb = this.grow('bars', BAR_FLOATS, barUnits.length), good = hex('#5fd16b'), bad = hex('#e85e55');
        let m = 0;
        for (const u of barUnits){
          const frac = Math.max(0, Math.min(1, u.hp / u.maxHp)), col = frac > 0.45 ? good : bad, o = m * BAR_FLOATS;
          bb[o] = u.x; bb[o + 1] = u.y - (G.Defs.units.get(u.type)?.barOffset || 34); bb[o + 2] = 32; bb[o + 3] = frac;
          bb[o + 4] = col[0]; bb[o + 5] = col[1]; bb[o + 6] = col[2];
          m++;
        }
        const P = this.bar;
        gl.useProgram(P.prog);
        gl.uniform3f(P.cam, c.x, c.y, c.z); gl.uniform2f(P.view, R.w, R.h);
        gl.bindBuffer(gl.ARRAY_BUFFER, P.buf);
        gl.bufferData(gl.ARRAY_BUFFER, bb.subarray(0, m * BAR_FLOATS), gl.STREAM_DRAW);
        gl.bindVertexArray(P.vao);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, m);
      }
      gl.bindVertexArray(null);
      S.metrics.gpuSprites = n;
    }
  };
})();
