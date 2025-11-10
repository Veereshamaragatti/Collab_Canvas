const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const drawingState = require('./drawing-state');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'client')));

// Optional clear route for debugging
app.get('/clear', (req, res) => {
  try {
    drawingState.clear();
    io.emit('clear');
    console.log('🧹 Canvas cleared via /clear endpoint');
    return res.json({ ok: true });
  } catch (err) {
    console.error('Error clearing canvas', err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

// Track connected users
const users = new Map(); // socketId -> {id, name, color}

io.on('connection', (socket) => {
  console.log('🟢 socket connected:', socket.id);

  const user = {
    id: socket.id,
    name: `User-${socket.id.slice(0, 4)}`,
    color: generateColor(socket.id)
  };
  users.set(socket.id, user);

  // Send initial state
  socket.emit('init', {
    operations: drawingState.getState(),
    users: Array.from(users.values()),
    you: user
  });

  // Notify others
  socket.broadcast.emit('user-joined', user);

  // 🖱️ Cursor position updates
  socket.on('cursor', (payload) => {
    socket.broadcast.emit('cursor', { socketId: socket.id, ...payload });
  });

  // ✏️ Stroke start
  socket.on('stroke-start', (op) => {
    const base = Object.assign({}, op, { socketId: socket.id });
    const id = drawingState.addOperation(base);
    console.log(`[Server] stroke-start: assigned id=${id}`);
    io.emit('stroke-start', { ...base, id });
  });

  // 🌀 Stroke points (live drawing)
  socket.on('stroke-points', (data) => {
    if (data?.id && Array.isArray(data.points) && data.points.length) {
      drawingState.appendPoints(data.id, data.points);
    }
    socket.broadcast.emit('stroke-points', { socketId: socket.id, ...data });
  });

  // ✅ Stroke end → finalize + auto-sync to everyone
  socket.on('stroke-end', (data) => {
    if (data?.id) drawingState.updateOperation(data.id, data);
    io.emit('stroke-end', { socketId: socket.id, ...data });
    io.emit('sync', { operations: drawingState.getState() }); // 🔄 keep all clients synced
  });

  // ↩️ Undo
  socket.on('undo', () => {
    const op = drawingState.undo();
    if (op) {
      io.emit('undo', { id: op.id });
      io.emit('sync', { operations: drawingState.getState() });
    }
  });

  // ↪️ Redo
  socket.on('redo', () => {
    const op = drawingState.redo();
    if (op) {
      io.emit('redo', { op });
      io.emit('sync', { operations: drawingState.getState() });
    }
  });

  // 🧹 Clear canvas
  socket.on('clear', () => {
    drawingState.clear();
    io.emit('clear');
    io.emit('sync', { operations: drawingState.getState() });
  });

  // 🧩 Manual sync request (optional)
  socket.on('request-sync', () => {
    socket.emit('sync', { operations: drawingState.getState() });
  });

  // ❌ Disconnect
  socket.on('disconnect', () => {
    console.log('🔴 disconnect', socket.id);
    users.delete(socket.id);
    socket.broadcast.emit('user-left', { socketId: socket.id });
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} already in use.`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});

// 🎨 Generate a color based on socket id
function generateColor(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) % 360;
  }
  return `hsl(${h},70%,50%)`;
}
