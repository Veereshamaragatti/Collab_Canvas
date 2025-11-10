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
    if (op.type === 'shape') {
      ctx.save();
      const s = op.shape;
      const p = op.props || {};
      ctx.lineWidth = op.size || 2;
      ctx.strokeStyle = op.color || '#000';
      ctx.fillStyle = op.color || '#000';
      if (s === 'line' || s === 'arrow') {
        ctx.beginPath();
        ctx.moveTo(p.x1, p.y1);
        ctx.lineTo(p.x2, p.y2);
        ctx.stroke();
        if (s === 'arrow') {
          // simple arrow head
          const dx = p.x2 - p.x1; const dy = p.y2 - p.y1; const ang = Math.atan2(dy, dx);
          const len = 10;
          ctx.beginPath();
          ctx.moveTo(p.x2, p.y2);
          ctx.lineTo(p.x2 - len * Math.cos(ang - Math.PI / 6), p.y2 - len * Math.sin(ang - Math.PI / 6));
          ctx.lineTo(p.x2 - len * Math.cos(ang + Math.PI / 6), p.y2 - len * Math.sin(ang + Math.PI / 6));
          ctx.closePath();
          ctx.fill();
        }
      } else if (s === 'rect') {
        const x = Math.min(p.x1, p.x2); const y = Math.min(p.y1, p.y2);
        const w = Math.abs(p.x2 - p.x1); const h = Math.abs(p.y2 - p.y1);
        ctx.strokeRect(x, y, w, h);
      } else if (s === 'ellipse') {
        const cx = (p.x1 + p.x2) / 2; const cy = (p.y1 + p.y2) / 2;
        const rx = Math.abs(p.x2 - p.x1) / 2; const ry = Math.abs(p.y2 - p.y1) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (s === 'text') {
        ctx.font = `${(op.size||14)}px sans-serif`;
        ctx.fillText(p.text || '', p.x, p.y);
      } else if (s === 'image') {
        if (op._img) {
          ctx.drawImage(op._img, p.x, p.y, p.w, p.h);
        } else if (p.src) {
          const img = new Image(); img.src = p.src; img.onload = () => { op._img = img; redrawAll(); };
        }
      }
      ctx.restore();
      return;
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
      // merge points or props
      if (op.points && op.points.length) existing.points.push(...op.points);
      if (op.props) existing.props = Object.assign({}, existing.props || {}, op.props);
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
      // for shape finalization: merge final props if present
      if (data && data.id) {
        const idx = operations.findIndex(o => o.id === data.id || o.tempId === data.tempId);
        if (idx !== -1) {
          // merge fields
          operations[idx] = Object.assign({}, operations[idx], data);
          redrawAll();
          return;
        }
      }
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

  // helper to insert image (dataURL) from file input
  window.CanvasAPI.insertImage = function(dataUrl) {
    const tempId = `t-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    // place center
    const x = w / 2 - 100, y = h / 2 - 75;
    const op = { id: tempId, tempId, _local: true, type: 'shape', shape: 'image', props: { x, y, w: 200, h: 150, src: dataUrl } };
    operations.push(op);
    redrawAll();
    if (window.socketClient) window.socketClient.emit('stroke-start', op);
    if (window.socketClient) window.socketClient.emit('stroke-end', op);
  };

  // handle clear event from server
  window.CanvasAPI.onClear = function() {
    operations.length = 0;
    redrawAll();
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
    const tool = window.CANVAS_STATE.tool || 'brush';
    const p = toCanvasCoords(e);
    // create a temporary local id so the local op appears in operations immediately
    const tempId = `t-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    // brush/eraser
    if (tool === 'brush' || tool === 'eraser') {
      drawing = true;
      currentOp = {
        id: tempId,
        tempId: tempId,
        _local: true,
        type: 'stroke',
        mode: tool === 'eraser' ? 'eraser' : 'brush',
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
      return;
    }

    // text: immediate prompt
    if (tool === 'text') {
      const txt = prompt('Enter text:');
      if (!txt) return;
      const op = { id: tempId, tempId, _local: true, type: 'shape', shape: 'text', props: { x: p.x, y: p.y, text: txt }, color: window.CANVAS_STATE.color, size: window.CANVAS_STATE.size };
      operations.push(op);
      redrawAll();
      if (window.socketClient) window.socketClient.emit('stroke-start', op);
      if (window.socketClient) window.socketClient.emit('stroke-end', op);
      return;
    }

    // image placement handled by insertImage via file input; clicking does nothing here
    if (tool === 'image') return;

    // pan/pointer do not draw in this prototype
    if (tool === 'pan' || tool === 'pointer') return;

    // shape tools (line, rect, ellipse, arrow)
    if (['line', 'rect', 'ellipse', 'arrow'].includes(tool)) {
      currentOp = {
        id: tempId,
        tempId: tempId,
        _local: true,
        type: 'shape',
        shape: tool,
        props: { x1: p.x, y1: p.y, x2: p.x, y2: p.y },
        color: window.CANVAS_STATE.color,
        size: window.CANVAS_STATE.size
      };
      operations.push(currentOp);
      if (window.socketClient) window.socketClient.emit('stroke-start', currentOp);
      return;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = toCanvasCoords(e);
    // send cursor (safe if socket not available)
    if (window.socketClient) window.socketClient.emit('cursor', { x: p.x, y: p.y });
    if (!currentOp) return;
    const tool = window.CANVAS_STATE.tool || 'brush';
    if (drawing && currentOp.type === 'stroke') {
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
      return;
    }
    // update shape preview
    if (currentOp && currentOp.type === 'shape') {
      currentOp.props.x2 = p.x; currentOp.props.y2 = p.y;
      redrawAll();
      return;
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    const tool = window.CANVAS_STATE.tool || 'brush';
    if (drawing && currentOp && currentOp.type === 'stroke') {
      drawing = false;
      // finalize: send remaining points and stroke-end
      if (currentOp.points.length > currentOp._sentIndex && window.socketClient) {
        const pts = currentOp.points.slice(currentOp._sentIndex);
        window.socketClient.emit('stroke-points', { id: currentOp.id, points: pts });
      }
      if (window.socketClient) window.socketClient.emit('stroke-end', { id: currentOp.id });
      currentOp = null;
      return;
    }
    // finalize shape
    if (currentOp && currentOp.type === 'shape') {
      if (window.socketClient) {
        window.socketClient.emit('stroke-end', currentOp);
      }
      currentOp = null;
      return;
    }
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
