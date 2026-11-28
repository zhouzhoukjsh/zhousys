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
      var sorted = sortDesc(products);   // 发布时间越晚越靠前
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
        if (featureSection && second.buttons && second.buttons.length) {
          var oldFeature = featureSection.querySelector('.actions');
          if (oldFeature) oldFeature.remove();
          var featBtns = buildButtons(second, 'light');
          featBtns.classList.add('actions--block');   // 放到模块最底下
          featureSection.appendChild(featBtns);
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
    var frozen = false;

    function unfreeze(d) {
      var all = d.querySelectorAll('[data-zs-frozen]');
      for (var i = 0; i < all.length; i++) {
        all[i].style.height = all[i].getAttribute('data-zs-h') || '';
        all[i].style.minHeight = all[i].getAttribute('data-zs-mh') || '';
        all[i].removeAttribute('data-zs-frozen');
      }
    }

    // 页面的首屏常写 min-height:100vh 或 height:100vh。
    // 在 iframe 里 vh = iframe 高度，一旦 iframe 撑高，它会跟着长高 → 高度永远算不稳。
    // 所以把 min-height / height 的计算值正好等于「一屏」的元素固定成 px。
    // 注意不能只看元素自身高度：min-height:100vh 的容器内容可能超过一屏。
    function freezeViewport(d, vh) {
      var nodes = d.body.querySelectorAll('*');
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (el.hasAttribute('data-zs-frozen')) continue;

        var cs;
        try { cs = d.defaultView.getComputedStyle(el); } catch (e) { continue; }
        if (cs.display === 'none') continue;

        var mh = parseFloat(cs.minHeight);
        var hh = parseFloat(cs.height);
        var hitMin = !isNaN(mh) && Math.abs(mh - vh) < 1.5;
        var hitH = !isNaN(hh) && Math.abs(hh - vh) < 1.5;
        if (!hitMin && !hitH) continue;

        el.setAttribute('data-zs-h', el.style.height || '');
        el.setAttribute('data-zs-mh', el.style.minHeight || '');
        if (hitMin) el.style.minHeight = vh + 'px';
        if (hitH) el.style.height = vh + 'px';
        el.setAttribute('data-zs-frozen', '1');
      }
    }

    function measure() {
      var d;
      try { d = frame.contentDocument; } catch (e) { return; }
      if (!d || !d.body) return;

      var body = d.body;
      var vh = window.innerHeight;

      // 内层不滚动，滚动条只留外层一条
      try {
        d.documentElement.style.overflow = 'hidden';
        body.style.overflow = 'hidden';
      } catch (e) { /* 跨域时忽略 */ }

      if (!frozen) {
        unfreeze(d);
        frame.style.height = vh + 'px';   // 让 100vh 先按真实一屏算
        freezeViewport(d, vh);
        frozen = true;
      }

      var h = Math.ceil(Math.max(
        body.getBoundingClientRect().height,
        body.scrollHeight,
        body.offsetHeight
      )) + 1;

      if (h > 1) frame.style.height = h + 'px';
    }

    // 兜底：页面里「滚动到才显示」的元素靠 IntersectionObserver，
    // iframe 被撑满后没有滚动空间，它们可能永远收不到触发信号 → 一片空白。
    // 这里把仍然是全透明的元素直接显示出来（display:none 的不动）。
    function forceVisible(d) {
      try {
        var all = d.body.querySelectorAll('*');
        for (var i = 0; i < all.length; i++) {
          var el = all[i];
          var cs = d.defaultView.getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          if (parseFloat(cs.opacity) < 0.05) {
            el.style.opacity = '1';
            if (cs.transform && cs.transform !== 'none') el.style.transform = 'none';
          }
        }
      } catch (e) { /* 跨域时忽略 */ }
    }

    function watch() {
      frozen = false;

      var d;
      try { d = frame.contentDocument; } catch (e) { return; }
      if (!d || !d.body) return;

      frame.style.visibility = 'hidden';
      frame.style.height = window.innerHeight + 'px';

      setTimeout(function () {
        try {
          d.documentElement.style.overflow = 'hidden';
          d.body.style.overflow = 'hidden';
        } catch (e) { /* 跨域时忽略 */ }

        if (!frozen) {
          freezeViewport(d, window.innerHeight);
          frozen = true;
        }

        measure();
        frame.style.visibility = 'visible';
        bindLate(d);

        // 先让页面自己的动画跑一会儿，再把还没露出来的补上
        setTimeout(function () {
          forceVisible(d);
          measure();
        }, 800);
        setTimeout(function () {
          forceVisible(d);
          measure();
        }, 2000);
      }, 60);
    }

    function bindLate(d) {
      var imgs = d.querySelectorAll('img');
      for (var i = 0; i < imgs.length; i++) {
        if (!imgs[i].complete) imgs[i].addEventListener('load', measure);
      }
      if (d.fonts && d.fonts.ready) d.fonts.ready.then(measure).catch(function () {});

      setTimeout(measure, 200);
      setTimeout(measure, 600);
      setTimeout(measure, 1200);
      setTimeout(measure, 2200);
      setTimeout(measure, 3500);
    }

    frame.addEventListener('load', watch);

    window.addEventListener('resize', function () {
      frozen = false;
      measure();
    });

    setTimeout(measure, 300);
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
