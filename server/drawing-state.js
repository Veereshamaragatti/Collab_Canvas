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
    this.operations.push(op);
    // new operation invalidates redo stack
    this.undone = [];
    return op.id;
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
}

module.exports = new DrawingState();
