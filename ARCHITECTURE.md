# Architecture Overview

This document explains the design, data flow and protocol used by the Collaborative Canvas prototype. It is intended to make the implementation decisions explicit so you can reason about correctness, performance and how to extend the system.

## High level components

- Client (browser): captures pointer events, renders the HTML5 Canvas, shows cursors and UI, and communicates with the server via WebSockets (Socket.io).
- Server (Node.js + Socket.io): serves static client files, maintains an in-memory ordered operations list (the authoritative history), coordinates broadcasts and handles undo/redo.
- (Optional) Persistence layer: not present in the prototype — can be added to persist operations to disk or database for session recovery.

## Data model

- Operation (single unit in server history):

	{
		id: string,         // server-assigned opaque id
		type: 'stroke',     // currently only 'stroke' supported (future: shape, image)
		mode: 'brush'|'eraser',
		color: string,      // hex or CSS color
		size: number,       // stroke width in px
		points: [{x:number,y:number}, ...], // ordered sample points for the stroke
		userId?: string,    // optional origin user id
		timestamp?: number  // server-received time
	}

Notes:
- Clients may create a temporary `tempId` for optimistic local rendering; the server replies with the authoritative `id` and the client reconciles the local object.

## Data flow (detailed)

1. Client pointerdown -> client creates a local stroke op with a `tempId`, inserts it into the local operations list and renders it immediately (optimistic UI).
2. Client emits `stroke-start` (includes `tempId`, style metadata but minimal/no points).
3. While drawing, client accumulates points and periodically emits `stroke-points` (batches) containing the `id` (or `tempId`) and a small array of new points.
4. On pointerup the client sends a final `stroke-points` for remaining points and `stroke-end` to indicate completion.
5. Server receives events in the order they arrive, assigns/retains a server `id` for the operation (if needed), appends/merges point batches into the authoritative operation in memory and broadcasts events to all connected clients (including the origin) so each client can update/replay.
6. Clients receive server broadcasts and update or reconcile local operations (e.g. map `tempId` -> server `id`, merge incoming point batches into the correct op) then redraw the canvas by replaying operations in order.

This flow balances responsiveness (local optimistic drawing) with a single server-ordered history that keeps all clients consistent.

## WebSocket message protocol

All messages are JSON objects sent over Socket.io. Key messages used in the prototype:

- `init` (server -> client): initial state when a client connects

	{
		operations: [Operation,...],
		users: [{id,name,color}, ...],
		you: {id,name,color}
	}

- `cursor` (client -> server -> others): pointer location for live cursors

	{ x: number, y: number }

- `stroke-start` (client -> server -> all): begins a new operation. Client may include `tempId`.

	{ tempId?: string, type: 'stroke', mode, color, size, userId? }

- `stroke-points` (client -> server -> others): batched points for an operation

	{ id?: string, tempId?: string, points: [{x,y}, ...] }

- `stroke-end` (client -> server -> all): indicates stroke finished

	{ id?: string, tempId?: string }

- `undo` / `redo` (client -> server -> all): global undo/redo commands

	{ }

- `undo` broadcast (server -> all): informs clients which op id was removed

	{ id: string }

Notes on `id` vs `tempId`:
- Clients may send `tempId` when the server id is not known yet. The server should echo the `tempId` back in its `stroke-start` broadcasts so clients can reconcile.

## Undo / redo strategy (global)

- Server maintains two stacks:
	- `operations[]` — authoritative ordered list of operations (bottom = oldest).
	- `undone[]` — stack of operations popped by undo for redo.

- Undo: server pops the last operation from `operations` and pushes it onto `undone`, then broadcasts `{ type: 'undo', id }`. Clients remove that op from their local list and redraw.
- Redo: server pops the last op from `undone`, appends it to `operations`, and broadcasts `{ type: 'redo', op }` so clients append and redraw.

Notes / Limitations:
- This is global undo: it undoes the last operation regardless of which user created it. More granular/per-user undo requires a different model (e.g., per-user stacks, operational transforms, or CRDT approaches) and careful conflict resolution.

## Conflict resolution and determinism

- The server's ordered `operations[]` is the source of truth. Clients replay operations in the exact sequence provided by the server to ensure deterministic rendering.
- Overlapping operations (concurrent strokes) are resolved by order: later operations are rendered on top. The eraser uses `globalCompositeOperation = 'destination-out'` so erasing is implemented as a separate op applied in sequence.

Edge cases:
- If a client disconnects mid-stroke, the server may keep partial points already received. The client can reconnect and receive the authoritative state via `init` (but partial strokes without final `stroke-end` may look incomplete).

## Performance and optimization decisions

- Batching: clients batch recorded points (e.g., every N samples) to reduce message frequency and network overhead.
- Replay rendering: clients redraw by replaying `operations[]`. This is simple and correct; for very long histories you may implement snapshotting (periodic flattened bitmaps) to avoid replaying an unbounded list.
- Throttling / sampling: clients can down-sample high-frequency pointer events before batching to reduce payload size.

## Scaling & persistence

- Current prototype stores everything in memory — this is fine for small demos but not for production.
- To scale:
	- Persist operations to a database (append-only) and implement paging or snapshot snapshots.
	- Use a clustered server architecture with a shared state (Redis or database) or use sticky sessions and partition rooms.
	- Consider work queues or a stateful microservice per room for high-traffic rooms.

## Security & deployment notes

- The prototype is minimal and lacks authentication. For production, authenticate users before allowing write operations and associate operations with user ids.
- Configure CORS, secure WebSocket endpoints (wss://), and validate incoming messages (shapes, sizes, lengths) on the server to avoid memory exhaustion.
- Deployment: the provided `render.yaml` config supports deploying to Render as a Node web service. The server uses `process.env.PORT` so hosting platforms that set PORT will work out of the box.

## Extensions and next steps

- Per-room isolation: add a `roomId` so multiple separate canvases can exist.
- Persistence: save operations periodically and snapshot canvases to speed up client joins.
- Conflict-free undo: explore CRDT designs or operation transforms for per-user undo and stronger offline support.
- Smoothing: implement stroke smoothing (bezier or catmull-rom) client-side before sending points to reduce bandwidth and improve visual fidelity.

## Quick diagram (text)

- Client A -> stroke-start -> Server -> broadcast stroke-start -> Client B
- Client A -> stroke-points(batch) -> Server (append points) -> broadcast stroke-points -> Client B
- Server maintains ordered operations[]; clients replay operations[] to render.

This file should be updated as the system grows (rooms, persistence, auth). The current design prioritizes simplicity, determinism and a clear single source of truth for teaching and prototyping collaboration strategies.
