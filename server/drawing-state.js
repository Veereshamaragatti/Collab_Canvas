const { v4: uuidv4 } = require('uuid');

class DrawingState {
  constructor() {
    this.operations = [];
    this.undone = [];
  }

  addOperation(op) {
    const serverId = uuidv4();
    const stored = Object.assign({}, op, { id: serverId });
    if (op?.tempId) stored.tempId = op.tempId;
    if (stored.type === 'stroke' && !Array.isArray(stored.points)) stored.points = [];
    this.operations.push(stored);
    this.undone = [];
    console.log(`[DrawingState] Added operation: id=${serverId}, shape=${stored.shape || stored.type}`);
    return serverId;
  }

  appendPoints(id, points) {
    if (!id || !Array.isArray(points) || !points.length) return false;
    const op = this.operations.find(o => o.id === id || o.tempId === id);
    if (!op) return false;
    op.points = (op.points || []).concat(points);
    return true;
  }

  updateOperation(id, updates) {
    const idx = this.operations.findIndex(o => o.id === id || o.tempId === id);
    if (idx === -1) return false;
    this.operations[idx] = Object.assign({}, this.operations[idx], updates);
    return true;
  }

  undo() {
    if (!this.operations.length) return null;
    const op = this.operations.pop();
    this.undone.push(op);
    return op;
  }

  redo() {
    if (!this.undone.length) return null;
    const op = this.undone.pop();
    this.operations.push(op);
    return op;
  }

  getState() {
    // Commented out spammy log
    // console.log(`[DrawingState] getState called: returning ${this.operations.length} operations`);
    return this.operations.slice();
  }

  clear() {
    console.log(`[DrawingState] clear called: clearing ${this.operations.length} operations`);
    this.operations = [];
    this.undone = [];
  }
}

module.exports = new DrawingState();
