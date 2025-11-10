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
    // always assign a fresh server-side id (do not trust client-supplied ids)
    const serverId = uuidv4();
    const stored = Object.assign({}, op, { id: serverId });
    // preserve client tempId if provided so we can reconcile early messages
    if (op && op.tempId) stored.tempId = op.tempId;
    // ensure points array exists for strokes
    if (stored.type === 'stroke' && !Array.isArray(stored.points)) stored.points = [];
    this.operations.push(stored);
    // new operation invalidates redo stack
    this.undone = [];
    console.log(`[DrawingState] Added operation: id=${serverId}, tempId=${stored.tempId || 'none'}, type=${stored.type}, shape=${stored.shape || 'n/a'}, points=${(stored.points || []).length}`);
    return serverId;
  }

  // append points to an existing stroke operation
  appendPoints(id, points) {
    if (!id || !Array.isArray(points) || points.length === 0) return false;
    // accept either server id or client tempId
    const idx = this.operations.findIndex(o => o.id === id || o.tempId === id);
    if (idx === -1) {
      console.log(`[DrawingState] appendPoints FAILED: id=${id} not found (total ops: ${this.operations.length})`);
      return false;
    }
    const op = this.operations[idx];
    if (!Array.isArray(op.points)) op.points = [];
    const beforeCount = op.points.length;
    op.points.push(...points);
    console.log(`[DrawingState] appendPoints: id=${id}, added ${points.length} points, total now: ${op.points.length} (was ${beforeCount})`);
    return true;
  }

  // merge/update operation metadata (used on stroke-end or shape finalization)
  updateOperation(id, updates) {
    if (!id || !updates) return false;
    const idx = this.operations.findIndex(o => o.id === id || o.tempId === id);
    if (idx === -1) {
      console.log(`[DrawingState] updateOperation FAILED: id=${id} not found`);
      return false;
    }
    this.operations[idx] = Object.assign({}, this.operations[idx], updates);
    console.log(`[DrawingState] updateOperation: id=${id}, updated operation`);
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
    console.log(`[DrawingState] getState called: returning ${this.operations.length} operations`);
    return this.operations.slice();
  }

  clear() {
    console.log(`[DrawingState] clear called: clearing ${this.operations.length} operations`);
    this.operations = [];
    this.undone = [];
  }
}

module.exports = new DrawingState();
