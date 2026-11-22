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

    /* 按内容实际高度撑开：不写死高度，也不留白 */
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
          el.removeAttribute('data-zs-frozen');
        }
        var rect = el.getBoundingClientRect();
        if (rect.height > 0 && Math.abs(rect.height - vh) < 1) {
          el.setAttribute('data-zs-h', el.style.height || '');
          el.style.height = vh + 'px';
          el.setAttribute('data-zs-frozen', '1');
        }
      }

      // 3) 按 body 实际高度设置，读完就固定
      var r = body.getBoundingClientRect();
      var h = Math.max(r.height, body.scrollHeight, body.offsetHeight);

      // 关掉子页面自己的滚动条：滚轮直接带动外层页面，只有一层滚动
      try {
        d.documentElement.style.overflow = 'hidden';
        body.style.overflow = 'hidden';
      } catch (e) { /* 跨域时忽略 */ }

      frame.style.height = (h > 0 ? Math.ceil(h) + 1 : 0) + 'px';
    }

    function watch() {
      fit();
      var d;
      try { d = frame.contentDocument; } catch (e) { return; }
      if (!d || !d.body) return;

      // 图片加载完高度会变，补算一次
      var imgs = d.querySelectorAll('img');
      for (var i = 0; i < imgs.length; i++) {
        if (!imgs[i].complete) imgs[i].addEventListener('load', fit);
      }
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
