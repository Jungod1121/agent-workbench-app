/* ============================================================
   liquid-glass-svg.js — 液态玻璃回退引擎（SVG feDisplacementMap）
   ============================================================
   当浏览器不支持 WebGL 时，由 liquid-glass.js 自动加载本文件。
   原理：圆角矩形 SDF 计算位移 → 颜色图编码（R=水平/G=垂直）→
   SVG feDisplacementMap 折射背景 → backdrop-filter 挂载。

   技术来源：childrentime/liquid-glass 原理拆解 +
   shuding/liquid-glass 参考实现（MIT），重写为即插即用版。

   用法：
     <div data-liquid-glass
          data-lg-radius="24"        // 可选：折射圆角，默认取 CSS 值
          data-lg-strength="0.08"    // 可选：边缘位移强度（相对短边）
          data-lg-interactive        // 可选：折射跟随鼠标（透镜）
          class="apx-liquid-regular">…</div>
     <script src="liquid-glass.js"></script>

   注意：
   - 元素必须已有半透明玻璃底色与普通 blur（无 JS 时优雅降级）
   - prefers-reduced-motion 下不启用鼠标透镜
   - 位移图按元素尺寸生成（上限 512px，feImage 拉伸），
     只在 resize / pointermove（rAF 节流）时重算
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 数学工具 ---------- */
  function clamp01(t) { return Math.max(0, Math.min(1, t)); }
  function smoothStep(a, b, t) {
    t = clamp01((t - a) / (b - a));
    return t * t * (3 - 2 * t); // 慢→快→慢，玻璃边缘过渡才自然
  }
  /* 圆角矩形有符号距离场：<0 在玻璃内，=0 在边缘 */
  function roundedRectSDF(x, y, cx, cy, hw, hh, r) {
    var qx = Math.abs(x - cx) - (hw - r);
    var qy = Math.abs(y - cy) - (hh - r);
    var ox = Math.max(qx, 0), oy = Math.max(qy, 0);
    return Math.min(Math.max(qx, qy), 0) + Math.sqrt(ox * ox + oy * oy) - r;
  }

  var MAP_MAX = 512;             // 位移图分辨率上限
  var reduced = window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 单个玻璃实例 ---------- */
  function Glass(el) {
    this.el = el;
    this.uid = 'apx-lg-' + Math.random().toString(36).slice(2, 10);
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.svg = null;
    this.filterEl = null;
    this.rafs = [];
    this.cleanups = [];
    this.active = false;
    this.init();
  }

  Glass.prototype.init = function () {
    var el = this.el;
    this.radius = parseFloat(el.dataset.lgRadius || '0');
    this.strength = parseFloat(el.dataset.lgStrength || '0.08');
    this.interactive = el.hasAttribute('data-lg-interactive') && !reduced;
    this.pointer = null;

    this.buildFilter();
    el.style.webkitBackdropFilter = this.filterValue();
    el.style.backdropFilter = this.filterValue();
    this.schedule();

    /* resize 重建 */
    var ro = new ResizeObserver(this.schedule.bind(this));
    ro.observe(el);
    this.cleanups.push(function () { ro.disconnect(); });

    /* 鼠标透镜（rAF 节流） */
    if (this.interactive) {
      var self = this;
      var move = function (e) {
        var r = el.getBoundingClientRect();
        self.pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
        self.schedule();
      };
      var leave = function () { self.pointer = null; self.schedule(); };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerleave', leave);
      this.cleanups.push(function () {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerleave', leave);
      });
    }
    this.active = true;
  };

  /* 建 SVG 滤镜：feImage(位移图) + feDisplacementMap */
  Glass.prototype.buildFilter = function () {
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';

    var defs = document.createElementNS(svgNS, 'defs');
    var filter = document.createElementNS(svgNS, 'filter');
    filter.setAttribute('id', this.uid);
    filter.setAttribute('x', '-10%'); filter.setAttribute('y', '-10%');
    filter.setAttribute('width', '120%'); filter.setAttribute('height', '120%');

    var feImage = document.createElementNS(svgNS, 'feImage');
    feImage.setAttribute('result', 'map');
    feImage.setAttribute('x', '0'); feImage.setAttribute('y', '0');
    feImage.setAttribute('width', '100%'); feImage.setAttribute('height', '100%');
    feImage.setAttribute('preserveAspectRatio', 'none');

    var feDisp = document.createElementNS(svgNS, 'feDisplacementMap');
    feDisp.setAttribute('in', 'SourceGraphic');
    feDisp.setAttribute('in2', 'map');
    feDisp.setAttribute('xChannelSelector', 'R');  // R=水平
    feDisp.setAttribute('yChannelSelector', 'G');  // G=垂直

    filter.appendChild(feImage);
    filter.appendChild(feDisp);
    defs.appendChild(filter);
    svg.appendChild(defs);
    document.body.appendChild(svg);

    this.svg = svg;
    this.feImage = feImage;
    this.feDisp = feDisp;
  };

  Glass.prototype.filterValue = function () {
    return 'url(#' + this.uid + ') blur(0.25px) contrast(1.2) brightness(1.05) saturate(1.1)';
  };

  /* rAF 节流：下一次帧渲染位移图 */
  Glass.prototype.schedule = function () {
    var self = this;
    if (this.rafs.length) return;
    var id = requestAnimationFrame(function () {
      self.rafs = [];
      self.render();
    });
    this.rafs.push(id);
  };

  /* 核心：SDF → 位移 → R/G 编码 → feImage */
  Glass.prototype.render = function () {
    var el = this.el;
    var w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;

    /* 位移图分辨率（够用就好，feImage 会拉伸） */
    var scale = Math.min(1, MAP_MAX / Math.max(w, h));
    var mw = Math.max(2, Math.round(w * scale));
    var mh = Math.max(2, Math.round(h * scale));
    this.canvas.width = mw; this.canvas.height = mh;
    var data = this.ctx.createImageData(mw, mh);
    var px = data.data;

    var r = this.radius > 0 ? this.radius : (w > h ? h : w) * 0.18;
    var hw = w / 2, hh = h / 2;
    var band = Math.min(w, h) * 0.30;        // 折射带宽度
    var maxD = Math.min(w, h) * this.strength; // 最大位移
    var maxScale = 0;
    var dxs = new Float32Array(mw * mh), dys = new Float32Array(mw * mh);
    var p = this.pointer;

    var i = 0;
    for (var y = 0; y < mh; y++) {
      for (var x = 0; x < mw; x++) {
        var wx = (x + 0.5) / mw * w;
        var wy = (y + 0.5) / mh * h;
        var d = roundedRectSDF(wx, wy, hw, hh, hw - 1, hh - 1, r);
        /* 边缘向内"拉"：越接近边缘位移越大，中心不动 */
        var amount = smoothStep(-band, 0, d) * maxD;
        var dx = (hw - wx) / hw * amount;
        var dy = (hh - wy) / hh * amount;

        /* 鼠标透镜：局部折射跟着手指走 */
        if (p) {
          var ldx = wx - p.x, ldy = wy - p.y;
          var dist = Math.sqrt(ldx * ldx + ldy * ldy);
          var lens = Math.max(w, h) * 0.18;
          if (dist < lens && dist > 0.001) {
            var t = (1 - dist / lens);
            var push = smoothStep(0, 1, t) * maxD * 1.6;
            dx += (ldx / dist) * push;
            dy += (ldy / dist) * push;
          }
        }

        dxs[i] = dx; dys[i] = dy;
        var adx = Math.abs(dx), ady = Math.abs(dy);
        if (adx > maxScale) maxScale = adx;
        if (ady > maxScale) maxScale = ady;
        i++;
      }
    }

    /* R=水平位移，G=垂直位移，128=不动 */
    for (i = 0; i < mw * mh; i++) {
      var o = i * 4;
      var rr = maxScale > 0 ? 128 + (dxs[i] / maxScale) * 127 : 128;
      var gg = maxScale > 0 ? 128 + (dys[i] / maxScale) * 127 : 128;
      px[o] = Math.max(0, Math.min(255, rr));
      px[o + 1] = Math.max(0, Math.min(255, gg));
      px[o + 2] = 0;      // B 未用
      px[o + 3] = 255;
    }
    this.ctx.putImageData(data, 0, 0);
    var url = this.canvas.toDataURL();
    this.feImage.setAttribute('href', url);
    this.feImage.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', url);
    this.feDisp.setAttribute('scale', String(maxScale * scale));
  };

  Glass.prototype.destroy = function () {
    this.cleanups.forEach(function (fn) { fn(); });
    if (this.svg && this.svg.parentNode) this.svg.parentNode.removeChild(this.svg);
    this.el.style.webkitBackdropFilter = '';
    this.el.style.backdropFilter = '';
    this.active = false;
  };

  /* ---------- 公共 API ---------- */
  var instances = [];

  function apply(el) {
    for (var i = 0; i < instances.length; i++) {
      if (instances[i].el === el) return instances[i];
    }
    var g = new Glass(el);
    instances.push(g);
    return g;
  }

  function destroy(el) {
    for (var i = 0; i < instances.length; i++) {
      if (instances[i].el === el) {
        instances[i].destroy();
        instances.splice(i, 1);
        return;
      }
    }
  }

  function destroyAll() {
    instances.slice().forEach(function (g) { g.destroy(); });
    instances = [];
  }

  function boot() {
    document.querySelectorAll('[data-liquid-glass]').forEach(apply);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.ApxLiquidGlassSvg = {
    apply: apply,
    destroy: destroy,
    destroyAll: destroyAll,
    refreshAll: function () { instances.forEach(function (g) { g.render(); }); }
  };
})();
