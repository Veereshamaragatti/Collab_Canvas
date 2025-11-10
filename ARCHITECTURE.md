# Architecture Overview

Data flow

- Client captures pointer events and builds stroke objects: {type:'stroke', mode:'brush'|'eraser', color, size, points[]}
- Client sends 'stroke-start' to server. As drawing continues, client sends 'stroke-points' batches and finally 'stroke-end'.
- Server stores a global ordered operation list in memory and broadcasts events to all clients in the received order.

WebSocket Protocol

- init: server -> client: { operations: [], users: [], you }
- cursor: client -> server -> others: { x, y }
- stroke-start: client -> server -> all: { id, type:'stroke', mode, color, size }
- stroke-points: client -> server -> others: { id, points[] }
- stroke-end: client -> server -> all: { id }
- undo: client -> server -> all: { id }
- redo: client -> server -> all: { op }

Undo/Redo Strategy

- Server maintains ordered operations and an undone stack.
- Undo pops last operation (global) and broadcasts an 'undo' message with the op id. Clients remove that op and redraw.
- Redo pops an operation from undone and re-appends it.

Conflict resolution

- This design uses operation order as the source of truth (last-writer-wins). Overlapping strokes are drawn in chronological order.
- Eraser operations use canvas globalCompositeOperation='destination-out' so replay order matters; undo removes the eraser op which may reveal earlier strokes.

Performance decisions

- Batch points every few samples (client) to reduce messages.
- Clients replay operations instead of trying to patch pixel buffers — simpler and robust for prototype.
