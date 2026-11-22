/* =========================================================
   ZhouSys · 产品渲染
   首页：按发布时间从早到晚排在主页（最早的占大图位，越晚越靠后）
   详情页：把上传的 HTML 嵌进标题栏与页脚之间
   ========================================================= */
(function () {
  'use strict';

  var DATA = 'data/products.json';

  function sortByDate(items) {
    return items.slice().sort(function (a, b) {
      var da = a.date || '';
      var db = b.date || '';
      if (da === db) return (a.id || 0) - (b.id || 0);   // 同一天按创建先后
      return da.localeCompare(db);                        // 越早越前
    });
  }

  function detailUrl(item) {
    return 'product.html?id=' + encodeURIComponent(item.id);
  }

  function loadProducts() {
    return fetch(DATA, { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        return Array.isArray(data.items) ? data.items : [];
      })
      .catch(function () {
        return null;   // 读不到就保持页面上的「暂无」
      });
  }

  /* ---------------- 首页 ---------------- */
  function renderHome(items) {
    if (!items || !items.length) return;

    var sorted = sortByDate(items);
    var first = sorted[0];
    var rest = sorted.slice(1);

    // 大图位
    var titleEl = document.getElementById('featureTitle');
    var mediaEl = document.getElementById('featureMedia');
    if (titleEl) titleEl.textContent = first.title;
    if (mediaEl) {
      mediaEl.innerHTML = '';
      var a = document.createElement('a');
      a.className = 'feature';
      a.href = detailUrl(first);
      var img = document.createElement('img');
      img.className = 'feature__img';
      img.src = first.cover || '';
      img.alt = first.title || '';
      a.appendChild(img);
      mediaEl.appendChild(a);
    }

    // 更多产品
    var grid = document.getElementById('tileGrid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!rest.length) {
      var empty = document.createElement('p');
      empty.className = 'tiles__empty';
      empty.textContent = '暂无';
      grid.appendChild(empty);
      return;
    }

    rest.forEach(function (it) {
      var a = document.createElement('a');
      a.className = 'tile tile--link';
      a.href = detailUrl(it);

      var h3 = document.createElement('h3');
      h3.className = 'tile__title';
      h3.textContent = it.title || '暂无';

      var media = document.createElement('div');
      media.className = 'tile__media';

      var img = document.createElement('img');
      img.className = 'tile__img';
      img.src = it.cover || '';
      img.alt = it.title || '';
      media.appendChild(img);

      a.appendChild(h3);
      a.appendChild(media);
      grid.appendChild(a);
    });
  }

  /* ---------------- 详情页 ---------------- */
  function renderDetail(items) {
    var frame = document.getElementById('docFrame');
    if (!frame) return;

    var id = new URLSearchParams(location.search).get('id');
    var item = null;
    if (items) {
      item = items.filter(function (x) { return String(x.id) === String(id); })[0] || null;
    }

    if (!item || !item.page) {
      frame.replaceWith(makeEmpty());
      return;
    }

    document.title = (item.title || '产品') + ' · ZhouSys';
    frame.src = item.page;

    /* 把内层页面完全拉长，让它自己没有滚动条，只剩外层一条 */
    var lastH = 0;

    function fit() {
      var d;
      try { d = frame.contentDocument; } catch (e) { return; }
      if (!d || !d.body) return;

      var body = d.body;
      var vh = window.innerHeight;

      // 1) 先把 iframe 撑到一屏，让页面里的 100vh 按真实一屏计算
      frame.style.height = vh + 'px';

      // 2) 高度正好等于一屏的元素（典型 100vh 首屏）冻结成 px，
      //    否则它会跟着 iframe 变高，永远算不出稳定高度
      var nodes = body.querySelectorAll('*');
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (el.getAttribute('data-zs-frozen') === '1') {
          el.style.height = el.getAttribute('data-zs-h') || '';
          el.style.minHeight = el.getAttribute('data-zs-mh') || '';
          el.removeAttribute('data-zs-frozen');
        }
        var rect = el.getBoundingClientRect();
        if (rect.height > 0 && Math.abs(rect.height - vh) < 1) {
          el.setAttribute('data-zs-h', el.style.height || '');
          el.setAttribute('data-zs-mh', el.style.minHeight || '');
          el.style.height = vh + 'px';
          // 关键：min-height:100vh 会压过 height，必须一起固定，否则首屏永远跟着 iframe 变高
          el.style.minHeight = vh + 'px';
          el.setAttribute('data-zs-frozen', '1');
        }
      }

      // 3) 关掉内层滚动，外层拉满内容高度
      try {
        d.documentElement.style.overflow = 'hidden';
        body.style.overflow = 'hidden';
      } catch (e) { /* 跨域时忽略 */ }

      var r = body.getBoundingClientRect();
      var h = Math.ceil(Math.max(r.height, body.scrollHeight, body.offsetHeight)) + 1;
      if (h <= 1) return;
      if (Math.abs(h - lastH) < 1) return;   // 没变化就不动，避免抖动

      lastH = h;
      frame.style.height = h + 'px';
    }

    function watch() {
      lastH = 0;
      fit();

      var d;
      try { d = frame.contentDocument; } catch (e) { return; }
      if (!d || !d.body) return;

      // 图片、字体、异步内容都会改变高度，补算几次
      var imgs = d.querySelectorAll('img');
      for (var i = 0; i < imgs.length; i++) {
        if (!imgs[i].complete) imgs[i].addEventListener('load', fit);
      }
      if (d.fonts && d.fonts.ready) d.fonts.ready.then(fit).catch(function () {});

      if (window.ResizeObserver) {
        var timer = 0;
        var ro = new ResizeObserver(function () {
          clearTimeout(timer);
          timer = setTimeout(fit, 80);
        });
        ro.observe(d.body);
      }

      setTimeout(fit, 400);
      setTimeout(fit, 1200);
    }

    frame.addEventListener('load', watch);
    window.addEventListener('resize', fit);
    setTimeout(fit, 300);
  }

  function makeEmpty() {
    var p = document.createElement('p');
    p.className = 'doc-empty';
    p.textContent = '暂无';
    return p;
  }

  /* ---------------- 启动 ---------------- */
  document.addEventListener('DOMContentLoaded', function () {
    var isDetail = !!document.getElementById('docFrame');
    loadProducts().then(function (items) {
      if (isDetail) renderDetail(items);
      else renderHome(items);
    });
  });
})();
