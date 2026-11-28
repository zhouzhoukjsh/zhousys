/* =========================================================
   ZhouSys · 前台渲染
   主页：产品按发布时间从早到晚占位（首屏 → 大图位 → 卡片），新闻最新在前
   详情页：把内容嵌进标题栏与页脚之间，只有一条外层滚动条
   ========================================================= */
(function () {
  'use strict';

  var DATA_PRODUCTS = 'data/products.json';
  var DATA_NEWS = 'data/news.json';

  /* ---------------- 工具 ---------------- */
  function loadJSON(path) {
    return fetch(path, { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        return Array.isArray(data.items) ? data.items : [];
      })
      .catch(function () {
        return [];             // 读不到就当没有，页面保留「暂无」
      });
  }

  function param(name) {
    return new URLSearchParams(location.search).get(name);
  }

  function sortAsc(items) {
    return items.slice().sort(function (a, b) {
      var da = a.date || '';
      var db = b.date || '';
      if (da === db) return (a.id || 0) - (b.id || 0);
      return da.localeCompare(db);          // 越早越前
    });
  }

  function sortDesc(items) {
    return items.slice().sort(function (a, b) {
      var da = a.date || '';
      var db = b.date || '';
      if (da === db) return (b.id || 0) - (a.id || 0);
      return db.localeCompare(da);          // 最新在前
    });
  }

  function productUrl(item) { return 'product.html?id=' + encodeURIComponent(item.id); }
  function newsUrl(item) { return 'news.html?id=' + encodeURIComponent(item.id); }

  /* ---------------- 产品按钮 ---------------- */
  function buildButtons(item, theme) {
    var list = (item.buttons && item.buttons.length)
      ? item.buttons
      : [{ label: '查看详情', url: '' }];

    var box = document.createElement('div');
    box.className = 'actions' + (theme === 'hero' ? ' actions--hero' : '');

    list.slice(0, 3).forEach(function (b, i) {
      var isDetail = !b.url;
      var a = document.createElement('a');
      a.href = isDetail ? productUrl(item) : b.url;
      if (!isDetail && /^https?:/i.test(b.url)) {
        a.target = '_blank';
        a.rel = 'noopener';
      }

      if (i === 0) a.className = 'btn btn--primary';
      else a.className = theme === 'hero' ? 'btn btn--ghost' : 'btn btn--ghost-dark';

      a.textContent = b.label || '查看详情';
      box.appendChild(a);
    });

    return box;
  }

  /* ---------------- 主页 ---------------- */
  function renderHome(products, news) {
    if (products && products.length) {
      var sorted = sortAsc(products);
      var first = sorted[0];              // 1 → 首屏
      var second = sorted[1] || null;     // 2 → 大图位
      var rest = sorted.slice(2);         // 3 之后 → 卡片

      /* 首屏 */
      var heroTitle = document.getElementById('heroTitle');
      var heroMedia = document.getElementById('heroMedia');
      var heroText = document.querySelector('.hero__text');

      if (heroTitle) {
        heroTitle.innerHTML = '';
        var ha = document.createElement('a');
        ha.className = 'hero__link';
        ha.href = productUrl(first);
        ha.textContent = first.title || '暂无';
        heroTitle.appendChild(ha);
      }

      if (heroMedia) {
        heroMedia.innerHTML = '';
        if (first.cover) {
          var hi = document.createElement('img');
          hi.className = 'hero__img';
          hi.src = first.cover;
          hi.alt = first.title || '';
          heroMedia.appendChild(hi);
        } else {
          var ph = document.createElement('div');
          ph.className = 'ph ph--dark';
          heroMedia.appendChild(ph);
        }
      }

      if (heroText && first.buttons && first.buttons.length) {
        var oldHero = heroText.querySelector('.actions');
        if (oldHero) oldHero.remove();
        heroText.appendChild(buildButtons(first, 'hero'));
      }

      /* 大图位 */
      var featureSection = document.getElementById('product');
      var featureTitle = document.getElementById('featureTitle');
      var featureMedia = document.getElementById('featureMedia');
      var featureHead = featureTitle ? featureTitle.parentNode : null;

      if (second) {
        if (featureTitle) featureTitle.textContent = second.title || '暂无';
        if (featureMedia) {
          featureMedia.innerHTML = '';
          var fa = document.createElement('a');
          fa.className = 'feature';
          fa.href = productUrl(second);
          var fi = document.createElement('img');
          fi.className = 'feature__img';
          fi.src = second.cover || '';
          fi.alt = second.title || '';
          fa.appendChild(fi);
          featureMedia.appendChild(fa);
        }
        if (featureHead && second.buttons && second.buttons.length) {
          var oldFeature = featureHead.querySelector('.actions');
          if (oldFeature) oldFeature.remove();
          featureHead.appendChild(buildButtons(second, 'light'));
        }
      } else if (featureSection) {
        featureSection.style.display = 'none';   // 只有一个产品时整段收起
      }

      /* 卡片 */
      var grid = document.getElementById('tileGrid');
      if (grid) {
        grid.innerHTML = '';
        if (!rest.length) {
          var empty = document.createElement('p');
          empty.className = 'tiles__empty';
          empty.textContent = '暂无';
          grid.appendChild(empty);
        } else {
          rest.forEach(function (it) {
            var a = document.createElement('a');
            a.className = 'tile tile--link';
            a.href = productUrl(it);

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
      }
    }

    /* 新闻 */
    renderNewsList(news);
  }

  function renderNewsList(news) {
    var ul = document.getElementById('postList');
    if (!ul || !news || !news.length) return;

    ul.innerHTML = '';
    sortDesc(news).slice(0, 3).forEach(function (it) {
      var li = document.createElement('li');
      li.className = 'post';

      var a = document.createElement('a');
      a.className = 'post__link';
      a.href = newsUrl(it);

      var main = document.createElement('div');
      main.className = 'post__main';

      var tag = document.createElement('span');
      tag.className = 'post__tag';
      tag.textContent = '新闻';

      var h3 = document.createElement('h3');
      h3.className = 'post__title';
      h3.textContent = it.title || '暂无';

      main.appendChild(tag);
      main.appendChild(h3);

      var time = document.createElement('time');
      time.className = 'post__date';
      time.textContent = it.date || '';

      a.appendChild(main);
      a.appendChild(time);
      li.appendChild(a);
      ul.appendChild(li);
    });
  }

  /* ---------------- 详情页（产品 / 新闻共用） ---------------- */
  function setupFrame(frame) {
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
          // 关键：min-height:100vh 会压过 height，必须一起固定
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

      if (Math.abs(h - lastH) < 1) {
        // 高度没变：把测量时临时设成的「一屏」还回去，否则会停在一屏
        frame.style.height = lastH + 'px';
        return;
      }

      lastH = h;
      frame.style.height = h + 'px';
    }

    function watch() {
      lastH = 0;
      fit();

      var d;
      try { d = frame.contentDocument; } catch (e) { return; }
      if (!d || !d.body) return;

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

  function renderDetail(items, kind) {
    var frame = document.getElementById('docFrame');
    if (!frame) return;

    var id = param('id');
    var item = null;
    (items || []).forEach(function (x) {
      if (String(x.id) === String(id)) item = x;
    });

    if (!item || !item.page) {
      frame.replaceWith(makeEmpty());
      return;
    }

    document.title = (item.title || '详情') + ' · ZhouSys';

    if (kind === 'news') {
      var head = document.getElementById('newsHead');
      var t = document.getElementById('newsTitle');
      var d = document.getElementById('newsDate');
      if (head) head.hidden = false;
      if (t) t.textContent = item.title || '';
      if (d) d.textContent = item.date || '';
    }

    frame.src = item.page;
    setupFrame(frame);
  }

  /* ---------------- 启动 ---------------- */
  document.addEventListener('DOMContentLoaded', function () {
    var page = document.body.getAttribute('data-page') || 'home';

    if (page === 'product') {
      loadJSON(DATA_PRODUCTS).then(function (items) { renderDetail(items, 'product'); });
      return;
    }

    if (page === 'news') {
      loadJSON(DATA_NEWS).then(function (items) { renderDetail(items, 'news'); });
      return;
    }

    Promise.all([loadJSON(DATA_PRODUCTS), loadJSON(DATA_NEWS)]).then(function (res) {
      renderHome(res[0], res[1]);
    });
  });
})();
