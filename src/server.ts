import express from "express";
import http from "node:http";
import path from "node:path";
import { WebSocketServer } from "ws";
import { fileURLToPath } from "node:url";

import { loadWorld, stepWorld } from "./sim/world.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const ROOM_EXPORT_PATH = path.resolve(process.cwd(), "roomExport.json");

// Load the room once at startup
const world = loadWorld(ROOM_EXPORT_PATH);

// Serve the web files directly from src/web in dev.
// (For "build" you can copy these into dist later; MVP keeps it simple.)
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "web", "index.html"));
});

// Serve client.ts as JS via a tiny on-the-fly TypeScript transpile? (No.)
// Instead: in dev with tsx, Node can import TS, but the browser cannot.
// So we ship client.ts compiled by tsc into dist/web/client.js on build.
// For dev, simplest: we also serve the TS source and let you compile once.
// Since you asked for “something fast”, here’s a quick path:

// In dev, we serve a precompiled client.js from dist/web/client.js if present,
// otherwise we serve the TS file as a fallback (won't run in browser).
app.get("/client.js", (_req, res) => {
  const built = path.resolve(process.cwd(), "dist", "web", "client.js");
  res.sendFile(built, (err) => {
    if (err) {
      res.status(500).send(
        "client.js not found. Run `npm run build` once, then `npm run dev`.\n" +
        "This MVP keeps bundling minimal."
      );
    }
  });
});

let paused = false;

// WS connections
wss.on("connection", (ws) => {
  // Send room once
  ws.send(JSON.stringify({ type: "room", room: world.room }));

  ws.on("message", (buf) => {
    try {
      const msg = JSON.parse(buf.toString());
      if (msg.type === "pause") paused = true;
      if (msg.type === "resume") paused = false;
    } catch {
      // ignore
    }
  });
});

// Main sim loop: tick fast, broadcast snapshots at a human rate
const TICKS_PER_SECOND = 20;      // sim tick rate (increase later)
const SNAP_EVERY_TICKS = 1;       // send every tick for now (increase later)
let tickAccumulator = 0;

setInterval(() => {
  if (paused) return;

  // You can "batch" ticks later for speed:
  // for (let i=0; i<100; i++) stepWorld(...)
  const snap = stepWorld(world);
  tickAccumulator++;

  if (tickAccumulator % SNAP_EVERY_TICKS === 0) {
    const payload = JSON.stringify({ type: "snap", snap: snap });
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(payload);
    }
  }
}, Math.floor(1000 / TICKS_PER_SECOND));

const PORT = 5173;
server.listen(PORT, () => {
  console.log(`Viewer: http://localhost:${PORT}`);
});

