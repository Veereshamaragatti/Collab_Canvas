const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const drawingState = require('./drawing-state');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '..', 'client')));

// convenience route to clear the shared canvas (useful for dev/testing)
app.get('/clear', (req, res) => {
  try {
    drawingState.clear();
    io.emit('clear');
    console.log('Canvas cleared via /clear endpoint');
    return res.json({ ok: true, cleared: true });
  } catch (err) {
    console.error('Error clearing canvas', err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

// simple user tracking
const users = new Map(); // socketId -> {id, name, color}

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  // create a lightweight user object
  const user = {
    id: socket.id,
    name: `User-${socket.id.slice(0,4)}`,
    color: generateColor(socket.id)
  };
  users.set(socket.id, user);

  // send initial state and user list
  socket.emit('init', {
    operations: drawingState.getState(),
    users: Array.from(users.values()),
    you: user
  });

  socket.broadcast.emit('user-joined', user);

  // handle cursor updates
  socket.on('cursor', (payload) => {
    // broadcast to others
    socket.broadcast.emit('cursor', { socketId: socket.id, ...payload });
  });

  // stroke lifecycle: 'stroke-start', 'stroke-points', 'stroke-end'
  socket.on('stroke-start', (op) => {
    // op: {userId, meta}
    // create and store the operation header
    const base = Object.assign({}, op, { socketId: socket.id });
    const id = drawingState.addOperation(base);
    console.log(`[Server] stroke-start: assigned id=${id}, tempId=${op.tempId}, broadcasting to all clients`);
    // broadcast with assigned id
    io.emit('stroke-start', { ...base, id });
  });

  socket.on('stroke-points', (data) => {
    // data: {id, points}
    // persist points into server state so history is complete
    console.log(`[Server] stroke-points received: id=${data.id}, points count=${data.points ? data.points.length : 0}`);
    try {
      if (data && data.id && Array.isArray(data.points) && data.points.length) {
        const success = drawingState.appendPoints(data.id, data.points);
        if (!success) {
          console.error(`[Server] Failed to append points for id=${data.id} - operation not found in state`);
        }
      }
    } catch (err) {
      console.error('Error appending points', err);
    }
    // forward to others
    socket.broadcast.emit('stroke-points', { socketId: socket.id, ...data });
  });

  socket.on('clear', () => {
    drawingState.clear();
    io.emit('clear');
  });

  socket.on('request-sync', () => {
    // Client requesting full state sync (auto-refresh mechanism)
    socket.emit('sync', { operations: drawingState.getState() });
  });

  socket.on('stroke-end', (data) => {
    // finalize: contains id and final meta
    console.log(`[Server] stroke-end received: id=${data.id}`);
    try {
      if (data && data.id) {
        const success = drawingState.updateOperation(data.id, data);
        if (!success) {
          console.error(`[Server] Failed to update operation id=${data.id} - not found in state`);
        }
      }
    } catch (err) {
      console.error('Error finalizing operation', err);
    }
    io.emit('stroke-end', { socketId: socket.id, ...data });
  });

  socket.on('undo', () => {
    const op = drawingState.undo();
    if (op) {
      io.emit('undo', { id: op.id });
    }
  });

  socket.on('redo', () => {
    const op = drawingState.redo();
    if (op) {
      io.emit('redo', { op });
    }
  });

  socket.on('disconnect', () => {
    console.log('disconnect', socket.id);
    users.delete(socket.id);
    socket.broadcast.emit('user-left', { socketId: socket.id });
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use!`);
    console.error(`To fix this, either:`);
    console.error(`  1. Stop the process using port ${PORT} (check with: netstat -aon | findstr :${PORT})`);
    console.error(`  2. Or run with a different port: $env:PORT=4000; node server/server.js\n`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

function generateColor(seed) {
  // pseudo-random color from string
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `hsl(${h},70%,50%)`;
}
