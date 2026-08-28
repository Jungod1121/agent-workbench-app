/* ============================================================
   liquid-glass.js v3 — 液态玻璃引擎（WebGL 真折射）
   ============================================================
   渲染管线（场景快照 → 局部裁剪 → 高斯模糊 → SDF 曲面着色器）：
     1. 栅格化玻璃后面的真实 DOM 内容（SVG foreignObject 快照）
     2. 每个面板：局部裁剪出"面板+阴影边距"区域上传纹理
     3. 9-tap 高斯模糊：blurA/blurB ping-pong × 6 轮（spread = blur*2.5）
     4. 玻璃着色器（SDF + bevel 高度场）：
        双面 Snell 折射（含厚度调制）→ 色散 → 边缘回锐混合
        → 微噪声畸变 → 亮度/饱和度/冷色调 → Fresnel
        → 四光源 Blinn-Phong 高光 → 内描边（顶边加重）+ 内辉光
        → SDF 柔和投影
     5. readPixels 注入每块玻璃的 canvas（面板内容在上层）

   用法：
     <div data-lg-scene>
       …背景内容（文字/图形/图片）…
       <div data-liquid-glass data-lg-preset="regular">面板</div>
     </div>
     <script src="liquid-glass.js"></script>

   预设：
     regular   blur .28 / refraction 1.05 / chroma .10 / 微暗
     clear     高透：blur .08 / refraction .90
     thick     暗玻璃：blur .50 / brightness -.28
     magnifier dome 放大镜：bevelMode 1 / refraction 1.2
     button    胶囊按钮：hover 变亮、按下压扁

   可调参数（data-lg-config JSON）：
     blur, refraction, chroma, edge, spec, fresnel, distortion,
     cornerRadius, zRadius, tint, brightness, saturation, opacity,
     shadowOpacity, shadowSpread, shadowOffsetY, bevelMode

   API：
     const inst = await ApxLiquidGlass.init({root, glassElements, defaults});
     inst.markChanged(el?); inst.destroy(); inst.fps
   无 WebGL 时自动加载 liquid-glass-svg.js 回退引擎。
   ============================================================ */
