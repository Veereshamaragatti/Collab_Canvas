// Simple drawing state manager for global operations and undo/redo
const { v4: uuidv4 } = require('uuid');

class DrawingState {
  constructor() {
    // operations: array of {id, userId, type: 'stroke'|'erase', data}
    this.operations = [];
    // undone operations stack for redo
    this.undone = [];
  }

  addOperation(op) {
    // ensure op has id
    if (!op.id) op.id = uuidv4();
    // ensure points array exists for strokes
    if (op.type === 'stroke' && !Array.isArray(op.points)) op.points = [];
    this.operations.push(op);
    // new operation invalidates redo stack
    this.undone = [];
    return op.id;
  }

  // append points to an existing stroke operation
  appendPoints(id, points) {
    if (!id || !Array.isArray(points) || points.length === 0) return false;
    const idx = this.operations.findIndex(o => o.id === id);
    if (idx === -1) return false;
    const op = this.operations[idx];
    if (!Array.isArray(op.points)) op.points = [];
    op.points.push(...points);
    return true;
  }

  // merge/update operation metadata (used on stroke-end or shape finalization)
  updateOperation(id, updates) {
    if (!id || !updates) return false;
    const idx = this.operations.findIndex(o => o.id === id || o.tempId === id);
    if (idx === -1) return false;
    this.operations[idx] = Object.assign({}, this.operations[idx], updates);
    return true;
  }

  undo() {
    if (this.operations.length === 0) return null;
    const op = this.operations.pop();
    this.undone.push(op);
    return op;
  }

  redo() {
    if (this.undone.length === 0) return null;
    const op = this.undone.pop();
    this.operations.push(op);
    return op;
  }

  getState() {
    return this.operations.slice();
  }

  clear() {
    this.operations = [];
    this.undone = [];
  }
}

module.exports = new DrawingState();
