# Collaborative Canvas

Simple collaborative drawing demo using vanilla JS, HTML5 Canvas and Node.js + Socket.io.

Setup

1. Install dependencies:

   npm install

2. Start server:

   npm start

3. Open two browser windows to http://localhost:3000 and draw. You should see cursors and strokes in real-time.

Known limitations

- Very simple batching and stroke model. Not production-grade.
- Undo/redo is global and simple: it pops last stored operation. It does not attempt to undo per-user granular edits.
- No persistence; server state is in-memory only.

Time spent: ~2 hours (prototype)

Deploying to Render (quick)

- Create a GitHub repository and push this project to it. If you haven't already:

   ```powershell
   git init
   git add .
   git commit -m "Initial collaborative canvas prototype"
   git branch -M main
   git remote add origin https://github.com/<your-org-or-username>/<repo-name>.git
   git push -u origin main
   ```

- In Render dashboard: New -> Web Service
   - Connect your GitHub repo.
   - Service type: Web Service
   - Build command: `npm install`
   - Start command: `npm start`
   - Branch: `main` (or whichever branch you pushed)

- Alternatively, you can include the provided `render.yaml` (in the repo root) and Render will read configuration automatically.

Notes & tips

- The server uses the PORT environment variable so Render's assigned port will work automatically.
- Socket.io client connects to the same origin (uses `io()`), so WebSocket traffic will be handled by the same service.
- If you want to expose the app over a custom domain, configure it in Render's settings for your service.

Troubleshooting

- If sockets don't connect after deploy, open the Render service logs and the browser console. Make sure requests to `/socket.io/` are returning 101 Switching Protocols and that the server logs no bind errors.
- If the app fails to start, ensure `npm start` runs the server (`package.json` already has `start: node server/server.js`).

