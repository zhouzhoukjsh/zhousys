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

    function fit() {
      try {
        var d = frame.contentDocument;
        if (!d) return;
        var h = Math.max(
          d.documentElement ? d.documentElement.scrollHeight : 0,
          d.body ? d.body.scrollHeight : 0
        );
        if (h > 0) frame.style.height = h + 'px';
      } catch (e) { /* 读不到就保留默认高度 */ }
    }

    frame.addEventListener('load', fit);
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