(function () {
  'use strict';

  var MAX_TEX = 4096;      // 场景纹理最大边长（面板局部裁剪后通常很小）
  var MAX_PANEL = 2048;    // 面板渲染缓冲最大边长（dpr 缩放后封顶）
  var DPR_CAP = 2;
  var BLUR_ITERATIONS = 6; // 多轮小半径模糊，平滑无马赛克
  var SHADOW_PAD = 20;     // 面板外阴影边距 px

  /* 预设 = DEFAULTS 基座 + 各款覆盖值：
     DEFAULTS: blur 0 / refraction 0.69 / chroma 0.05 / edge 0.05 / spec 0 /
               fresnel 1 / corner 65 / zR 40 / tint 0 / brightness 0 /
               shadowA 0.3 / spread 10 / offY 1 */
  var PRESETS = {
    /* hero 标题款：blur .3 + chroma .2 + corner/zR 60 + refraction 1.2 + brightness -.2 */
    regular:   { blur: 0.30, refraction: 1.2, chroma: 0.20, edge: 0.05, spec: 0,
                 fresnel: 1.0, distortion: 0, cornerRadius: 60, zRadius: 60,
                 tint: 0, brightness: -0.20, saturation: 0, opacity: 1,
                 shadowOpacity: 0.30, shadowSpread: 10, shadowOffsetY: 1, bevelMode: 0 },
    /* Frosted 款：blur .25 + corner 30 */
    clear:     { blur: 0.25, refraction: 0.69, chroma: 0.05, edge: 0.05, spec: 0,
                 fresnel: 1.0, distortion: 0, cornerRadius: 30, zRadius: 40,
                 tint: 0, brightness: 0, saturation: 0, opacity: 1,
                 shadowOpacity: 0.30, shadowSpread: 10, shadowOffsetY: 1, bevelMode: 0 },
    /* Dark 款：brightness -.3 + blur .25 + corner 50 */
    thick:     { blur: 0.25, refraction: 0.69, chroma: 0.05, edge: 0.05, spec: 0,
                 fresnel: 1.0, distortion: 0, cornerRadius: 50, zRadius: 40,
                 tint: 0, brightness: -0.30, saturation: 0, opacity: 1,
                 shadowOpacity: 0.30, shadowSpread: 10, shadowOffsetY: 1, bevelMode: 0 },
    /* 放大镜：dome + corner/zR 50 + refraction 1.2 + edge .15 + 阴影 .2 */
    magnifier: { blur: 0, refraction: 1.2, chroma: 0.05, edge: 0.15, spec: 0,
                 fresnel: 1.0, distortion: 0, cornerRadius: 50, zRadius: 50,
                 tint: 0, brightness: 0, saturation: 0, opacity: 1,
                 shadowOpacity: 0.20, shadowSpread: 10, shadowOffsetY: 1, bevelMode: 1 },
    /* 按钮：button 语义 + corner 28 + blur .3 + brightness -.1 */
    button:    { blur: 0.30, refraction: 0.69, chroma: 0.05, edge: 0.05, spec: 0,
                 fresnel: 1.0, distortion: 0, cornerRadius: 28, zRadius: 40,
                 tint: 0, brightness: -0.10, saturation: 0, opacity: 1,
                 shadowOpacity: 0.30, shadowSpread: 10, shadowOffsetY: 1, bevelMode: 0 }
  };

  /* ---------- 配置合并 ---------- */
  function configOf(el, defaults) {
    var cfg = Object.assign({}, PRESETS[el.dataset.lgPreset || 'regular']);
    if (defaults) Object.assign(cfg, defaults);
    if (el.dataset.lgConfig) {
      try { Object.assign(cfg, JSON.parse(el.dataset.lgConfig)); }
      catch (e) { console.warn('[liquid-glass] 非法 data-lg-config', e); }
    }
    /* 圆角优先级：data-lg-config 显式值 > 预设值 > CSS border-radius 兜底 */
    var cssR = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    var hasExplicit = !!el.dataset.lgConfig && /cornerRadius/.test(el.dataset.lgConfig);
    var fromPreset = cfg.cornerRadius !== undefined && cfg.cornerRadius > 0 && cfg.cornerRadius !== 999;
    if (!hasExplicit && !fromPreset && cssR > 0) cfg.cornerRadius = cssR;
    return cfg;
  }

  /* ---------- GLSL ---------- */
  var VS_QUAD = [
    'attribute vec2 a_pos;',
    'varying vec2 v_uv;',
    'void main(){ v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }'
  ].join('\n');

  /* 面板顶点着色器：half-quad（±0.5）→ 局部 px / 裁剪区 UV */
  var VS_GLASS = [
    'attribute vec2 a_pos;',       // 半 quad：[-0.5, 0.5]
    'uniform vec2 u_center;',      // 裁剪区中心 = u_res * 0.5
    'uniform vec2 u_size;',        // 面板 CSS 尺寸
    'uniform vec2 u_res;',         // 裁剪区 CSS 尺寸 = u_size + 2*u_pad
    'uniform float u_pad;',
    'varying vec2 v_local;',
    'varying vec2 v_uv;',
    'void main(){',
    '  vec2 total = u_size + vec2(u_pad * 2.0);',
    '  v_local = a_pos * total;',
    '  vec2 px = u_center + v_local;',
    '  v_uv = vec2(px.x / u_res.x, 1.0 - px.y / u_res.y);',
    '  vec2 ndc = (px / u_res) * 2.0 - 1.0;',
    '  ndc.y = -ndc.y;',
    '  gl_Position = vec4(ndc, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FS_BLIT = [
    'precision mediump float;',
    'uniform sampler2D u_tex; uniform vec2 u_scale; uniform vec2 u_offset;',
    'varying vec2 v_uv;',
    'void main(){ gl_FragColor = texture2D(u_tex, v_uv * u_scale + u_offset); }'
  ].join('\n');

  var FS_BLUR = [
    'precision mediump float;',
    'uniform sampler2D u_tex; uniform vec2 u_dir;',
    'varying vec2 v_uv;',
    'void main(){',
    '  vec4 s  = texture2D(u_tex, v_uv) * 0.227027;',
    '  s += texture2D(u_tex, v_uv + u_dir * 1.0) * 0.194594;',
    '  s += texture2D(u_tex, v_uv - u_dir * 1.0) * 0.194594;',
    '  s += texture2D(u_tex, v_uv + u_dir * 2.0) * 0.121622;',
    '  s += texture2D(u_tex, v_uv - u_dir * 2.0) * 0.121622;',
    '  s += texture2D(u_tex, v_uv + u_dir * 3.0) * 0.054054;',
    '  s += texture2D(u_tex, v_uv - u_dir * 3.0) * 0.054054;',
    '  s += texture2D(u_tex, v_uv + u_dir * 4.0) * 0.016216;',
    '  s += texture2D(u_tex, v_uv - u_dir * 4.0) * 0.016216;',
    '  gl_FragColor = s;',
    '}'
  ].join('\n');

  /* 玻璃片段着色器：完整光学模型 */
  var FS_GLASS = [
    'precision highp float;',
    'uniform sampler2D u_bgTex;',
    'uniform sampler2D u_blurTex;',
    'uniform vec2 u_size;',
    'uniform vec2 u_res;',
    'uniform float u_radius, u_zR, u_refract, u_chroma, u_edgeHL, u_spec;',
    'uniform float u_fresnel, u_distort, u_alpha, u_sat, u_tint, u_brightness;',
    'uniform float u_shadowAlpha, u_shadowSpread, u_shadowOffY, u_bevelMode;',
    'varying vec2 v_local;',
    'varying vec2 v_uv;',
    '',
    'float rr(vec2 p, vec2 b, float r){',
    '  vec2 q = abs(p) - b + vec2(r);',
    '  return min(max(q.x, q.y), 0.0) + length(max(q, vec2(0.0))) - r;',
    '}',
    'float bevelH(float d, float zR){',
    '  d = clamp(d, 0.0, zR);',
    '  return sqrt(d * (2.0 * zR - d));',
    '}',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    '',
    'void main(){',
    '  vec2 half_ = u_size * 0.5;',
    '  float r = min(u_radius, min(half_.x, half_.y));',
    '  float sdf = rr(v_local, half_, r);',
    '',
    '  /* 面板外：柔和投影（外晕 + 接触阴影） */',
    '  if (sdf > 0.0){',
    '    float sd = rr(v_local - vec2(0.0, u_shadowOffY), half_, r);',
    '    float d = max(sd - 1.0, 0.0);',
    '    float spread = max(u_shadowSpread, 1.0);',
    '    float outer = exp(-d * d / (spread * spread)) * 0.65;',
    '    float contact = exp(-d * 0.08 / max(spread * 0.04, 0.01)) * 0.35;',
    '    gl_FragColor = vec4(0.0, 0.0, 0.0, (outer + contact) * u_shadowAlpha);',
    '    return;',
    '  }',
    '',
    '  float inside = -sdf;',
    '  float mask = 1.0 - smoothstep(-1.5, 0.5, sdf);',
    '  float maxD = min(half_.x, half_.y);',
    '  float edge = smoothstep(maxD * 0.35, 0.0, inside);',
    '',
    '  /* bevel 高度场 → 表面法线 */',
    '  float e = 2.0;',
    '  float hC = bevelH(inside, u_zR);',
    '  float hR = bevelH(-rr(v_local + vec2(e, 0.0), half_, r), u_zR);',
    '  float hL = bevelH(-rr(v_local - vec2(e, 0.0), half_, r), u_zR);',
    '  float hU = bevelH(-rr(v_local + vec2(0.0, e), half_, r), u_zR);',
    '  float hD = bevelH(-rr(v_local - vec2(0.0, e), half_, r), u_zR);',
    '  vec2 hGrad = (vec2(hR - hL, hU - hD)) / (2.0 * e);',
    '  vec3 N = normalize(vec3(-hGrad, 1.0));',
    '  float depth = smoothstep(0.0, u_zR, inside);',
    '',
    '  /* 折射：双面 Snell 近似（含厚度调制）或 dome 放大 */',
    '  vec2 pxToUV = vec2(1.0, -1.0) / u_res;',
    '  float ior = 1.5;',
    '  float refrPow = 1.0 - 1.0 / ior;',
    '  float thickness = hC * 2.0;',
    '  float thickNorm = thickness / max(u_zR * 2.0, 1.0);',
    '  vec2 refrPx;',
    '  if (u_bevelMode < 0.5){',
    '    vec2 exitRefr = hGrad * refrPow;',
    '    vec2 entryRefr = hGrad * refrPow;',
    '    vec2 throughRefr = entryRefr * thickNorm * 0.5;',
    '    refrPx = (exitRefr + entryRefr + throughRefr) * u_refract * 30.0;',
    '    vec2 centerDir = -v_local / max(half_, vec2(1.0));',
    '    refrPx += centerDir * u_refract * 4.0 * depth;',
    '  } else {',
    '    refrPx = -v_local * u_refract * depth * 0.35;',
    '  }',
    '  vec2 refr = refrPx * pxToUV;',
    '',
    '  /* 微噪声畸变 */',
    '  vec2 ns = v_local * 0.08;',
    '  vec2 absPxToUV = vec2(1.0) / u_res;',
    '  vec2 micro = (vec2(hash(ns), hash(ns + vec2(37.0))) - 0.5) * u_distort * 4.0 * absPxToUV;',
    '',
    '  /* 色散：R/B 沿法线错开采样 */',
    '  float caS = u_chroma * 18.0 * (edge * 0.7 + 0.3) * 2.0;',
    '  vec2 caD = N.xy * caS * pxToUV;',
    '  vec2 base = v_uv + refr + micro;',
    '  vec3 sharp = vec3(texture2D(u_bgTex, base + caD).r,',
    '                    texture2D(u_bgTex, base).g,',
    '                    texture2D(u_bgTex, base - caD).b);',
    '  vec3 blurv = vec3(texture2D(u_blurTex, base + caD).r,',
    '                    texture2D(u_blurTex, base).g,',
    '                    texture2D(u_blurTex, base - caD).b);',
    '',
    '  /* 中心用模糊（毛玻璃），边缘回锐（折射边界清晰） */',
    '  float edgeMix = 1.0 - edge * 0.15;',
    '  vec3 col = mix(sharp, blurv, edgeMix);',
    '',
    '  col *= 1.0 + u_brightness;',
    '  float lum = dot(col, vec3(0.299, 0.587, 0.114));',
    '  col = mix(vec3(lum), col, 1.0 + u_sat);',
    '  col = mix(col, col * vec3(0.92, 0.95, 1.05), u_tint);',
    '  col *= 1.0 + 0.06 * depth;',
    '',
    '  /* Fresnel */',
    '  float fres = pow(1.0 - abs(N.z), 4.0) * u_fresnel;',
    '',
    '  /* 四光源 Blinn-Phong：主光 + 辅光 + 广域环境 + 顶部窄高光 */',
    '  vec3 V = vec3(0.0, 0.0, 1.0);',
    '  vec3 L1 = normalize(vec3(0.4, 0.7, 1.0));',
    '  float sp1 = pow(max(dot(N, normalize(L1 + V)), 0.0), 90.0);',
    '  vec3 L2 = normalize(vec3(-0.3, -0.5, 1.0));',
    '  float sp2 = pow(max(dot(N, normalize(L2 + V)), 0.0), 50.0) * 0.3;',
    '  vec3 L3 = normalize(vec3(0.1, 0.3, 1.0));',
    '  float spB = pow(max(dot(N, L3), 0.0), 6.0) * 0.1;',
    '  vec3 L4 = normalize(vec3(0.0, 0.9, 0.4));',
    '  float sp4 = pow(max(dot(N, normalize(L4 + V)), 0.0), 120.0) * 0.6;',
    '  float totalSpec = (sp1 + sp2 + spB + sp4) * u_spec;',
    '',
    '  /* 内描边（顶边加重）+ 边缘辉光 + 内辉光 */',
    '  float borderWidth = 1.5;',
    '  float innerStroke = smoothstep(-borderWidth - 1.0, -borderWidth, sdf)',
    '                    * (1.0 - smoothstep(-1.0, 0.0, sdf));',
    '  float topBias = 0.5 + 0.5 * (-v_local.y / half_.y);',
    '  innerStroke *= 0.4 + 0.6 * topBias;',
    '  float rim = edge * u_edgeHL * 0.22;',
    '  float innerGlow = smoothstep(5.0, 0.0, -sdf) * u_edgeHL * 0.15;',
    '',
    '  /* 环境反射 + 复合 */',
    '  float envRefl = (N.y * 0.5 + 0.5) * fres * 0.08;',
    '  vec3 fin = col;',
    '  fin += vec3(totalSpec);',
    '  fin += vec3(rim + innerGlow);',
    '  fin += vec3(innerStroke * u_edgeHL * 0.55);',
    '  fin += vec3(envRefl);',
    '  fin = mix(fin, vec3(1.0), fres * 0.2);',
    '',
    '  gl_FragColor = vec4(fin, mask * u_alpha);',
    '}'
  ].join('\n');

  /* ---------- 场景栅格化（mini html-to-image） ---------- */
  var INLINE_PROPS = [
    'display','position','top','left','right','bottom','width','height','minWidth','maxWidth',
    'marginTop','marginRight','marginBottom','marginLeft','paddingTop','paddingRight',
    'paddingBottom','paddingLeft','borderWidth','borderStyle','borderColor','borderRadius',
    'background','backgroundColor','backgroundImage','backgroundSize','backgroundPosition',
    'color','fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing',
    'textAlign','textTransform','opacity','transform','transformOrigin','boxShadow',
    'overflow','flexDirection','justifyContent','alignItems','alignSelf','gap',
    'objectFit','objectPosition','whiteSpace'
  ];

  /* ---------- webfont 嵌入：快照里的文字与页面同字体 ---------- */
  var FONT_CSS_CACHE = null;
  var FONT_URL_CACHE = {};
  var FONT_FACE_RULE = (typeof CSSRule !== 'undefined' && CSSRule.FONT_FACE_RULE) || 5;

  function fetchWithTimeout(url, ms) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; reject(new Error('timeout')); } }, ms);
      fetch(url).then(function (r) {
        if (done) return;
        if (!r.ok) { done = true; clearTimeout(t); reject(new Error('http ' + r.status)); return; }
        return r.blob();
      }).then(function (b) {
        if (done || !b) return;
        done = true; clearTimeout(t); resolve(b);
      }).catch(function (e) { if (!done) { done = true; clearTimeout(t); reject(e); } });
    });
  }

  function fetchAsDataURL(url) {
    return fetchWithTimeout(url, 4000).then(function (b) {
      return new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onload = function () { resolve(fr.result); };
        fr.onerror = reject;
        fr.readAsDataURL(b);
      });
    });
  }

  function buildFontEmbedCSS() {
    var rules = [];
    var tasks = [];
    Array.prototype.slice.call(document.styleSheets).forEach(function (sheet) {
      try {
        var rs = sheet.cssRules;
        for (var i = 0; i < rs.length; i++) {
          if (rs[i].type === FONT_FACE_RULE) rules.push(rs[i].cssText);
        }
      } catch (e) {
        if (sheet.href) {
          tasks.push(fetchWithTimeout(sheet.href, 3000)
            .then(function (b) { return b.text(); })
            .then(function (text) {
              var re = /@font-face\s*\{[^}]+\}/g, m;
              while ((m = re.exec(text))) rules.push(m[0]);
            })
            .catch(function () {}));
        }
      }
    });
    return Promise.all(tasks).then(function () {
      var fontTasks = [];
      rules.forEach(function (css) {
        var re2 = /url\((['"]?)([^'")]+)\1\)/g, m2;
        while ((m2 = re2.exec(css))) {
          var u = m2[2];
          if (!FONT_URL_CACHE[u]) {
            fontTasks.push(fetchAsDataURL(u).then(function (d) { FONT_URL_CACHE[u] = d; })
              .catch(function () { FONT_URL_CACHE[u] = u; }));
          }
        }
      });
      return Promise.all(fontTasks).then(function () {
        var out = '';
        rules.forEach(function (css) {
          out += css.replace(/url\((['"]?)([^'")]+)\1\)/g,
            function (_, q, u) { return 'url("' + (FONT_URL_CACHE[u] || u) + '")'; }) + '\n';
        });
        FONT_CSS_CACHE = out;
        return out;
      });
    });
  }

  function refreshFontCache() {
    FONT_CSS_CACHE = null;
    FONT_URL_CACHE = {};
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { FONT_CSS_CACHE = null; });
    }
  }

  /* ---------- 场景栅格化（mini html-to-image，DPR 高清 + webfont 嵌入） ---------- */
  var INLINE_PROPS = [
    'display','position','top','left','right','bottom','width','height','minWidth','maxWidth',
    'marginTop','marginRight','marginBottom','marginLeft','paddingTop','paddingRight',
    'paddingBottom','paddingLeft','borderWidth','borderStyle','borderColor','borderRadius',
    'background','backgroundColor','backgroundImage','backgroundSize','backgroundPosition',
    'color','fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing',
    'textAlign','textTransform','opacity','transform','transformOrigin','boxShadow',
    'overflow','flexDirection','justifyContent','alignItems','alignSelf','gap',
    'objectFit','objectPosition','whiteSpace'
  ];

  var IMG_URL_CACHE = {};

  function imgToDataURL(img, maxDim) {
    maxDim = maxDim || 2048;
    return new Promise(function (resolve) {
      var done = false;
      function finish(url) { if (!done) { done = true; resolve(url || null); } }
      function go() {
        try {
          var nw = img.naturalWidth, nh = img.naturalHeight;
          if (!nw || !nh) return finish(null);
          var sc = Math.min(1, maxDim / Math.max(nw, nh));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(nw * sc));
          c.height = Math.max(1, Math.round(nh * sc));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          finish(c.toDataURL('image/jpeg', 0.85));
        } catch (e) { finish(null); }   /* 跨域/污染 → 保留原 src */
      }
      if (img.complete && img.naturalWidth > 0) go();
      else {
        img.addEventListener('load', go, { once: true });
        img.addEventListener('error', function () { finish(null); }, { once: true });
        setTimeout(function () { finish(null); }, 2500);
      }
    });
  }

  function inlineImages(root, clone) {
    var srcs = Array.prototype.slice.call(root.querySelectorAll('img'));
    var dsts = Array.prototype.slice.call(clone.querySelectorAll('img'));
    var tasks = [];
    for (var i = 0; i < srcs.length && dsts[i]; i++) {
      (function (sImg, dImg) {
        var src = (sImg.currentSrc || sImg.src || '').split('#')[0];
        if (!src || src.indexOf('data:') === 0) return;
        if (IMG_URL_CACHE[src]) { dImg.setAttribute('src', IMG_URL_CACHE[src]); return; }
        tasks.push(imgToDataURL(sImg).then(function (url) {
          IMG_URL_CACHE[src] = url || '';
          if (url) dImg.setAttribute('src', url);
        }));
      })(srcs[i], dsts[i]);
    }
    return Promise.all(tasks);
  }

  function captureScene(root) {
    return new Promise(function (resolve) {
      var dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      var w = root.clientWidth, h = root.clientHeight;
      if (!w || !h) return resolve(null);
      var clone = root.cloneNode(true);
      clone.querySelectorAll('[data-liquid-glass]').forEach(function (n) { n.remove(); });
      clone.querySelectorAll('[data-lg-canvas]').forEach(function (n) { n.remove(); });

      var srcs = [root].concat(Array.prototype.slice.call(root.querySelectorAll('*')));
      var dsts = [clone].concat(Array.prototype.slice.call(clone.querySelectorAll('*')));
      for (var i = 0; i < srcs.length && dsts[i]; i++) {
        var cs = getComputedStyle(srcs[i]);
        var s = '';
        for (var j = 0; j < INLINE_PROPS.length; j++) {
          s += INLINE_PROPS[j] + ':' + cs.getPropertyValue(INLINE_PROPS[j]) + ';';
        }
        dsts[i].setAttribute('style', s);
      }

      var fontCss = FONT_CSS_CACHE || '';
      var buildSVG = function () {
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', w); svg.setAttribute('height', h);
        svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
        var fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
        fo.setAttribute('width', '100%'); fo.setAttribute('height', '100%');
        var div = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
        div.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
        div.style.width = w + 'px'; div.style.height = h + 'px';
        if (fontCss) {
          var styleEl = document.createElement('style');
          styleEl.textContent = fontCss;
          div.appendChild(styleEl);
        }
        div.appendChild(clone);
        fo.appendChild(div);
        svg.appendChild(fo);

        var url = 'data:image/svg+xml;charset=utf-8,' +
                  encodeURIComponent(new XMLSerializer().serializeToString(svg));
        var img = new Image();
        img.onload = function () {
          var LG = function (o) { window.LG_LOGS = window.LG_LOGS || []; window.LG_LOGS.push(o); };
          var svgImg = img;
          function makeCanvas() {
            var canvas = document.createElement('canvas');
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            var ctx = canvas.getContext('2d');
            ctx.drawImage(svgImg, 0, 0, canvas.width, canvas.height);
            return { canvas: canvas, ctx: ctx };
          }
          try {
            var first = makeCanvas();
            first.ctx.getImageData(0, 0, 1, 1);     // SVG 版本必须干净
            LG({ step: 'svg-ok' });

            /* 兜底：把场景内 <img> 按 CSS 布局直接补画
               （foreignObject 快照对 <img> 渲染在部分浏览器不稳） */
            var added = false;
            Array.prototype.slice.call(root.querySelectorAll('img')).forEach(function (el) {
              if (el.closest && el.closest('[data-liquid-glass]')) return;
              var r = el.getBoundingClientRect();
              var rr = root.getBoundingClientRect();
              var ex = r.left - rr.left, ey = r.top - rr.top, ew = r.width, eh = r.height;
              var nw = el.naturalWidth, nh = el.naturalHeight;
              if (ew < 1 || eh < 1 || !nw || !nh) return;
              try {
                var fit = getComputedStyle(el).objectFit || 'fill';
                if (fit === 'cover') {
                  var s2 = Math.max(ew / nw, eh / nh);
                  var sw = ew / s2, sh = eh / s2;
                  first.ctx.drawImage(el, (nw - sw) / 2, (nh - sh) / 2, sw, sh,
                                      ex * dpr, ey * dpr, ew * dpr, eh * dpr);
                } else if (fit === 'contain') {
                  var s3 = Math.min(ew / nw, eh / nh);
                  var dw = nw * s3, dh = nh * s3;
                  first.ctx.drawImage(el, ex * dpr + (ew - dw) * dpr / 2,
                                      ey * dpr + (eh - dh) * dpr / 2, dw * dpr, dh * dpr);
                } else {
                  first.ctx.drawImage(el, ex * dpr, ey * dpr, ew * dpr, eh * dpr);
                }
                added = true;
                LG({ step: 'img-drawn', fit: fit, nw: nw, nh: nh });
              } catch (e2) { LG({ step: 'img-draw-fail', err: String(e2) }); }
            });

            try {
              first.ctx.getImageData(0, 0, 1, 1);   // 补画后复测污染
              LG({ step: 'final-ok', imgCount: root.querySelectorAll('img').length });
              resolve(first.canvas);
            } catch (e3) {
              LG({ step: 'tainted-after-draw' });
              if (!added) { resolve(null); return; }
              var second = makeCanvas();            // 回退：只保留 SVG 版本
              try {
                second.ctx.getImageData(0, 0, 1, 1);
                resolve(second.canvas);
              } catch (e4) { resolve(null); }
            }
          } catch (err) {
            LG({ step: 'svg-fail', err: String(err) });
            resolve(null);
          }
        };
        img.onerror = function () { resolve(null); };
        img.src = url;
      };
      inlineImages(root, clone).then(function () {
        try { buildSVG(); } catch (err) { resolve(null); }
      }).catch(function () {
        try { buildSVG(); } catch (err) { resolve(null); }
      });
    });
  }

  /* ---------- WebGL 工具 ---------- */
  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      var info = gl.getShaderInfoLog(sh);
      window.LG_LOGS = window.LG_LOGS || [];
      window.LG_LOGS.push({ type: type === gl.VERTEX_SHADER ? 'VS' : 'FS', info: info, src: src });
      console.warn('[liquid-glass] shader error:', info, src);
      return null;
    }
    return sh;
  }
  function program(gl, vsSrc, fsSrc) {
    var vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
    var fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    var p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      var linfo = gl.getProgramInfoLog(p);
      window.LG_LOGS = window.LG_LOGS || [];
      window.LG_LOGS.push({ type: 'LINK', info: linfo, src: '' });
      console.warn('[liquid-glass] link error:', linfo);
      return null;
    }
    return p;
  }
  function makeQuad(gl, data) {
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    return buf;
  }
  function makeTex(gl, w, h) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return t;
  }
  function makeFBO(gl, w, h) {
    var f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D,
                            makeTex(gl, w, h), 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return f;
  }
  function drawQuad(gl, prog, buf) {
    var loc = gl.getAttribLocation(prog, 'a_pos');
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /* ---------- 实例 ---------- */
  function LiquidGlass(root, glasses, defaults) {
    this.root = root;
    this.glasses = glasses;
    this.defaults = defaults || {};
    this.fps = 0;
    this.destroyed = false;
    this.captureCanvas = null;
    this.dirty = true;
    this.alwaysDirty = !!root.querySelector('[data-dynamic], video');
    this.raf = 0;
    this.fpsFrames = 0; this.fpsT0 = 0;
    this.canvases = [];

    var self = this;
    this.glasses.forEach(function (el) {
      el._lg = { cfg: configOf(el, self.defaults), hover: false, press: false };
      prepHost(el);
    });
  }

  function prepHost(el) {
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.classList.add('apx-lg-host');
  }

  LiquidGlass.prototype.start = async function () {
    var self = this;
    this.fallback = false;
    this.debug = { capture: false, gl: false, programs: false };

    /* 捕获必须快：3 秒超时兜底（字体嵌入走后台升级，绝不阻塞） */
    var capPromise = captureScene(this.root);
    var timeout = new Promise(function (resolve) {
      setTimeout(function () { resolve(null); }, 3000);
    });
    this.captureCanvas = await Promise.race([capPromise, timeout]);
    if (!this.captureCanvas) { this.useCssFallback(); return this; }
    this.debug.capture = true;
    this.debug.captureCanvas = this.captureCanvas;

    /* 字体 CSS 就绪后，后台重建快照（文字与页面同字体） */
    buildFontEmbedCSS().then(function () {
      if (!self.destroyed) self.recaptureSafe();
    }).catch(function () {});

    this.glCanvas = document.createElement('canvas');
    this.gl = this.glCanvas.getContext('webgl', {
      alpha: true, premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: true
    }) || this.glCanvas.getContext('experimental-webgl');
    if (!this.gl) { this.useCssFallback(); return this; }
    this.debug.gl = true;
    var gl = this.gl;

    this.blitP = program(gl, VS_QUAD, FS_BLIT);
    this.blurP = program(gl, VS_QUAD, FS_BLUR);
    this.glassP = program(gl, VS_GLASS, FS_GLASS);
    if (!this.blitP || !this.blurP || !this.glassP) { this.useCssFallback(); return this; }
    this.debug.programs = true;

    this.quadBuf = makeQuad(gl, [-1, -1, 1, -1, -1, 1, 1, 1]);
    this.panelBuf = makeQuad(gl, [-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]);

    this.blitU = { tex: gl.getUniformLocation(this.blitP, 'u_tex'),
                   scale: gl.getUniformLocation(this.blitP, 'u_scale'),
                   offset: gl.getUniformLocation(this.blitP, 'u_offset') };
    this.blurU = { tex: gl.getUniformLocation(this.blurP, 'u_tex'),
                   dir: gl.getUniformLocation(this.blurP, 'u_dir') };
    this.glassU = { bg: gl.getUniformLocation(this.glassP, 'u_bgTex'),
                    blur: gl.getUniformLocation(this.glassP, 'u_blurTex'),
                    center: gl.getUniformLocation(this.glassP, 'u_center'),
                    size: gl.getUniformLocation(this.glassP, 'u_size'),
                    res: gl.getUniformLocation(this.glassP, 'u_res'),
                    pad: gl.getUniformLocation(this.glassP, 'u_pad'),
                    radius: gl.getUniformLocation(this.glassP, 'u_radius'),
                    zR: gl.getUniformLocation(this.glassP, 'u_zR'),
                    refract: gl.getUniformLocation(this.glassP, 'u_refract'),
                    chroma: gl.getUniformLocation(this.glassP, 'u_chroma'),
                    edge: gl.getUniformLocation(this.glassP, 'u_edgeHL'),
                    spec: gl.getUniformLocation(this.glassP, 'u_spec'),
                    fresnel: gl.getUniformLocation(this.glassP, 'u_fresnel'),
                    distort: gl.getUniformLocation(this.glassP, 'u_distort'),
                    alpha: gl.getUniformLocation(this.glassP, 'u_alpha'),
                    sat: gl.getUniformLocation(this.glassP, 'u_sat'),
                    tint: gl.getUniformLocation(this.glassP, 'u_tint'),
                    bright: gl.getUniformLocation(this.glassP, 'u_brightness'),
                    shadowA: gl.getUniformLocation(this.glassP, 'u_shadowAlpha'),
                    shadowS: gl.getUniformLocation(this.glassP, 'u_shadowSpread'),
                    shadowY: gl.getUniformLocation(this.glassP, 'u_shadowOffY'),
                    bevel: gl.getUniformLocation(this.glassP, 'u_bevelMode') };

    this.cropCanvas = document.createElement('canvas');
    this.cropCtx = this.cropCanvas.getContext('2d');

    this.glasses.forEach(function (el) {
      var c = document.createElement('canvas');
      c.setAttribute('data-lg-canvas', '1');
      c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;' +
                        'pointer-events:none;z-index:-1;display:block;';
      el.insertBefore(c, el.firstChild);
      el._lg.canvas = c;
      this.canvases.push(c);
    }, this);

    refreshFontCache();
    this.bindEvents();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    return this;
  };

  LiquidGlass.prototype.useCssFallback = function () {
    this.fallback = true;
    this.glasses.forEach(function (el) {
      el.style.backdropFilter = 'blur(40px) saturate(180%)';
      el.style.webkitBackdropFilter = 'blur(40px) saturate(180%)';
    });
    console.info('[liquid-glass] 场景栅格化/WebGL 不可用，回退为 CSS 毛玻璃。');
  };

  LiquidGlass.prototype.bindEvents = function () {
    var self = this;
    var mark = function () { self.dirty = true; };
    window.addEventListener('resize', mark, { passive: true });
    window.addEventListener('scroll', mark, { passive: true });

    this.glasses.forEach(function (el) {
      var isBtn = el.dataset.lgPreset === 'button' ||
                  (el.dataset.lgConfig && /button/i.test(el.dataset.lgConfig));
      el.addEventListener('pointerenter', function () {
        if (!isBtn) return; el._lg.hover = true; self.dirty = true;
      });
      el.addEventListener('pointerleave', function () {
        if (!isBtn) return; el._lg.hover = false; self.dirty = true;
      });
      el.addEventListener('pointerdown', function () {
        if (!isBtn) return; el._lg.press = true; self.dirty = true;
      });
      el.addEventListener('pointerup', function () {
        if (!isBtn) return; el._lg.press = false; self.dirty = true;
      });
    });

    var debounce = 0;
    this.mo = new MutationObserver(function (mutations) {
      var configOnly = mutations.every(function (m) {
        return m.type === 'attributes' &&
               (m.attributeName === 'data-lg-preset' || m.attributeName === 'data-lg-config') &&
               m.target._lg;
      });
      if (configOnly) {
        /* 只改配置：重读参数 + 立即重渲染，不需要重新栅格化背景 */
        self.glasses.forEach(function (el) {
          el._lg.cfg = configOf(el, self.defaults);
        });
        self.dirty = true;
        if (self.gl && self.captureCanvas) {
          self.glasses.forEach(function (el) {
            try { self.renderPanel(el); } catch (e) {}
          });
        }
        return;
      }
      /* 背景/结构变化：防抖后重新栅格化 */
      var hasRealChange = mutations.some(function (m) {
        return !(m.type === 'attributes' && m.target._lg);
      });
      if (!hasRealChange) { self.dirty = true; return; }
      clearTimeout(debounce);
      debounce = setTimeout(function () {
        captureScene(self.root).then(function (c) {
          if (c && !self.destroyed) { self.captureCanvas = c; self.dirty = true; }
        });
      }, 120);
    });
    this.mo.observe(this.root, { subtree: true, childList: true, attributes: true,
                                 characterData: true,
                                 attributeFilter: ['style', 'class', 'src',
                                                   'data-lg-preset', 'data-lg-config'] });
  };

  /* 单个面板：裁剪背景 → 模糊 → 玻璃着色器 → 注入 canvas */
  LiquidGlass.prototype.renderPanel = function (el) {
    var gl = this.gl;
    var cfg = el._lg.cfg;
    var rootRect = this.root.getBoundingClientRect();
    var rect = el.getBoundingClientRect();

    var dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    var pad = SHADOW_PAD;
    /* offsetWidth：CSS 盒子尺寸（忽略 hover scale 等 transform 干扰） */
    var elW = el.offsetWidth || rect.width;
    var elH = el.offsetHeight || rect.height;
    var cssW = elW + pad * 2;
    var cssH = elH + pad * 2;
    if (cssW < 2 || cssH < 2) return;

    var W = Math.min(MAX_PANEL, Math.round(cssW * dpr));
    var H = Math.min(MAX_PANEL, Math.round(cssH * dpr));
    /* 捕获图为 DPR 高清：裁剪坐标同步乘 dpr */
    var srcX = ((rect.left + rect.width / 2 - elW / 2 - rootRect.left) - pad) * dpr;
    var srcY = ((rect.top + rect.height / 2 - elH / 2 - rootRect.top) - pad) * dpr;

    /* 1) 局部裁剪 + 上传 */
    this.cropCanvas.width = W; this.cropCanvas.height = H;
    this.cropCtx.clearRect(0, 0, W, H);
    this.cropCtx.drawImage(this.captureCanvas, srcX, srcY, cssW * dpr, cssH * dpr, 0, 0, W, H);

    if (!el._lg.fbos || el._lg.fboW !== W || el._lg.fboH !== H) {
      if (el._lg.fbos) {
        [el._lg.fbos.bg, el._lg.fbos.blurA, el._lg.fbos.blurB].forEach(function (f) {
          gl.deleteFramebuffer(f.fbo); gl.deleteTexture(f.tex);
        });
      }
      el._lg.fbos = { bg: makeFBOObj(gl, W, H), blurA: makeFBOObj(gl, W, H),
                      blurB: makeFBOObj(gl, W, H) };
      el._lg.fboW = W; el._lg.fboH = H;
    }
    var fbos = el._lg.fbos;

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.bindTexture(gl.TEXTURE_2D, fbos.bg.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.cropCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    /* 2) blit bg → blurA（blur=0 时就是锐利背景） */
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos.blurA.fbo);
    gl.viewport(0, 0, W, H);
    gl.useProgram(this.blitP);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fbos.bg.tex);
    gl.uniform1i(this.blitU.tex, 0);
    gl.uniform2f(this.blitU.scale, 1, 1);
    gl.uniform2f(this.blitU.offset, 0, 0);
    drawQuad(gl, this.blitP, this.quadBuf);

    /* 3) 多轮高斯模糊（spread = blur * 2.5，6 轮 H/V ping-pong） */
    if (cfg.blur > 0) {
      var spread = cfg.blur * 2.5;
      gl.useProgram(this.blurP);
      gl.uniform1i(this.blurU.tex, 0);
      for (var i = 0; i < BLUR_ITERATIONS; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbos.blurB.fbo);
        gl.viewport(0, 0, W, H);
        gl.bindTexture(gl.TEXTURE_2D, fbos.blurA.tex);
        gl.uniform2f(this.blurU.dir, spread / W, 0);
        drawQuad(gl, this.blurP, this.quadBuf);

        gl.bindFramebuffer(gl.FRAMEBUFFER, fbos.blurA.fbo);
        gl.bindTexture(gl.TEXTURE_2D, fbos.blurB.tex);
        gl.uniform2f(this.blurU.dir, 0, spread / H);
        drawQuad(gl, this.blurP, this.quadBuf);
      }
    }

    /* 4) 玻璃着色器 → 输出 FBO（本地坐标系，CSS px 逻辑） */
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos.blurB.fbo);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.glassP);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fbos.bg.tex);
    gl.uniform1i(this.glassU.bg, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, fbos.blurA.tex);
    gl.uniform1i(this.glassU.blur, 1);

    gl.uniform2f(this.glassU.center, cssW * 0.5, cssH * 0.5);
    gl.uniform2f(this.glassU.size, elW, elH);
    gl.uniform2f(this.glassU.res, cssW, cssH);
    gl.uniform1f(this.glassU.pad, pad);

    var zR = el._lg.press ? cfg.zRadius * 0.8 : cfg.zRadius;
    var shadowS = el._lg.press ? cfg.shadowSpread * 1.2 : cfg.shadowSpread;
    gl.uniform1f(this.glassU.radius, cfg.cornerRadius);
    gl.uniform1f(this.glassU.zR, zR);
    gl.uniform1f(this.glassU.refract, cfg.refraction);
    gl.uniform1f(this.glassU.chroma, cfg.chroma);
    gl.uniform1f(this.glassU.edge, cfg.edge);
    gl.uniform1f(this.glassU.spec, cfg.spec);
    gl.uniform1f(this.glassU.fresnel, cfg.fresnel);
    gl.uniform1f(this.glassU.distort, cfg.distortion || 0);
    gl.uniform1f(this.glassU.alpha, cfg.opacity);
    gl.uniform1f(this.glassU.sat, cfg.saturation || 0);
    gl.uniform1f(this.glassU.tint, cfg.tint);
    gl.uniform1f(this.glassU.bright, cfg.brightness + (el._lg.hover ? 0.2 : 0));
    gl.uniform1f(this.glassU.shadowA, cfg.shadowOpacity + (el._lg.press ? 0.1 : 0));
    gl.uniform1f(this.glassU.shadowS, shadowS);
    gl.uniform1f(this.glassU.shadowY, cfg.shadowOffsetY);
    gl.uniform1f(this.glassU.bevel, cfg.bevelMode || 0);
    drawQuad(gl, this.glassP, this.panelBuf);

    /* 5) readPixels → 面板 canvas */
    var pixels = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    var c = el._lg.canvas;
    if (c.width !== W) c.width = W;
    if (c.height !== H) c.height = H;
    c.style.width = cssW + 'px';
    c.style.height = cssH + 'px';
    c.style.left = (-pad) + 'px';
    c.style.top = (-pad) + 'px';

    var ctx = c.getContext('2d');
    var img = ctx.createImageData(W, H);
    for (var y = 0; y < H; y++) {
      var src = (H - 1 - y) * W * 4;
      var dst = y * W * 4;
      for (var x = 0; x < W * 4; x++) img.data[dst + x] = pixels[src + x];
    }
    ctx.putImageData(img, 0, 0);
  };

  function makeFBOObj(gl, w, h) {
    var t = makeTex(gl, w, h);
    var f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo: f, tex: t };
  }

  LiquidGlass.prototype.loop = function (now) {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);

    this.fpsFrames++;
    if (!this.fpsT0) this.fpsT0 = now;
    if (now - this.fpsT0 >= 1000) {
      this.fps = this.fpsFrames;
      this.fpsFrames = 0; this.fpsT0 = now;
    }

    if (!this.gl || !this.captureCanvas) {
      if (!this._warned) {
        this._warned = true;
        console.warn('[liquid-glass] 渲染跳过：gl=' + !!this.gl +
                     ' capture=' + !!this.captureCanvas +
                     '（若为 false 请检查 WebGL 与背景内容）');
      }
      return;
    }
    if (!this.dirty && !this.alwaysDirty) {
      var busy = this.glasses.some(function (el) { return el._lg.hover || el._lg.press; });
      if (!busy) return;
    }
    this.dirty = false;

    for (var i = 0; i < this.glasses.length; i++) this.renderPanel(this.glasses[i]);
  };

  LiquidGlass.prototype.updateConfig = function (el, partial) {
    if (!el || !el._lg) return;
    Object.assign(el._lg.cfg, partial || {});
    this.dirty = true;
    /* 立即同步渲染：不依赖下一帧 rAF（后台标签/省电模式/headless 下也生效） */
    if (this.gl && this.captureCanvas) {
      try { this.renderPanel(el); } catch (e) { /* 保留 rAF 兜底 */ }
    }
  };

  LiquidGlass.prototype.markChanged = function (el) {
    if (el) this.recaptureSafe();
    this.dirty = true;
    /* 同步渲染：拖动/旋钮等高频交互立即生效，不依赖下一帧 rAF */
    if (this.gl && this.captureCanvas) {
      for (var i = 0; i < this.glasses.length; i++) {
        try { this.renderPanel(this.glasses[i]); } catch (e) {}
      }
    }
  };
  LiquidGlass.prototype.recaptureSafe = function () {
    var self = this;
    captureScene(this.root).then(function (c) {
      if (c && !self.destroyed) self.captureCanvas = c;
    });
  };

  LiquidGlass.prototype.destroy = function () {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    if (this.mo) this.mo.disconnect();
    this.canvases.forEach(function (c) { c.remove(); });
    this.glasses.forEach(function (el) { el._lg.canvas = null; });
    if (this.gl) {
      this.glasses.forEach(function (el) {
        if (el._lg.fbos) {
          [el._lg.fbos.bg, el._lg.fbos.blurA, el._lg.fbos.blurB].forEach(function (f) {
            this.gl.deleteFramebuffer(f.fbo); this.gl.deleteTexture(f.tex);
          }, this);
        }
      }, this);
    }
  };

  /* ---------- 公共 API ---------- */
  var registry = [];

  function findRoot(el) {
    var n = el.parentElement;
    while (n) {
      if (n.hasAttribute && n.hasAttribute('data-lg-scene')) return n;
      n = n.parentElement;
    }
    return null;
  }

  async function init(opts) {
    var root = opts.root;
    var glasses = Array.prototype.slice.call(opts.glassElements || []);
    if (!glasses.length) glasses = Array.prototype.slice.call(root.querySelectorAll('[data-liquid-glass]'));
    if (!glasses.length) return null;

    var probe = document.createElement('canvas');
    var gl = probe.getContext('webgl') || probe.getContext('experimental-webgl');
    if (!gl) {
      if (!document.querySelector('script[src*="liquid-glass-svg.js"]') && !window.ApxLiquidGlassSvg) {
        var s = document.createElement('script');
        s.src = scriptBase() + 'liquid-glass-svg.js';
        document.head.appendChild(s);
        console.info('[liquid-glass] WebGL 不可用，加载 SVG 回退引擎。');
      }
      return null;
    }

    var inst = new LiquidGlass(root, glasses, opts.defaults);
    registry.push(inst);
    return inst.start();
  }

  function scriptBase() {
    var s = document.currentScript && document.currentScript.src;
    if (s) return s.substring(0, s.lastIndexOf('/') + 1);
    return '';
  }

  async function applyAll() {
    var jobs = [];
    document.querySelectorAll('[data-lg-scene]').forEach(function (root) {
      if (root.querySelector('[data-liquid-glass]')) jobs.push(init({ root: root }));
    });
    document.querySelectorAll('[data-liquid-glass]').forEach(function (el) {
      if (!findRoot(el)) {
        jobs.push(init({ root: el.parentElement, glassElements: [el] }));
      }
    });
    return Promise.all(jobs);
  }

  function destroyAll() {
    registry.forEach(function (i) { i.destroy(); });
    registry.length = 0;
  }

  window.ApxLiquidGlass = {
    init: init,
    applyAll: applyAll,
    destroyAll: destroyAll,
    presets: PRESETS,
    get instances() { return registry; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { applyAll(); });
  } else {
    applyAll();
  }
})();
