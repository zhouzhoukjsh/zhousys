/* =========================================================
   ZhouSys · 产品后台
   纯静态站点，通过 GitHub API 直接提交文件：
     data/products.json      产品索引（名称、日期、封面、简介页路径）
     images/covers/<id>.<ext> 封面
     products/<id>.html       简介页
   ========================================================= */
(function () {
  'use strict';

  var CFG_KEY = 'zhousys_admin_cfg';

  var state = {
    token: '',
    owner: '',
    repo: '',
    branch: 'main',
    products: []
  };

  var $ = function (id) { return document.getElementById(id); };

  function setMsg(el, text, type) {
    if (!el) return;
    el.textContent = text || '';
    el.className = 'admin-msg' + (type ? ' ' + type : '');
  }

  function today() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* ---------- base64（UTF-8 安全） ---------- */
  function b64Encode(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function b64Decode(b64) {
    var bin = atob(String(b64).replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function arrayBufferToBase64(buf) {
    var bytes = new Uint8Array(buf);
    var binary = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  /* ---------- GitHub REST ---------- */
  function contentsUrl(path) {
    return 'https://api.github.com/repos/' + state.owner + '/' + state.repo + '/contents/' + path;
  }
  function repoUrl(path) {
    return 'https://api.github.com/repos/' + state.owner + '/' + state.repo + path;
  }

  function ghRequest(url, method, body) {
    var opt = {
      method: method,
      headers: {
        Authorization: 'Bearer ' + state.token,
        Accept: 'application/vnd.github+json'
      }
    };
    if (body) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    return fetch(url, opt).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          var err = new Error('HTTP ' + res.status + ' ' + t.slice(0, 300));
          err.status = res.status;
          throw err;
        });
      }
      return res.json();
    });
  }

  function ghGet(path) {
    return fetch(contentsUrl(path) + '?ref=' + encodeURIComponent(state.branch), {
      headers: {
        Authorization: 'Bearer ' + state.token,
        Accept: 'application/vnd.github+json'
      }
    }).then(function (res) {
      if (res.status === 404) return null;
      if (!res.ok) {
        return res.text().then(function (t) {
          throw new Error('读取 ' + path + ' 失败：HTTP ' + res.status + ' ' + t.slice(0, 200));
        });
      }
      return res.json();
    });
  }

  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  /* 多文件一次提交：整篇内容只产生 1 个 commit，失败不留半截文件 */
  function commitMany(changes, message) {
    if (!changes.length) return Promise.resolve(null);

    var blobShas = Promise.all(changes.map(function (c) {
      if (c.remove) return null;
      return ghRequest(repoUrl('/git/blobs'), 'POST', {
        content: c.content,
        encoding: 'base64'
      }).then(function (blob) { return blob.sha; });
    }));

    return blobShas.then(function (shas) {
      var entries = changes.map(function (c, i) {
        return {
          path: c.path,
          mode: '100644',
          type: 'blob',
          sha: c.remove ? null : shas[i]
        };
      });

      var attempt = 0;
      function step() {
        return ghRequest(repoUrl('/git/ref/heads/' + encodeURIComponent(state.branch)), 'GET')
          .then(function (ref) {
            var parentSha = ref.object.sha;
            return ghRequest(repoUrl('/git/commits/' + parentSha), 'GET')
              .then(function (parent) {
                return ghRequest(repoUrl('/git/trees'), 'POST', {
                  base_tree: parent.tree.sha,
                  tree: entries
                });
              })
              .then(function (tree) {
                return ghRequest(repoUrl('/git/commits'), 'POST', {
                  message: message,
                  tree: tree.sha,
                  parents: [parentSha]
                });
              })
              .then(function (commit) {
                return ghRequest(repoUrl('/git/refs/heads/' + encodeURIComponent(state.branch)), 'PATCH', {
                  sha: commit.sha,
                  force: false
                });
              });
          })
          .catch(function (e) {
            attempt++;
            if (attempt >= 4) throw new Error('提交失败：' + e.message);
            return sleep(400 * attempt).then(step);
          });
      }
      return step();
    });
  }

  /* ---------- 数据 ---------- */
  function productsPayload() {
    return JSON.stringify({ items: state.products }, null, 2);
  }

  function loadData() {
    return ghGet('data/products.json').then(function (res) {
      state.products = res ? (JSON.parse(b64Decode(res.content)).items || []) : [];
    });
  }

  /* ---------- 列表渲染 ---------- */
  function sortByDate(items) {
    return items.slice().sort(function (a, b) {
      var da = a.date || '';
      var db = b.date || '';
      if (da === db) return (a.id || 0) - (b.id || 0);
      return da.localeCompare(db);
    });
  }

  function renderList() {
    var ul = $('productList');
    ul.innerHTML = '';

    if (!state.products.length) {
      var li = document.createElement('li');
      li.className = 'admin-empty';
      li.textContent = '暂无';
      ul.appendChild(li);
      return;
    }

    sortByDate(state.products).forEach(function (it) {
      var li = document.createElement('li');
      li.className = 'admin-item';

      if (it.cover) {
        var img = document.createElement('img');
        img.className = 'admin-item-cover';
        img.src = it.cover;
        img.alt = '';
        li.appendChild(img);
      }

      var info = document.createElement('div');
      info.className = 'admin-item-info';

      var t = document.createElement('span');
      t.className = 'admin-item-title';
      t.textContent = it.title;

      var m = document.createElement('span');
      m.className = 'admin-item-meta';
      m.textContent = it.date || '';

      info.appendChild(t);
      info.appendChild(m);
      li.appendChild(info);

      var del = document.createElement('button');
      del.className = 'abtn abtn--danger';
      del.textContent = '删除';
      del.addEventListener('click', function () { removeProduct(it); });

      li.appendChild(del);
      ul.appendChild(li);
    });
  }

  /* ---------- 新增 ---------- */
  function safeExt(name) {
    var m = /\.([a-zA-Z0-9]+)$/.exec(name || '');
    var ext = m ? m[1].toLowerCase() : 'jpg';
    if (ext === 'jpeg') ext = 'jpg';
    return ext.replace(/[^a-z0-9]/g, '') || 'jpg';
  }

  function addProduct() {
    var title = $('pTitle').value.trim();
    var coverFile = $('pCover').files[0];
    var pageFile = $('pPage').files[0];
    var date = $('pDate').value || today();
    var msg = $('addMsg');

    if (!title) { setMsg(msg, '请填写名称', 'err'); return; }
    if (!coverFile) { setMsg(msg, '请选择封面图', 'err'); return; }
    if (!pageFile) { setMsg(msg, '请选择简介页 HTML 文件', 'err'); return; }
    if (!/\.html?$/i.test(pageFile.name)) {
      setMsg(msg, '简介页只支持 .html / .htm 文件', 'err');
      return;
    }

    var btn = $('addBtn');
    btn.disabled = true;
    setMsg(msg, '正在上传…');

    var id = Date.now();
    var coverPath = 'images/covers/' + id + '.' + safeExt(coverFile.name);
    var pagePath = 'products/' + id + '.html';
    var newItem = { id: id, title: title, date: date, cover: coverPath, page: pagePath };

    Promise.all([
      coverFile.arrayBuffer(),
      pageFile.text()
    ]).then(function (results) {
      var changes = [
        { path: coverPath, content: arrayBufferToBase64(results[0]) },
        { path: pagePath, content: b64Encode(results[1]) }
      ];

      state.products.push(newItem);
      changes.push({ path: 'data/products.json', content: b64Encode(productsPayload()) });

      setMsg(msg, '正在提交（3 个文件，1 次提交）…');
      return commitMany(changes, '发布产品：' + title);
    }).then(function () {
      $('pTitle').value = '';
      $('pCover').value = '';
      $('pPage').value = '';
      $('coverPreview').style.display = 'none';
      $('coverPreview').removeAttribute('src');
      $('pDate').value = today();
      renderList();
      setMsg(msg, '发布成功，站点约 1 分钟后生效', 'ok');
    }).catch(function (e) {
      var i = state.products.findIndex(function (x) { return x.id === id; });
      if (i > -1) state.products.splice(i, 1);
      setMsg(msg, e.message, 'err');
    }).then(function () {
      btn.disabled = false;
    });
  }

  /* ---------- 删除 ---------- */
  function removeProduct(item) {
    if (!confirm('确定删除「' + item.title + '」吗？封面和简介页也会一起删掉。')) return;

    var idx = state.products.findIndex(function (x) { return x.id === item.id; });
    if (idx === -1) return;

    var removed = state.products.splice(idx, 1)[0];
    var msg = $('addMsg');

    var changes = [{ path: 'data/products.json', content: b64Encode(productsPayload()) }];
    if (removed.page) changes.push({ path: removed.page, remove: true });
    if (removed.cover) changes.push({ path: removed.cover, remove: true });

    setMsg(msg, '正在删除…');
    commitMany(changes, '删除产品：' + item.title).then(function () {
      renderList();
      setMsg(msg, '已删除', 'ok');
    }).catch(function (e) {
      state.products.splice(idx, 0, removed);
      setMsg(msg, e.message, 'err');
    });
  }

  /* ---------- 连接 / 退出 ---------- */
  function connect() {
    var token = $('tokenInput').value.trim();
    var repoFull = $('repoInput').value.trim();
    var branch = $('branchInput').value.trim() || 'main';

    if (!token) { setMsg($('loginMsg'), '请填写 Token', 'err'); return; }
    if (!/^[^/]+\/[^/]+$/.test(repoFull)) {
      setMsg($('loginMsg'), '仓库格式应为 用户名/仓库名', 'err');
      return;
    }

    var parts = repoFull.split('/');
    state.token = token;
    state.owner = parts[0];
    state.repo = parts[1];
    state.branch = branch;

    setMsg($('loginMsg'), '正在验证…');
    loadData().then(function () {
      localStorage.setItem(CFG_KEY, JSON.stringify({
        token: token, repo: repoFull, branch: branch
      }));
      $('loginPanel').hidden = true;
      $('adminArea').hidden = false;
      $('statusText').textContent = '已连接 ' + state.owner + '/' + state.repo + '（' + state.branch + '）';
      $('pDate').value = today();
      setMsg($('loginMsg'), '');
      renderList();
    }).catch(function (e) {
      setMsg($('loginMsg'), e.message, 'err');
    });
  }

  function logout() {
    localStorage.removeItem(CFG_KEY);
    location.reload();
  }

  /* ---------- 启动 ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    var yearEl = $('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    var saved = localStorage.getItem(CFG_KEY);
    if (saved) {
      try {
        var cfg = JSON.parse(saved);
        $('tokenInput').value = cfg.token || '';
        $('repoInput').value = cfg.repo || '';
        $('branchInput').value = cfg.branch || 'main';
      } catch (e) { /* 配置损坏就忽略 */ }
    }

    $('connectBtn').addEventListener('click', connect);
    $('logoutBtn').addEventListener('click', logout);
    $('addBtn').addEventListener('click', addProduct);

    // 封面预览
    $('pCover').addEventListener('change', function () {
      var f = this.files[0];
      var img = $('coverPreview');
      if (!f) {
        img.style.display = 'none';
        return;
      }
      img.src = URL.createObjectURL(f);
      img.style.display = 'block';
    });

    if ($('tokenInput').value) connect();
  });
})();
