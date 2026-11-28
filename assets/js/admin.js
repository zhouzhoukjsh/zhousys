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
    products: [],
    news: [],
    editingProduct: null,
    editingNews: null
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
      return ghGet('data/news.json');
    }).then(function (res) {
      state.news = res ? (JSON.parse(b64Decode(res.content)).items || []) : [];
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

      var acts = document.createElement('div');
      acts.className = 'admin-item-actions';

      var edit = document.createElement('button');
      edit.className = 'abtn abtn--ghost abtn--sm';
      edit.textContent = '编辑';
      edit.addEventListener('click', function () { startEditProduct(it); });

      var del = document.createElement('button');
      del.className = 'abtn abtn--danger';
      del.textContent = '删除';
      del.addEventListener('click', function () { removeProduct(it); });

      acts.appendChild(edit);
      acts.appendChild(del);
      li.appendChild(acts);
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

  /* 从文件夹里挑入口 HTML：优先 index.html，其次最外层的 html */
  function pickEntry(list) {
    var htmls = list.filter(function (f) { return /\.html?$/i.test(f.name); });
    if (!htmls.length) return null;

    var index = htmls.filter(function (f) {
      return /(^|\/)index\.html?$/i.test(f.webkitRelativePath);
    })[0];
    if (index) return index;

    htmls.sort(function (a, b) {
      return a.webkitRelativePath.split('/').length - b.webkitRelativePath.split('/').length;
    });
    return htmls[0];
  }

  function resetProductForm() {
    $('pTitle').value = '';
    $('pCover').value = '';
    $('pDir').value = '';
    $('pPage').value = '';
    $('pDate').value = today();
    $('coverPreview').style.display = 'none';
    $('coverPreview').removeAttribute('src');
    renderBtnRows(null);
    state.editingProduct = null;
    $('addBtn').textContent = '发布产品';
    $('cancelPBtn').hidden = true;
    $('pEditHint').hidden = true;
  }

  function startEditProduct(item) {
    state.editingProduct = item;

    $('pTitle').value = item.title || '';
    $('pDate').value = item.date || today();
    $('pCover').value = '';
    $('pDir').value = '';
    $('pPage').value = '';
    renderBtnRows(item.buttons || null);

    var img = $('coverPreview');
    if (item.cover) {
      img.src = item.cover;
      img.style.display = 'block';
    } else {
      img.style.display = 'none';
      img.removeAttribute('src');
    }

    $('addBtn').textContent = '保存修改';
    $('cancelPBtn').hidden = false;

    var hint = $('pEditHint');
    hint.hidden = false;
    hint.textContent = '正在编辑「' + item.title + '」。封面和简介页不重新选就保持原样。';

    setMsg($('addMsg'), '');
    $('pTitle').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function addProduct() {
    var editing = state.editingProduct;
    var title = $('pTitle').value.trim();
    var coverFile = $('pCover').files[0];
    var dirFiles = $('pDir').files;
    var pageFile = $('pPage').files[0];
    var date = $('pDate').value || today();
    var msg = $('addMsg');

    var useDir = dirFiles && dirFiles.length > 0;
    var list = useDir ? Array.prototype.slice.call(dirFiles) : [];
    var entry = useDir ? pickEntry(list) : null;

    if (!title) {
      if (editing) title = editing.title;
      else { setMsg(msg, '请填写名称', 'err'); return; }
    }

    if (!editing) {
      if (!coverFile) { setMsg(msg, '请选择封面图', 'err'); return; }
      if (!useDir && !pageFile) {
        setMsg(msg, '请选择简介页文件夹，或者选一个 HTML 文件', 'err');
        return;
      }
    }

    if (pageFile && !/\.html?$/i.test(pageFile.name)) {
      setMsg(msg, '简介页只支持 .html / .htm 文件', 'err');
      return;
    }
    if (useDir && !entry) {
      setMsg(msg, '这个文件夹里没找到 .html 文件', 'err');
      return;
    }

    var btn = $('addBtn');
    btn.disabled = true;
    setMsg(msg, editing ? '正在保存…' : '正在上传…');

    var id = editing ? editing.id : Date.now();
    var newItem = editing ? JSON.parse(JSON.stringify(editing)) : { id: id };
    newItem.id = id;
    newItem.title = title;
    newItem.date = date;
    newItem.buttons = collectButtons();

    var changes = [];
    var oldCover = editing ? (editing.cover || '') : '';
    var oldFiles = editing
      ? (Array.isArray(editing.files) && editing.files.length
          ? editing.files.slice()
          : (editing.page ? [editing.page] : []))
      : [];

    var job = Promise.resolve();

    /* 封面（选了才替换） */
    if (coverFile) {
      job = job
        .then(function () { return coverFile.arrayBuffer(); })
        .then(function (buf) {
          var coverPath = 'images/covers/' + id + '.' + safeExt(coverFile.name);
          changes.push({ path: coverPath, content: arrayBufferToBase64(buf) });
          newItem.cover = coverPath;
          if (oldCover && oldCover !== coverPath) changes.push({ path: oldCover, remove: true });
        });
    }

    /* 简介页（选了才替换） */
    var newFiles = [];
    if (useDir) {
      var entryRel = entry.webkitRelativePath.split('/').slice(1).join('/');

      list.forEach(function (f) {
        job = job.then(function () {
          return f.arrayBuffer().then(function (buf) {
            var rel = f.webkitRelativePath.split('/').slice(1).join('/');
            var dest = 'products/' + id + '/' + rel;
            changes.push({ path: dest, content: arrayBufferToBase64(buf) });
            newFiles.push(dest);
          });
        });
      });

      job = job.then(function () {
        newItem.page = 'products/' + id + '/' + entryRel;
        newItem.files = newFiles;
        oldFiles.forEach(function (p) {
          if (p && newFiles.indexOf(p) === -1) changes.push({ path: p, remove: true });
        });
      });
      setMsg(msg, '正在读取 ' + list.length + ' 个文件…');
    } else if (pageFile) {
      job = job.then(function () {
        return pageFile.arrayBuffer().then(function (buf) {
          var pagePath = 'products/' + id + '.html';
          changes.push({ path: pagePath, content: arrayBufferToBase64(buf) });
          newItem.page = pagePath;
          newItem.files = [pagePath];
          oldFiles.forEach(function (p) {
            if (p && p !== pagePath) changes.push({ path: p, remove: true });
          });
        });
      });
    }

    var backup = null;
    var backupIdx = -1;

    job.then(function () {
      if (editing) {
        backupIdx = state.products.findIndex(function (x) { return x.id === id; });
        if (backupIdx > -1) {
          backup = state.products[backupIdx];
          state.products[backupIdx] = newItem;
        }
      } else {
        state.products.push(newItem);
      }

      changes.push({ path: 'data/products.json', content: b64Encode(productsPayload()) });
      setMsg(msg, '正在提交（' + changes.length + ' 个文件，1 次提交）…');
      return commitMany(changes, (editing ? '修改产品：' : '发布产品：') + title);
    }).then(function () {
      resetProductForm();
      renderList();
      setMsg(msg, editing ? '已保存，站点约 1 分钟后生效' : '发布成功，站点约 1 分钟后生效', 'ok');
    }).catch(function (e) {
      if (backup && backupIdx > -1) state.products[backupIdx] = backup;
      if (!editing) {
        var i = state.products.findIndex(function (x) { return x.id === id; });
        if (i > -1) state.products.splice(i, 1);
      }
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

    // 收集这个产品名下的所有文件：新数据有 files 列表，老数据只有 page
    var paths = [];
    if (Array.isArray(removed.files) && removed.files.length) {
      paths = removed.files.slice();
    } else if (removed.page) {
      paths.push(removed.page);
    }
    if (removed.cover) paths.push(removed.cover);

    var changes = [{ path: 'data/products.json', content: b64Encode(productsPayload()) }];
    paths.filter(function (p, i) { return p && paths.indexOf(p) === i; })
      .forEach(function (p) { changes.push({ path: p, remove: true }); });

    setMsg(msg, '正在删除…');
    commitMany(changes, '删除产品：' + item.title).then(function () {
      renderList();
      setMsg(msg, '已删除', 'ok');
    }).catch(function (e) {
      state.products.splice(idx, 0, removed);
      setMsg(msg, e.message, 'err');
    });
  }

  /* ---------- 产品按钮 ---------- */
  function addBtnRow(label, url) {
    var box = $('btnRows');
    var row = document.createElement('div');
    row.className = 'btn-row';

    var name = document.createElement('input');
    name.type = 'text';
    name.className = 'btn-label';
    name.placeholder = '按钮文字';
    name.value = label || '';

    var link = document.createElement('input');
    link.type = 'text';
    link.className = 'btn-url';
    link.placeholder = '链接（留空 = 进详情页）';
    link.value = url || '';

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn-del';
    del.textContent = '×';
    del.title = '删除这个按钮';
    del.addEventListener('click', function () {
      if (box.children.length <= 1) {
        name.value = '';
        link.value = '';
        return;
      }
      row.remove();
    });

    row.appendChild(name);
    row.appendChild(link);
    row.appendChild(del);
    box.appendChild(row);
  }

  function renderBtnRows(buttons) {
    var box = $('btnRows');
    if (!box) return;
    box.innerHTML = '';
    var list = (buttons && buttons.length) ? buttons : [{ label: '查看详情', url: '' }];
    list.forEach(function (b) { addBtnRow(b.label || '', b.url || ''); });
  }

  function collectButtons() {
    var rows = document.querySelectorAll('#btnRows .btn-row');
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var label = rows[i].querySelector('.btn-label').value.trim();
      var url = rows[i].querySelector('.btn-url').value.trim();
      if (!label) continue;                 // 没写名字的丢掉
      out.push({ label: label, url: url }); // url 为空 = 查看详情
    }
    return out;
  }

  /* ---------- 新闻 ---------- */
  function newsPayload() {
    return JSON.stringify({ items: state.news }, null, 2);
  }

  // 从 mammoth 输出的 HTML 里抠出 base64 图片
  function extractInlineImages(html) {
    var re = /data:image\/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)/g;
    var found = [];
    var m;
    while ((m = re.exec(html)) !== null) {
      found.push({
        full: m[0],
        ext: m[1].toLowerCase().replace('jpeg', 'jpg'),
        b64: m[2].replace(/\s/g, '')
      });
    }
    return found;
  }

  // 把正文包成完整页面，详情页 iframe 直接显示
  // Word 里第一行往往就是大标题，转换后会与站点标题重复，去掉
  function stripDupTitle(html, title) {
    try {
      var doc = new DOMParser().parseFromString('<div id="__r">' + html + '</div>', 'text/html');
      var root = doc.getElementById('__r');
      if (!root) return html;

      var first = root.firstElementChild;
      if (first && /^H[1-2]$/i.test(first.tagName)) {
        var a = (first.textContent || '').replace(/\s/g, '');
        var b = (title || '').replace(/\s/g, '');
        if (a && b && (a === b || a.indexOf(b) > -1 || b.indexOf(a) > -1)) {
          first.remove();
        }
      }
      return root.innerHTML;
    } catch (e) {
      return html;
    }
  }

  function wrapNewsHtml(bodyHtml) {
    var css = 'body{margin:0;background:#fff;color:#1d1d1f;' +
      'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;' +
      'font-size:17px;line-height:1.78;-webkit-font-smoothing:antialiased}' +
      'article{max-width:760px;margin:0 auto;padding:6px 4px 48px}' +
      'h1,h2,h3,h4{line-height:1.3;letter-spacing:-.012em;margin:34px 0 14px;font-weight:600}' +
      'h1{font-size:30px}h2{font-size:24px}h3{font-size:20px}' +
      'p{margin:0 0 16px}' +
      'img{max-width:100%;height:auto;display:block;margin:22px 0;border-radius:10px}' +
      'table{width:100%;border-collapse:collapse;margin:18px 0;font-size:15px}' +
      'th,td{border:1px solid #e5e5ea;padding:9px 12px;text-align:left}' +
      'th{background:#f5f5f7;font-weight:600}' +
      'blockquote{margin:18px 0;padding:8px 16px;border-left:3px solid #2aa9e0;color:#555}' +
      'ul,ol{margin:0 0 16px;padding-left:24px}li{margin-bottom:6px}';

    return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style>' + css + '</style></head><body><article>' + bodyHtml + '</article></body></html>';
  }

  function resetNewsForm() {
    $('nTitle').value = '';
    $('nFile').value = '';
    $('nDate').value = today();
    state.editingNews = null;
    $('addNewsBtn').textContent = '发布新闻';
    $('cancelNBtn').hidden = true;
    $('nEditHint').hidden = true;
  }

  function startEditNews(item) {
    state.editingNews = item;

    $('nTitle').value = item.title || '';
    $('nDate').value = item.date || today();
    $('nFile').value = '';

    $('addNewsBtn').textContent = '保存修改';
    $('cancelNBtn').hidden = false;

    var hint = $('nEditHint');
    hint.hidden = false;
    hint.textContent = '正在编辑「' + item.title + '」。不重新选 Word 就只改标题和日期，正文保持原样。';

    setMsg($('newsMsg'), '');
    $('nTitle').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function addNews() {
    var editing = state.editingNews;
    var titleInput = $('nTitle').value.trim();
    var file = $('nFile').files[0];
    var date = $('nDate').value || today();
    var msg = $('newsMsg');

    if (file && !/\.docx$/i.test(file.name)) {
      setMsg(msg, '只支持 .docx，请在 Word 里另存为 .docx', 'err');
      return;
    }
    if (!editing && !file) {
      setMsg(msg, '请选择 Word 文档（.docx）', 'err');
      return;
    }
    if (file && !window.mammoth) {
      setMsg(msg, 'Word 解析组件没加载上，刷新页面再试', 'err');
      return;
    }

    var title = titleInput || (editing ? editing.title : '');
    if (!title) { setMsg(msg, '请填写标题', 'err'); return; }

    var btn = $('addNewsBtn');
    btn.disabled = true;
    setMsg(msg, editing ? '正在保存…' : '正在解析 Word…');

    var id = editing ? editing.id : Date.now();
    var newItem = editing
      ? JSON.parse(JSON.stringify(editing))
      : { id: id, title: title, date: date, page: '', images: [] };

    newItem.title = title;
    newItem.date = date;

    var changes = [];
    var job = Promise.resolve();

    if (file) {
      job = job
        .then(function () {
          setMsg(msg, '正在解析 Word…');
          return file.arrayBuffer();
        })
        .then(function (buf) {
          return window.mammoth.convertToHtml({ arrayBuffer: buf });
        })
        .then(function (result) {
          var content = stripDupTitle(result.value || '', title);
          var images = extractInlineImages(content);
          var imgPaths = [];

          images.forEach(function (img, i) {
            var path = 'news/images/' + id + '_' + (i + 1) + '.' + img.ext;
            changes.push({ path: path, content: img.b64 });
            imgPaths.push(path);
            content = content.split(img.full).join('../' + path);
          });

          var oldImages = (editing && editing.images) ? editing.images : [];
          oldImages.forEach(function (p) {
            if (p && imgPaths.indexOf(p) === -1) changes.push({ path: p, remove: true });
          });

          var pagePath = 'news/' + id + '.html';
          changes.push({ path: pagePath, content: b64Encode(wrapNewsHtml(content)) });

          newItem.page = pagePath;
          newItem.images = imgPaths;
        });
    }

    var backup = null;
    var backupIdx = -1;

    job.then(function () {
      if (editing) {
        backupIdx = state.news.findIndex(function (x) { return x.id === id; });
        if (backupIdx > -1) {
          backup = state.news[backupIdx];
          state.news[backupIdx] = newItem;
        }
      } else {
        state.news.push(newItem);
      }

      changes.push({ path: 'data/news.json', content: b64Encode(newsPayload()) });
      setMsg(msg, '正在提交（' + changes.length + ' 个文件，1 次提交）…');
      return commitMany(changes, (editing ? '修改新闻：' : '发布新闻：') + title);
    }).then(function () {
      resetNewsForm();
      renderNewsList();
      setMsg(msg, editing ? '已保存，站点约 1 分钟后生效' : '发布成功，站点约 1 分钟后生效', 'ok');
    }).catch(function (e) {
      if (backup && backupIdx > -1) state.news[backupIdx] = backup;
      if (!editing) {
        var i = state.news.findIndex(function (x) { return x.id === id; });
        if (i > -1) state.news.splice(i, 1);
      }
      setMsg(msg, e.message, 'err');
    }).then(function () {
      btn.disabled = false;
    });
  }

  function removeNews(item) {
    if (!confirm('确定删除「' + item.title + '」吗？正文和图片会一起删掉。')) return;

    var idx = state.news.findIndex(function (x) { return x.id === item.id; });
    if (idx === -1) return;

    var removed = state.news.splice(idx, 1)[0];
    var changes = [{ path: 'data/news.json', content: b64Encode(newsPayload()) }];

    if (removed.page) changes.push({ path: removed.page, remove: true });
    (removed.images || []).forEach(function (p) {
      changes.push({ path: p, remove: true });
    });

    setMsg($('newsMsg'), '正在删除…');
    commitMany(changes, '删除新闻：' + item.title).then(function () {
      renderNewsList();
      setMsg($('newsMsg'), '已删除', 'ok');
    }).catch(function (e) {
      state.news.splice(idx, 0, removed);
      setMsg($('newsMsg'), e.message, 'err');
    });
  }

  function renderNewsList() {
    var ul = $('newsList');
    if (!ul) return;
    ul.innerHTML = '';

    if (!state.news.length) {
      var li = document.createElement('li');
      li.className = 'admin-empty';
      li.textContent = '暂无';
      ul.appendChild(li);
      return;
    }

    state.news.slice().sort(function (a, b) {
      return (b.date || '').localeCompare(a.date || '') || ((b.id || 0) - (a.id || 0));
    }).forEach(function (it) {
      var li = document.createElement('li');
      li.className = 'admin-item';

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

      var acts = document.createElement('div');
      acts.className = 'admin-item-actions';

      var edit = document.createElement('button');
      edit.className = 'abtn abtn--ghost abtn--sm';
      edit.textContent = '编辑';
      edit.addEventListener('click', function () { startEditNews(it); });

      var del = document.createElement('button');
      del.className = 'abtn abtn--danger';
      del.textContent = '删除';
      del.addEventListener('click', function () { removeNews(it); });

      acts.appendChild(edit);
      acts.appendChild(del);
      li.appendChild(acts);

      ul.appendChild(li);
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
      $('nDate').value = today();
      renderBtnRows(null);
      setMsg($('loginMsg'), '');
      renderList();
      renderNewsList();
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
    $('addBtnRow').addEventListener('click', function () { addBtnRow('', ''); });
    $('cancelPBtn').addEventListener('click', function () {
      resetProductForm();
      setMsg($('addMsg'), '已取消编辑');
    });
    $('cancelNBtn').addEventListener('click', function () {
      resetNewsForm();
      setMsg($('newsMsg'), '已取消编辑');
    });
    $('addNewsBtn').addEventListener('click', addNews);

    renderBtnRows(null);

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
