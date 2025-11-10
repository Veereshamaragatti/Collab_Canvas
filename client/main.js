// main glue: hook UI controls to canvas and socket
(function () {
  const toolEl = document.getElementById('tool');
  const colorEl = document.getElementById('color');
  const sizeEl = document.getElementById('size');
  const undoBtn = document.getElementById('undo');
  const redoBtn = document.getElementById('redo');
  const usersEl = document.getElementById('users');

  // simple state wiring
  toolEl.addEventListener('change', (e) => window.CANVAS_STATE.tool = e.target.value);
  colorEl.addEventListener('input', (e) => window.CANVAS_STATE.color = e.target.value);
  sizeEl.addEventListener('input', (e) => window.CANVAS_STATE.size = parseInt(e.target.value, 10));

  undoBtn.addEventListener('click', () => window.socketClient.emit('undo'));
  redoBtn.addEventListener('click', () => window.socketClient.emit('redo'));

  // socket handlers
  const socket = window.socketClient;

  socket.on('init', (payload) => {
    // payload: {operations, users, you}
    window.CanvasAPI.init(payload);
    // populate user list
    usersEl.innerHTML = '';
    payload.users.forEach(u => addOrUpdateUser(u));
  });

  socket.on('user-joined', (u) => addOrUpdateUser(u));
  socket.on('user-left', (d) => removeUser(d.socketId));

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

  function addOrUpdateUser(u) {
    let el = document.querySelector(`#users [data-id="${u.id}"]`);
    if (!el) {
      el = document.createElement('div');
      el.dataset.id = u.id;
      usersEl.appendChild(el);
    }
    el.textContent = u.name;
  }

  function removeUser(socketId) {
    const el = document.querySelector(`#users [data-id="${socketId}"]`);
    if (el) el.remove();
  }

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
