(() => {
  'use strict';

  const STORE_KEY = 'clip-shelf:v1';
  const MAX_ITEMS = 50;

  const TYPE_ICONS = {
    text: 'Aa',
    link: '🔗',
    code: '{}',
    email: '@',
    color: '🎨',
    image: '🖼',
  };

  const TYPE_LABELS = {
    text: '文本',
    link: '链接',
    code: '代码',
    email: '邮件',
    color: '颜色',
    image: '图片',
  };

  const CATEGORIES = [
    { key: 'all', label: '全部', icon: '≡' },
    { key: 'pinned', label: '已置顶', icon: '📌' },
    { key: 'text', label: '文本', icon: 'Aa' },
    { key: 'link', label: '链接', icon: '🔗' },
    { key: 'code', label: '代码', icon: '{}' },
    { key: 'image', label: '图片', icon: '🖼' },
    { key: 'color', label: '颜色', icon: '🎨' },
  ];

  const els = {
    clipList: document.getElementById('clipList'),
    categoryList: document.getElementById('categoryList'),
    filterBar: document.getElementById('filterBar'),
    searchInput: document.getElementById('searchInput'),
    searchHint: document.getElementById('searchHint'),
    addBtn: document.getElementById('addBtn'),
    addModal: document.getElementById('addModal'),
    addTextarea: document.getElementById('addTextarea'),
    cancelAdd: document.getElementById('cancelAdd'),
    confirmAdd: document.getElementById('confirmAdd'),
    clearBtn: document.getElementById('clearBtn'),
    listMeta: document.getElementById('listMeta'),
    previewEmpty: document.getElementById('previewEmpty'),
    previewBody: document.getElementById('previewBody'),
    previewType: document.getElementById('previewType'),
    previewTime: document.getElementById('previewTime'),
    previewContent: document.getElementById('previewContent'),
    previewCopyBtn: document.getElementById('previewCopyBtn'),
    previewPinBtn: document.getElementById('previewPinBtn'),
    previewDelBtn: document.getElementById('previewDelBtn'),
    previewDrawer: document.getElementById('previewDrawer'),
    drawerType: document.getElementById('drawerType'),
    drawerBody: document.getElementById('drawerBody'),
    drawerClose: document.getElementById('drawerClose'),
    drawerPin: document.getElementById('drawerPin'),
    drawerCopy: document.getElementById('drawerCopy'),
    drawerDel: document.getElementById('drawerDel'),
    monitorBtn: document.getElementById('monitorBtn'),
    monitorStatus: document.getElementById('monitorStatus'),
    toast: document.getElementById('toast'),
  };

  let items = [];
  let filter = 'all';
  let search = '';
  let selectedId = null;
  let monitoring = false;
  let monitorTimer = null;
  let lastClipboard = '';
  let toastTimer = null;

  /* ---------- 类型识别 ---------- */

  function detectType(value) {
    if (typeof value !== 'string') return 'image';
    const trimmed = value.trim();
    if (!trimmed) return 'text';
    if (/^https?:\/\//i.test(trimmed) || /^ftp:\/\//i.test(trimmed)) return 'link';
    if (/^#[0-9A-Fa-f]{3,8}$/i.test(trimmed)) return 'color';
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'email';
    if (/[\r\n]/.test(value) || /[{[</]/.test(value) || value.length > 80) return 'code';
    return 'text';
  }

  function hash(value) {
    let h = 2166136261;
    const str = typeof value === 'string' ? value : value.toString();
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  /* ---------- 存储 ---------- */

  function loadItems() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter((it) => it && it.id && it.type);
      }
    } catch {
      // 忽略损坏的本地数据
    }
    return [];
  }

  function saveItems() {
    try {
      // 图片不持久化，只保存文本类
      const serializable = items.map((it) => (it.type === 'image' ? { ...it, content: '' } : it));
      localStorage.setItem(STORE_KEY, JSON.stringify(serializable));
    } catch {
      // 忽略无痕模式等不可写场景
    }
  }

  /* ---------- 数据操作 ---------- */

  function createItem(value, type = null) {
    const resolvedType = type || detectType(value);
    const item = {
      id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      type: resolvedType,
      content: value,
      pinned: false,
      copiedAt: Date.now(),
      copiedCount: 0,
      hash: hash(typeof value === 'string' ? value : value.toString()),
    };
    return item;
  }

  function seedItems() {
    const samples = [
      'https://github.com/AyaseEli-Bing/focus-ring',
      'const sum = (a, b) => a + b;',
      '#b83a1c',
      'hello@example.com',
      '专注不是一直工作，而是知道何时休息。',
      'npm run dev',
      'function fib(n) { return n <= 1 ? n : fib(n - 1) + fib(n - 2); }',
    ];
    return samples.map((s) => createItem(s)).reverse();
  }

  function upsert(value, type = null) {
    const text = typeof value === 'string' ? value : String(value);
    const h = hash(text);
    const existing = items.find((it) => it.hash === h && it.content === text);
    if (existing) {
      existing.copiedAt = Date.now();
      existing.copiedCount += 1;
      if (type && existing.type === 'text') existing.type = type;
      selectedId = existing.id;
    } else {
      const item = createItem(text, type);
      items.unshift(item);
      selectedId = item.id;
      trimItems();
    }
    saveItems();
    render();
  }

  function trimItems() {
    if (items.length <= MAX_ITEMS) return;
    const pinned = items.filter((it) => it.pinned);
    const unpinned = items.filter((it) => !it.pinned).slice(0, MAX_ITEMS - pinned.length);
    items = [...pinned, ...unpinned].sort((a, b) => b.copiedAt - a.copiedAt);
  }

  function deleteItem(id) {
    const it = items.find((i) => i.id === id);
    if (it && it.type === 'image' && typeof it.content === 'string' && it.content.startsWith('blob:')) {
      URL.revokeObjectURL(it.content);
    }
    items = items.filter((i) => i.id !== id);
    if (selectedId === id) selectedId = items[0]?.id || null;
    saveItems();
    render();
  }

  function clearAll() {
    items.forEach((it) => {
      if (it.type === 'image' && typeof it.content === 'string' && it.content.startsWith('blob:')) {
        URL.revokeObjectURL(it.content);
      }
    });
    items = [];
    selectedId = null;
    saveItems();
    render();
    showToast('剪贴历史已清空');
  }

  function togglePin(id) {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    it.pinned = !it.pinned;
    saveItems();
    render();
  }

  /* ---------- 渲染 ---------- */

  function filteredItems() {
    let list = [...items];
    if (filter === 'pinned') {
      list = list.filter((it) => it.pinned);
    } else if (filter !== 'all') {
      list = list.filter((it) => it.type === filter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((it) => (it.content || '').toString().toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.copiedAt - a.copiedAt;
    });
    return list;
  }

  function formatTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    if (isToday) return `${hours}:${minutes}`;
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  function buildPreview(item) {
    if (!item) return '';
    if (item.type === 'image') {
      return `<img src="${escapeHtml(item.content)}" alt="剪贴图片">`;
    }
    if (item.type === 'color') {
      return `<div class="color-block" style="background:${escapeHtml(item.content)}"></div><p style="margin-top:12px;font-family:var(--font-mono)">${escapeHtml(item.content)}</p>`;
    }
    if (item.type === 'link') {
      return `<a href="${escapeHtml(item.content)}" target="_blank" rel="noreferrer">${escapeHtml(item.content)}</a>`;
    }
    if (item.type === 'code') {
      return `<pre><code>${escapeHtml(item.content)}</code></pre>`;
    }
    return escapeHtml(item.content);
  }

  function renderCategories() {
    const counts = {};
    items.forEach((it) => {
      counts[it.type] = (counts[it.type] || 0) + 1;
    });

    els.categoryList.innerHTML = CATEGORIES.map((cat) => {
      const count = cat.key === 'all' ? items.length : cat.key === 'pinned' ? items.filter((it) => it.pinned).length : counts[cat.key] || 0;
      return `
        <button type="button" class="category" data-key="${cat.key}" aria-pressed="${cat.key === filter}">
          <span class="label"><span class="icon">${cat.icon}</span>${cat.label}</span>
          <span class="count">${count}</span>
        </button>
      `;
    }).join('');

    els.categoryList.querySelectorAll('.category').forEach((btn) => {
      btn.addEventListener('click', () => {
        filter = btn.dataset.key;
        render();
      });
    });
  }

  function renderFilterBar() {
    if (!els.filterBar) return;
    els.filterBar.innerHTML = CATEGORIES.map((cat) => {
      return `<button type="button" class="filter-chip" data-key="${cat.key}" aria-pressed="${cat.key === filter}">${cat.label}</button>`;
    }).join('');

    els.filterBar.querySelectorAll('.filter-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        filter = btn.dataset.key;
        render();
      });
    });
  }

  function renderList() {
    const list = filteredItems();
    els.listMeta.textContent = `${list.length} 个项目`;
    els.clearBtn.disabled = items.length === 0;

    if (list.length === 0) {
      els.clipList.innerHTML = `
        <div class="empty-state">
          <p>没有符合条件的剪贴</p>
          <p class="hint">按 Ctrl+V 粘贴，或点击右上角 + 添加</p>
        </div>
      `;
      return;
    }

    els.clipList.innerHTML = list.map((it) => {
      const icon = TYPE_ICONS[it.type] || TYPE_ICONS.text;
      const typeLabel = TYPE_LABELS[it.type] || '文本';
      const preview = it.type === 'image' ? '[图片]' : String(it.content);
      return `
        <article class="clip-card" data-id="${it.id}" role="listitem" aria-selected="${it.id === selectedId}">
          <div class="thumb" aria-hidden="true">${icon}</div>
          <div class="body">
            <p class="preview">${escapeHtml(preview)}</p>
            <div class="meta">
              <span class="type-chip">${typeLabel}</span>
              <span class="when">${formatTime(it.copiedAt)}</span>
              ${it.pinned ? '<span class="pin" aria-label="已置顶" title="已置顶">📌</span>' : ''}
              <div class="actions">
                <button type="button" class="icon-btn copy-card" data-id="${it.id}" title="复制">复制</button>
                <button type="button" class="icon-btn pin-card" data-id="${it.id}" title="${it.pinned ? '取消置顶' : '置顶'}">${it.pinned ? '取消' : '置顶'}</button>
                <button type="button" class="icon-btn danger del-card" data-id="${it.id}" title="删除">删除</button>
              </div>
            </div>
          </div>
        </article>
      `;
    }).join('');

    els.clipList.querySelectorAll('.clip-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        selectedId = card.dataset.id;
        render();
        if (window.innerWidth <= 760) {
          els.previewDrawer.showModal();
        }
      });
    });

    els.clipList.querySelectorAll('.copy-card').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        copyToClipboard(btn.dataset.id);
      });
    });

    els.clipList.querySelectorAll('.pin-card').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePin(btn.dataset.id);
      });
    });

    els.clipList.querySelectorAll('.del-card').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteItem(btn.dataset.id);
      });
    });
  }

  function renderPreview() {
    const selected = items.find((it) => it.id === selectedId);
    if (!selected) {
      els.previewEmpty.hidden = false;
      els.previewBody.hidden = true;
      if (els.previewDrawer.open) els.previewDrawer.close();
      return;
    }
    els.previewEmpty.hidden = true;
    els.previewBody.hidden = false;
    els.previewType.textContent = TYPE_LABELS[selected.type] || '文本';
    els.previewTime.textContent = new Date(selected.copiedAt).toLocaleString('zh-CN');
    els.previewContent.innerHTML = buildPreview(selected);
    els.previewPinBtn.textContent = selected.pinned ? '取消置顶' : '置顶';

    if (els.previewDrawer) {
      els.drawerType.textContent = TYPE_LABELS[selected.type] || '文本';
      els.drawerBody.innerHTML = buildPreview(selected);
      els.drawerPin.textContent = selected.pinned ? '取消置顶' : '置顶';
    }
  }

  function render() {
    renderCategories();
    renderFilterBar();
    renderList();
    renderPreview();
  }

  /* ---------- 剪贴板交互 ---------- */

  async function copyToClipboard(idOrContent) {
    const item = typeof idOrContent === 'string' && idOrContent.length < 50 && items.find((i) => i.id === idOrContent);
    const content = item ? item.content : idOrContent;

    try {
      await navigator.clipboard.writeText(content);
      if (item) {
        item.copiedCount += 1;
        saveItems();
        render();
      }
      showToast('已复制到剪贴板');
    } catch {
      showToast('复制失败，请手动复制');
    }
  }

  async function checkClipboard() {
    if (!monitoring || document.hidden) return;
    if (typeof navigator.clipboard?.readText !== 'function') return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text || text === lastClipboard) return;
      lastClipboard = text;
      upsert(text);
      showToast('检测到新剪贴内容');
    } catch {
      // 没有权限或为空时忽略
    }
  }

  function startMonitoring() {
    if (monitorTimer) return;
    monitorTimer = setInterval(checkClipboard, 1200);
  }

  function stopMonitoring() {
    if (monitorTimer) {
      clearInterval(monitorTimer);
      monitorTimer = null;
    }
  }

  function setMonitoring(active) {
    monitoring = active;
    els.monitorBtn.setAttribute('aria-pressed', String(monitoring));
    els.monitorStatus.textContent = monitoring ? '监听中：页面聚焦时读取剪贴板' : '监听已关闭';
    if (monitoring) {
      checkClipboard();
      startMonitoring();
    } else {
      stopMonitoring();
    }
  }

  /* ---------- UI 反馈 ---------- */

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.toast.classList.remove('show');
    }, 2200);
  }

  function openAddModal() {
    els.addTextarea.value = '';
    els.addModal.showModal();
    setTimeout(() => els.addTextarea.focus(), 0);
  }

  function closeAddModal() {
    els.addModal.close();
  }

  function handleAddSubmit(e) {
    e.preventDefault();
    const value = els.addTextarea.value;
    if (!value) return;
    upsert(value);
    closeAddModal();
    showToast('已添加');
  }

  /* ---------- 事件绑定 ---------- */

  function initEvents() {
    els.addBtn.addEventListener('click', openAddModal);
    els.cancelAdd.addEventListener('click', closeAddModal);
    els.confirmAdd.addEventListener('click', handleAddSubmit);
    els.addModal.addEventListener('close', () => {
      // 防止 form submit 后关闭重复
    });

    els.searchInput.addEventListener('input', (e) => {
      search = e.target.value;
      render();
    });

    els.clearBtn.addEventListener('click', clearAll);

    els.monitorBtn.addEventListener('click', () => {
      setMonitoring(!monitoring);
      showToast(monitoring ? '已开启剪贴板监听' : '已关闭剪贴板监听');
    });

    els.previewCopyBtn.addEventListener('click', () => {
      const selected = items.find((it) => it.id === selectedId);
      if (selected) copyToClipboard(selected.id);
    });

    els.previewPinBtn.addEventListener('click', () => {
      if (selectedId) togglePin(selectedId);
    });

    els.previewDelBtn.addEventListener('click', () => {
      if (selectedId) deleteItem(selectedId);
    });

    if (els.previewDrawer) {
      els.drawerClose.addEventListener('click', () => {
        els.previewDrawer.close();
      });
      els.previewDrawer.addEventListener('click', (e) => {
        if (e.target === els.previewDrawer) els.previewDrawer.close();
      });
      els.drawerCopy.addEventListener('click', () => {
        if (selectedId) copyToClipboard(selectedId);
      });
      els.drawerPin.addEventListener('click', () => {
        if (selectedId) togglePin(selectedId);
      });
      els.drawerDel.addEventListener('click', () => {
        if (selectedId) deleteItem(selectedId);
      });
    }

    window.addEventListener('paste', (e) => {
      if (e.defaultPrevented) return;
      const target = e.target;
      const inInput = target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if (inInput && target !== els.addTextarea) return;

      let handled = false;
      const items = e.clipboardData?.items;
      if (items) {
        for (const clipboardItem of items) {
          if (clipboardItem.kind === 'file' && clipboardItem.type.startsWith('image/')) {
            const blob = clipboardItem.getAsFile();
            if (blob) {
              const url = URL.createObjectURL(blob);
              upsert(url, 'image');
              handled = true;
            }
          }
        }
      }
      const text = e.clipboardData?.getData('text');
      if (text && text.trim()) {
        upsert(text);
        handled = true;
      }
      if (handled) {
        e.preventDefault();
        showToast('已捕获粘贴内容');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.defaultPrevented) return;
      const target = e.target;
      const inInput = target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

      // Ctrl/Cmd + K 聚焦搜索
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        els.searchInput.focus();
        return;
      }

      // Esc 清除搜索或取消选择
      if (e.key === 'Escape') {
        if (els.addModal.open) {
          closeAddModal();
          return;
        }
        if (search) {
          search = '';
          els.searchInput.value = '';
          render();
        } else if (selectedId) {
          selectedId = null;
          render();
        }
        return;
      }

      // 方向键选择
      if (!inInput && ['ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const list = filteredItems();
        if (!list.length) return;
        const idx = list.findIndex((it) => it.id === selectedId);
        let next = idx;
        if (e.key === 'ArrowDown') next = idx < list.length - 1 ? idx + 1 : 0;
        else next = idx > 0 ? idx - 1 : list.length - 1;
        selectedId = list[next].id;
        render();
        const card = els.clipList.querySelector(`[data-id="${selectedId}"]`);
        if (card) card.scrollIntoView({ block: 'nearest' });
        if (window.innerWidth <= 760) {
          els.previewDrawer.showModal();
        }
        return;
      }

      // Enter 复制选中
      if (!inInput && e.key === 'Enter' && selectedId) {
        e.preventDefault();
        copyToClipboard(selectedId);
        return;
      }

      // Delete 删除选中
      if (!inInput && (e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        deleteItem(selectedId);
      }
    });

    window.addEventListener('beforeunload', () => {
      stopMonitoring();
    });
  }

  /* ---------- 启动 ---------- */

  items = loadItems();
  if (!items.length) {
    items = seedItems();
    saveItems();
  }

  // 默认选中第一个
  if (!selectedId && items.length) selectedId = items[0].id;

  initEvents();
  render();
})();
