// websocket client wrapper
// Attach socket to window so non-module scripts can use it.
let socket = null;
if (typeof io === 'function') {
  try {
    socket = io();
  } catch (err) {
    console.warn('socket.io client failed to initialize:', err);
    socket = null;
  }
} else {
  console.warn('socket.io client library not found on page.');
}

window.socketClient = socket;

// simple event forwarder/handler registry (safe if socket is null)
const WS = {
  on: (ev, cb) => socket && socket.on(ev, cb),
  emit: (ev, data) => socket && socket.emit(ev, data)
};

window.WS = WS;
