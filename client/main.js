// main glue: hook UI controls to canvas and socket
(function () {
  const toolEl = document.getElementById('tool');
  const colorEl = document.getElementById('color');
  const sizeEl = document.getElementById('size');
  const themeToggle = document.getElementById('theme-toggle');
  const undoBtn = document.getElementById('undo');
  const redoBtn = document.getElementById('redo');
  const usersEl = document.getElementById('users');
  const onlineNumEl = document.getElementById('online-num');
  const onlineBadgeEl = document.getElementById('online-num-badge');
  const toastsEl = document.getElementById('toasts');
  const userInfoEl = document.getElementById('user-info');

  // users map for quick lookup
  const usersMap = new Map();

  // simple state wiring
  toolEl.addEventListener('change', (e) => window.CANVAS_STATE.tool = e.target.value);
  // reflect cursor on tool change
  toolEl.addEventListener('change', (e) => {
    const c = document.getElementById('canvas');
    if (!c) return;
    const t = e.target.value;
    if (t === 'pan') c.style.cursor = 'grab';
    else if (t === 'eraser') c.style.cursor = 'crosshair';
    else if (t === 'pointer') c.style.cursor = 'default';
    else c.style.cursor = 'crosshair';
  });
  colorEl.addEventListener('input', (e) => window.CANVAS_STATE.color = e.target.value);
  sizeEl.addEventListener('input', (e) => window.CANVAS_STATE.size = parseInt(e.target.value, 10));

  // theme toggle with persistence
  if (themeToggle) {
    // apply saved theme; default to dark when no saved preference
    const saved = localStorage.getItem('collab:theme');
    if (saved) {
      document.body.setAttribute('data-theme', saved);
    } else {
      // default to dark mode
      document.body.setAttribute('data-theme', 'dark');
      localStorage.setItem('collab:theme', 'dark');
    }
    themeToggle.addEventListener('click', () => {
      const cur = document.body.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      if (next === 'light') document.body.removeAttribute('data-theme'); else document.body.setAttribute('data-theme', next);
      localStorage.setItem('collab:theme', next);
    });
  }

  // toolbar buttons (left vertical palette)
  const tb = document.getElementById('toolbar');
  const imgUpload = document.getElementById('image-upload');
  if (tb) {
    // mark active based on initial tool
    const initial = window.CANVAS_STATE && window.CANVAS_STATE.tool;
    if (initial) {
      const b = tb.querySelector(`.tb-btn[data-tool="${initial}"]`);
      if (b) b.classList.add('active');
    }
    tb.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.tb-btn');
      if (!btn) return;
      const t = btn.dataset.tool;
      // toggle pan
      if (t === 'pan') {
        // set tool to pan
        window.CANVAS_STATE.tool = 'pan';
      } else if (t === 'image') {
        // trigger file input
        if (imgUpload) imgUpload.click();
        window.CANVAS_STATE.tool = 'image';
      } else {
        window.CANVAS_STATE.tool = t;
      }
      // reflect active button
      tb.querySelectorAll('.tb-btn').forEach(b => b.classList.toggle('active', b === btn));
      // update cursor
      const c = document.getElementById('canvas');
      if (c) {
        if (window.CANVAS_STATE.tool === 'pan') c.style.cursor = 'grab';
        else if (window.CANVAS_STATE.tool === 'eraser') c.style.cursor = 'crosshair';
        else if (window.CANVAS_STATE.tool === 'pointer') c.style.cursor = 'default';
        else c.style.cursor = 'crosshair';
      }
      // also set select dropdown if exists
      if (toolEl) toolEl.value = window.CANVAS_STATE.tool;
    });
    if (imgUpload) {
      imgUpload.addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          // send image as dataURL to canvas via CanvasAPI
          if (window.CanvasAPI && window.CanvasAPI.insertImage) window.CanvasAPI.insertImage(reader.result);
        };
        reader.readAsDataURL(f);
      });
    }
  }

  undoBtn.addEventListener('click', () => window.socketClient.emit('undo'));
  redoBtn.addEventListener('click', () => window.socketClient.emit('redo'));
  // add clear button dynamically next to redo
  (function addClearButton() {
    const clearBtn = document.createElement('button');
    clearBtn.id = 'clear';
    clearBtn.className = 'icon-btn';
    clearBtn.title = 'Clear Canvas';
    clearBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6h18" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><path d="M8 6v12a2 2 0 002 2h4a2 2 0 002-2V6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><path d="M10 11v6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><path d="M14 11v6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
    clearBtn.addEventListener('click', () => {
      if (!confirm('Clear the canvas for everyone?')) return;
      window.socketClient.emit('clear');
    });
    if (redoBtn && redoBtn.parentNode) redoBtn.parentNode.insertBefore(clearBtn, redoBtn.nextSibling);
  })();

  // socket handlers
  const socket = window.socketClient;

  socket.on('init', (payload) => {
    // payload: {operations, users, you}
    // If there are no other users connected, start with a clear canvas for a clean default.
    usersEl.innerHTML = '';
    usersMap.clear();
    payload.users.forEach(u => usersMap.set(u.id, u));
    renderUsers();
    // If only this user is present, prefer a clean canvas rather than replaying old operations
    if (!payload.users || payload.users.length <= 1) {
      if (window.CanvasAPI && window.CanvasAPI.onClear) {
        window.CanvasAPI.onClear();
      } else if (window.CanvasAPI && window.CanvasAPI.init) {
        // fallback: initialize with empty operations
        window.CanvasAPI.init({ operations: [] });
      }
    } else {
      // multiple users — load shared state
      window.CanvasAPI.init(payload);
    }
  });

  socket.on('user-joined', (u) => {
    addOrUpdateUser(u);
    showToast(`${u.name} joined`);
  });
  socket.on('user-left', (d) => {
    removeUser(d.socketId);
    showToast(`A user left`);
  });

  socket.on('cursor', (d) => {
    // d: {socketId, x, y}
    window.CanvasUI.updateCursor(d.socketId, d.x, d.y, d.name || d.socketId.slice(0,4), d.color);
  });

  socket.on('stroke-start', (op) => {
    // server assigned id available
    window.CanvasAPI.onStrokeStart(op);
  });

  socket.on('stroke-points', (data) => window.CanvasAPI.onStrokePoints(data));
  socket.on('stroke-end', (data) => window.CanvasAPI.onStrokeEnd(data));

  socket.on('undo', (data) => window.CanvasAPI.onUndo(data.id));
  socket.on('redo', (data) => window.CanvasAPI.onRedo(data.op));
  socket.on('clear', () => window.CanvasAPI.onClear && window.CanvasAPI.onClear());

  function addOrUpdateUser(u) {
    usersMap.set(u.id, u);
    renderUsers();
  }

  function removeUser(socketId) {
    usersMap.delete(socketId);
    renderUsers();
  }

  function renderUsers() {
    usersEl.innerHTML = '';
    for (const [id, u] of usersMap) {
      const el = document.createElement('div');
      el.className = 'user-pill';
      el.dataset.id = id;
      el.innerHTML = `<span class="user-dot" style="background:${u.color}"></span><span class="user-name">${u.name}</span>`;
      usersEl.appendChild(el);
    }
    const cnt = usersMap.size;
    if (onlineNumEl) onlineNumEl.textContent = cnt;
    if (onlineBadgeEl) onlineBadgeEl.textContent = cnt;
    // By default (only this user connected) keep the page clear — hide user list and badge
    const showUI = cnt > 1;
    if (usersEl) usersEl.style.display = showUI ? 'flex' : 'none';
    if (userInfoEl) userInfoEl.style.display = showUI ? 'block' : 'none';
    if (onlineBadgeEl && onlineBadgeEl.parentElement) onlineBadgeEl.parentElement.style.display = showUI ? 'flex' : 'none';
  }

  function showToast(text) {
    if (!toastsEl) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    toastsEl.appendChild(t);
    // animate in, then out
    requestAnimationFrame(() => t.classList.add('visible'));
    setTimeout(() => t.classList.remove('visible'), 2500);
    setTimeout(() => t.remove(), 3000);
  }

  // (removeUser handled above)

  // keyboard undo/redo
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault(); window.socketClient.emit('undo');
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
      e.preventDefault(); window.socketClient.emit('redo');
    }
  });
})();
