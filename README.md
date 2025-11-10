# Collaborative Canvas

Vanilla JavaScript collaborative drawing demo using HTML5 Canvas and a Node.js + Socket.io backend. This is a lightweight prototype demonstrating real-time synchronized drawing, cursors, and a simple global undo/redo mechanism.

---

## Quick start (development)

1. Install dependencies

```powershell
npm install
```

2. Run the server locally

```powershell
npm start
# server listens on PORT (default 3000)
```

3. Open the app

* Open one or more browser tabs/windows at: [http://localhost:3000](http://localhost:3000)
* Draw with mouse or touch (pointer events supported). You should see other users' cursors and strokes in real-time.

---

## How to test with multiple users

* Multiple tabs: open several tabs or windows in the same browser — each creates a separate user socket.
* Multiple browsers: open the app in different browsers (Chrome, Firefox, Edge) or a Private/Incognito window to simulate another user.
* Other devices on your LAN:

  1. Find your machine local IP (PowerShell):

     ```powershell
     ipconfig
     ```

     Look for the IPv4 address (e.g. `192.168.1.42`).
  2. Start the server and open on another device:
     http://<YOUR_IP>:3000 (e.g. [http://192.168.1.42:3000](http://192.168.1.42:3000))
  3. If the page doesn't load, check Windows Firewall — allow Node or port 3000 temporarily for testing.
* Remote testing (share publicly): use a tunnel like ngrok:

  ```powershell
  ngrok http 3000
  ```

  Then open the generated ngrok URL on other devices.

---

## Controls & shortcuts

* Tool: choose Brush or Eraser
* Color: native color picker
* Size: range slider (brush width)
* Undo / Redo: use the buttons or keyboard shortcuts

  * Undo: Ctrl/Cmd + Z
  * Redo: Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z

---

## Deployment (Render)

1. Push this repo to GitHub (or use an existing remote)

```powershell
git init
git add .
git commit -m "Initial collaborative canvas prototype"
git branch -M main
git remote add origin https://github.com/Veereshamaragatti/Collab_Canvas.git
git push -u origin main
```

2. Create a new Web Service on Render and connect the repository.

* Build command: `npm install`
* Start command: `npm start`
* Branch: `main` (or your chosen branch)

3. (Optional) Keep the included `render.yaml` for automatic configuration.

Notes:

* The server reads `process.env.PORT` so Render's assigned port works automatically.
* Socket.io is served from the same Express app; the client loads `/socket.io/socket.io.js` so no extra WebSocket host config is required.

---

## Demo link

* Live demo: (add your deployed URL here after deploying to Render or another host)

Example: `collab-canvas-rakw.onrender.com`

---

## 🎥 Demo Video

You can watch the working demo of **Collaborative Canvas** here:

👉 [**Watch Demo on Google Drive**](https://drive.google.com/file/d/1L8f-7ttuTOq-D_OfP89z02_Jmf6GAF4N/view?usp=sharing)

Or click the preview badge below:

[![Collaborative Canvas Demo](https://img.shields.io/badge/%E2%96%B6%EF%B8%8F%20Watch%20on-Google%20Drive-blue?style=for-the-badge\&logo=google-drive)](https://drive.google.com/file/d/1L8f-7ttuTOq-D_OfP89z02_Jmf6GAF4N/view?usp=sharing)

> **Notes about the Drive link**
>
> * Make sure the file's sharing settings allow viewers to access it (Recommended: *Anyone with the link* can view).
> * If you prefer not to host on Drive, consider uploading to YouTube (unlisted) for better playback experience inside the browser.

---

## Known limitations

* Simple batching and stroke model (prototype): points are sent in small batches; there may be minor visual artifacts under network delay.
* Global undo/redo only: Undo always removes the last operation globally. Per-user or semantic undo requires a different design (CRDTs or OT).
* No persistence: server stores the operation history in memory; server restart clears canvas. Consider adding persistence for production.

---

## Troubleshooting

* If drawing or cursors don't appear:

  * Open the browser DevTools Console and the server terminal for errors.
  * Ensure Socket.io is served (check `/socket.io/socket.io.js` loads) and that WebSocket upgrade requests succeed.
* If deployed and sockets fail to connect:

  * Verify the hosting service uses standard WebSocket support (Render does for Web Services).
  * Check service logs for binding errors or crashes.

---

## Next steps and suggestions

* Add persistence (file or DB) so sessions survive restarts.
* Add per-room isolation (rooms) for multiple canvases.
* Implement server-side aggregation of `stroke-points` so new clients receive full stroke point history.
* Improve stroke smoothing on the client (bezier/Catmull-Rom) to reduce bandwidth and improve visuals.

---

## Time spent

* ~2 hours — prototype

---

## Embedding a local MP4 (optional)

If you'd like to include a local MP4 in the repo (note: GitHub README won't autoplay inline on github.com, but it will open the file in GitHub's player), add the file under `/assets/demo.mp4` and link to it:

```markdown
[![Watch the demo](assets/demo_thumbnail.png)](assets/demo.mp4)
```

For GitHub Pages or other static sites you control, you can embed with HTML for inline playback:

```html
<video controls playsinline src="/assets/demo.mp4" style="max-width:100%; height:auto;"></video>
```

---

## License

MIT
