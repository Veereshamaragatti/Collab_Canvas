// canvas drawing logic — uses global socket (window.socketClient)
(function () {
  const canvas = document.getElementById('canvas');
  const cursorsEl = document.getElementById('cursors');
  const ctx = canvas.getContext('2d');

  let w = 800, h = 600;
  function resize() {
    const rect = canvas.getBoundingClientRect();
    // set internal size to display size * devicePixelRatio
    const dpr = window.devicePixelRatio || 1;
    w = rect.width; h = rect.height;
    // set backing store size in pixels
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    // reset transform then scale to avoid cumulative scaling
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redrawAll();
  }

  window.addEventListener('resize', resize);

  // tools state (updated from main.js)
  window.CANVAS_STATE = {
    tool: 'brush',
    color: '#000000',
    size: 4
  };

  // operations store client-side (ordered)
  const operations = [];

  // map of remote in-progress strokes by op id
  const activeStrokes = new Map();

  function redrawAll() {
    // clear
    ctx.clearRect(0, 0, w, h);
    // replay operations
    for (const op of operations) {
      drawOperation(ctx, op, false);
    }
  }

  function drawOperation(ctx, op, isPreview) {
    if (!op) return;
    if (op.type === 'stroke') {
      ctx.save();
      if (op.mode === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = op.color || '#000';
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = op.size || 4;
      const pts = op.points || [];
      if (pts.length === 0) return ctx.restore();
      // single-point strokes: draw a filled circle so a click produces visible ink
      if (pts.length === 1) {
        const p = pts[0];
        const r = (op.size || 4) / 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        if (op.mode === 'eraser') {
          // eraser: clear a small rect centered on the point
          ctx.globalCompositeOperation = 'destination-out';
          ctx.fill();
        } else {
          ctx.fillStyle = op.color || '#000';
          ctx.fill();
        }
        ctx.restore();
        return;
      }
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.restore();
    }
  }

  // apply incoming op (server authoritative order)
  function applyOperation(op) {
    // if it's a start without points, create placeholder
    if (op._removed) {
      // remove by id
      const idx = operations.findIndex(o => o.id === op.id);
      if (idx >= 0) operations.splice(idx, 1);
      redrawAll();
      return;
    }
    const existing = operations.find(o => o.id === op.id);
    if (existing) {
      // merge points
      if (op.points && op.points.length) existing.points.push(...op.points);
    } else {
      operations.push(op);
    }
    redrawAll();
  }

  // remove op by id (undo)
  function removeOpById(id) {
    const idx = operations.findIndex(o => o.id === id);
    if (idx >= 0) operations.splice(idx, 1);
    redrawAll();
  }

  // Expose API for websocket handlers
  window.CanvasAPI = {
    init(state) {
      // load initial operations
      operations.length = 0;
      if (state && state.operations) state.operations.forEach(op => operations.push(op));
      redrawAll();
    },
    onStrokeStart(op) {
      // op with id. If this op references a client tempId, reconcile the local op
      // op may include `tempId` if the client sent one.
      if (op.tempId) {
        const idx = operations.findIndex(o => o.id === op.tempId || o.tempId === op.tempId);
        if (idx !== -1) {
          // update local op's id to server id and remove temp flags
          operations[idx].id = op.id;
          delete operations[idx].tempId;
          delete operations[idx]._local;
          operations[idx].socketId = op.socketId || operations[idx].socketId;
          // ensure points array exists
          operations[idx].points = operations[idx].points || [];
          redrawAll();
          return;
        }
      }
      // otherwise add new op
      operations.push(Object.assign({}, op, { points: op.points || [] }));
      redrawAll();
    },
    onStrokePoints(data) {
      // data: {id, points}
      const op = operations.find(o => o.id === data.id);
      if (op) {
        op.points = op.points.concat(data.points);
      }
      redrawAll();
    },
    onStrokeEnd(data) {
      // no-op for now, operation already added
      redrawAll();
    },
    onUndo(id) {
      removeOpById(id);
    },
    onRedo(op) {
      if (op) operations.push(op);
      redrawAll();
    }
  };

  // local drawing
  let drawing = false;
  let currentOp = null;

  function toCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left), y: (e.clientY - rect.top) };
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    drawing = true;
    const p = toCanvasCoords(e);
    // create a temporary local id so the local op appears in operations immediately
    const tempId = `t-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    currentOp = {
      id: tempId,
      tempId: tempId,
      _local: true,
      type: 'stroke',
      mode: window.CANVAS_STATE.tool === 'eraser' ? 'eraser' : 'brush',
      color: window.CANVAS_STATE.color,
      size: window.CANVAS_STATE.size,
      points: [p],
      // index of last point we sent to server
      _sentIndex: 0
    };
    // insert local op so redrawAll preserves the preview
    operations.push(currentOp);
    // send stroke-start (safe if socket not available); include tempId so server echoes it
    if (window.socketClient) window.socketClient.emit('stroke-start', Object.assign({}, currentOp, { tempId }));
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = toCanvasCoords(e);
  // send cursor (safe if socket not available)
  if (window.socketClient) window.socketClient.emit('cursor', { x: p.x, y: p.y });
    if (!drawing || !currentOp) return;
    currentOp.points.push(p);
    // operations already contains currentOp (with temp id) so redraw to include new point
    redrawAll();
    // batch points to server every N points
    const BATCH = 5;
    if (currentOp.points.length - currentOp._sentIndex >= BATCH) {
      // send only the new points since last send
      const pts = currentOp.points.slice(currentOp._sentIndex, currentOp.points.length);
      if (window.socketClient) window.socketClient.emit('stroke-points', { id: currentOp.id, points: pts });
      currentOp._sentIndex = currentOp.points.length;
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!drawing) return;
    drawing = false;
    // finalize: send remaining points and stroke-end
    if (currentOp.points.length > currentOp._sentIndex && window.socketClient) {
      const pts = currentOp.points.slice(currentOp._sentIndex);
      window.socketClient.emit('stroke-points', { id: currentOp.id, points: pts });
    }
    if (window.socketClient) window.socketClient.emit('stroke-end', { id: currentOp.id });
    currentOp = null;
  });

  // cursors management: render other users
  const cursors = new Map();
  function updateCursor(socketId, x, y, name, color) {
    let el = cursors.get(socketId);
    if (!el) {
      el = document.createElement('div');
      el.className = 'cursor';
      el.innerHTML = `<div class="dot"></div><div class="label"></div>`;
      cursorsEl.appendChild(el);
      cursors.set(socketId, el);
    }
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.querySelector('.label').textContent = name || socketId.slice(0,4);
    el.querySelector('.dot').style.background = color || '#000';
  }

  window.CanvasUI = { updateCursor, resize };

  // initial resize
  setTimeout(resize, 50);
})();
