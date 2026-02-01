// noinspection JSUnusedLocalSymbols,JSUnresolvedReference,TypeScriptValidateTypes

import type { RoomExport, SimSnapshot } from "../shared.js";

const canvas = document.getElementById("room") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const statusEl = document.getElementById("status")!;
const tickEl = document.getElementById("tick")!;
const toggleBtn = document.getElementById("toggle") as HTMLButtonElement;

const W = 50;
const H = 50;

function drawCircle(x: number, y: number, r: number, fill?: string, stroke?: string, lineWidth = 2) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function drawCreep(
  px: number,
  py: number,
  energy: number,
  capacity: number
) {
  const cx = px + tile / 2;
  const cy = py + tile / 2;

  const rOuter = tile * 0.50;

  // Thickness of black rim (tweak this if desired)
  const rim = Math.max(3, tile * 0.3);

  // Max yellow radius always leaves black border
  const rFillMax = Math.max(0, rOuter - rim);

  const clamped = Math.max(0, Math.min(energy, capacity));
  const ratio = capacity > 0 ? clamped / capacity : 0;

  // --- outer body ---
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
  ctx.fillStyle = "#000";
  ctx.fill();

  // --- inner energy (yellow) ---
  const rFill = rFillMax * ratio;
  if (rFill > 0.5) {
    ctx.beginPath();
    ctx.arc(cx, cy, rFill, 0, Math.PI * 2);
    ctx.fillStyle = "#f1c40f";
    ctx.fill();
  }

  // optional: little “front” tick (yellow) so you can see orientation at a glance
  ctx.strokeStyle = "#f1c40f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - rOuter);
  ctx.lineTo(cx, cy - rOuter * 0.85);
  ctx.stroke();
  
  // --- small green back tick (MOVE indicator) ---
  ctx.strokeStyle = "#2ecc71";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy + rOuter * 0.90);
  ctx.lineTo(cx, cy + rOuter * 0.82);
  ctx.stroke();
}


function drawSpawn(px: number, py: number, energy = 0, capacity = 300) {
  const cx = px + tile / 2;
  const cy = py + tile / 2;

  const rOuter = tile * 0.42;       // spawn body
  const rFillMax = rOuter * 0.78;   // max inner fill radius

  const clamped = Math.max(0, Math.min(energy, capacity));
  const ratio = capacity > 0 ? clamped / capacity : 0;

  // Outer shell (dark)
  drawCircle(cx, cy, rOuter, "#000000", "#2ecc71", 2);

  // Inner fill grows with energy (yellow)
  const rFill = rFillMax * ratio;

  if (rFill > 0.5) {
    // subtle glow
    ctx.shadowColor = "#f1c40f";
    ctx.shadowBlur = tile * 0.45;

    drawCircle(cx, cy, rFill, "#f1c40f"); // yellow energy

    ctx.shadowBlur = 0;
  } else {
    // empty core indicator
    drawCircle(cx, cy, rOuter * 0.22, "#111");
  }

  // Optional: spokes to keep "spawn-ness" recognizable
  ctx.strokeStyle = "#2ecc71";
  ctx.lineWidth = 2;
  const rInner = rOuter * 0.30;
  for (let i = 0; i < 3; i++) {
    const a = (i * (Math.PI * 2)) / 3 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * rInner, cy + Math.sin(a) * rInner);
    ctx.lineTo(cx + Math.cos(a) * (rOuter * 0.95), cy + Math.sin(a) * (rOuter * 0.95));
    ctx.stroke();
  }
}

function drawExtension(px: number, py: number, energy = 0, capacity = 50) {
  const cx = px + tile / 2;
  const cy = py + tile / 2;

  const rOuter = tile * 0.28;     // extension body
  const rFillMax = rOuter * 0.82; // max inner fill radius

  const clamped = Math.max(0, Math.min(energy, capacity));
  const ratio = capacity > 0 ? clamped / capacity : 0;

  // Outer shell (black)
  drawCircle(cx, cy, rOuter, "#000000", "#444", 2);

  // Inner fill radius scales with energy
  const rFill = rFillMax * ratio;

  if (rFill > 0.5) {
    // Color: partial = yellow, full = green
    const fillColor = ratio >= 0.999 ? "#2ecc71" : "#f1c40f";
    drawCircle(cx, cy, rFill, fillColor);
  } else {
    // Empty core indicator
    drawCircle(cx, cy, rOuter * 0.28, "#111");
  }
}

function drawTower(px: number, py: number, energy = 0, capacity = 1000) {
  const cx = px + tile / 2;
  const cy = py + tile / 2;

  ctx.save();

  // --- Black base circle with green outline ---
  const r = tile * 0.42;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#000";
  ctx.fill();

  ctx.strokeStyle = "#2ecc71";
  ctx.lineWidth = 1;
  ctx.stroke();

  // --- Tower base rectangle ---
  const baseW = tile * 0.55;
  const baseH = tile * 0.75;

  const baseX = cx - baseW / 2;
  const baseY = cy - baseH / 2;

  // Base body
  ctx.fillStyle = "#777";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1;

  ctx.fillRect(baseX, baseY, baseW, baseH);
  ctx.strokeRect(baseX, baseY, baseW, baseH);

  // --- Energy fill inside base (yellow, ratio-based) ---
  const pad = 1;

  const innerX = baseX + pad;
  const innerY = baseY + pad;
  const innerW = baseW - pad * 2;
  const innerH = baseH - pad * 2;

  const clamped = Math.max(0, Math.min(energy, capacity));
  const ratio = capacity > 0 ? clamped / capacity : 0;

  // Fill from bottom of BASE toward cannon
  const fillH = innerH * ratio;

  ctx.fillStyle = "#f1c40f";
  ctx.fillRect(innerX, innerY + innerH - fillH, innerW, fillH);

  // --- Cannon (sticks slightly outside circle) ---
  const gunW = tile * 0.18;
  const gunH = tile * 0.40;

  const gunX = cx - gunW / 2;
  const gunY = baseY - gunH + tile * 0.06;

  ctx.fillStyle = "#777";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1;

  ctx.fillRect(gunX, gunY, gunW, gunH);
  ctx.strokeRect(gunX, gunY, gunW, gunH);

  ctx.restore();
}

function drawContainer(px: number, py: number, energy = 0, capacity = 2000) {
  const cx = px + tile / 2;

  // Tall vertical battery
  const w = tile * 0.45;
  const h = tile * 0.80;

  const x = cx - w / 2;
  const y = py + tile * 0.10;

  const clamped = Math.max(0, Math.min(energy, capacity));
  const ratio = capacity > 0 ? clamped / capacity : 0;

  ctx.save();

  // Body (black)
  ctx.fillStyle = "#000";
  ctx.fillRect(x, y, w, h);

  // Energy fill from bottom (yellow)
  if (ratio > 0) {
    const fh = h * ratio;
    ctx.shadowColor = "#f1c40f";
    ctx.shadowBlur = tile * 0.25;

    ctx.fillStyle = "#f1c40f";
    ctx.fillRect(x, y + h - fh, w, fh);
  }

  ctx.shadowBlur = 0;

  // Outline
  ctx.strokeStyle = "#888";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  ctx.restore();
}

function drawRoad(px: number, py: number) {
  const cx = px + tile / 2;
  const cy = py + tile / 2;

  ctx.strokeStyle = "#2c3e50";
  ctx.lineWidth = Math.max(1, Math.floor(tile * 0.12));
  ctx.beginPath();
  ctx.moveTo(cx - tile * 0.35, cy);
  ctx.lineTo(cx + tile * 0.35, cy);
  ctx.moveTo(cx, cy - tile * 0.35);
  ctx.lineTo(cx, cy + tile * 0.35);
  ctx.stroke();
}

function drawRampart(px: number, py: number) {
  const cx = px + tile / 2;
  const cy = py + tile / 2;

  ctx.save();
  ctx.shadowColor = "#2ecc71";
  ctx.shadowBlur = tile * 0.25;

  drawCircle(cx, cy, tile * 0.42, undefined, "#2ecc71", 2);

  ctx.restore();
}

function drawStorage(px: number, py: number, energy = 0, capacity = 100000) {
  // Make storage visually BIG (about 2x2 tiles)
  const size = tile * 1.6;

  const x = px + tile / 2 - size / 2;
  const y = py + tile / 2 - size / 2;

  const clamped = Math.max(0, Math.min(energy, capacity));
  const ratio = capacity > 0 ? clamped / capacity : 0;

  ctx.save();

  // Body (black)
  ctx.fillStyle = "#000";
  ctx.fillRect(x, y, size, size);

  // Energy fill from bottom (yellow)
  if (ratio > 0) {
    const fh = size * ratio;

    ctx.shadowColor = "#f1c40f";
    ctx.shadowBlur = tile * 0.4;

    ctx.fillStyle = "#f1c40f";
    ctx.fillRect(x, y + size - fh, size, fh);
  }

  ctx.shadowBlur = 0;

  // Thick outline
  ctx.strokeStyle = "#bbb";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, size, size);

  // Optional: little center hatch so it reads as "storage"
  const hatch = size * 0.18;
  ctx.fillStyle = "#222";
  ctx.fillRect(
    x + size / 2 - hatch / 2,
    y + size / 2 - hatch / 2,
    hatch,
    hatch
  );

  ctx.restore();
}

function drawLink(px: number, py: number) {
  const cx = px + tile / 2;
  const cy = py + tile / 2;

  // Tighter spacing = thinner outlines
  const rOuter = tile * 0.40;   // green shell
  const rMid   = tile * 0.32;   // black border
  const rInner = tile * 0.22;   // gray core (bigger)

  ctx.save();

  function diamond(r: number, fill: string) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  // subtle glow (optional but nice)
  ctx.shadowColor = "#2ecc71";
  ctx.shadowBlur = tile * 0.2;

  // outer green
  diamond(rOuter, "#2ecc71");

  ctx.shadowBlur = 0;

  // middle black
  diamond(rMid, "#000000");

  // inner gray (larger)
  diamond(rInner, "#999");

  ctx.restore();
}

let paused = false;
toggleBtn.onclick = () => {
  paused = !paused;
  toggleBtn.textContent = paused ? "resume" : "pause";
  ws.send(JSON.stringify({ type: paused ? "pause" : "resume" }));
};

let room: RoomExport | null = null;
let snapshot: SimSnapshot | null = null;

// simple scale
const tile = Math.floor(Math.min(canvas.width / W, canvas.height / H));

function terrainAt(terrainStr: string, x: number, y: number): number {
  return terrainStr.charCodeAt(y * W + x) - 48;
}

function draw() {
  if (!room) return;

  // terrain
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = terrainAt(room.terrain, x, y);
      // colors chosen to be readable; you can style later
      if (v === 1) ctx.fillStyle = "#000000";      // wall
      else if (v === 2) ctx.fillStyle = "#132b1a"; // swamp
      else ctx.fillStyle = "#0f1724";              // plain
      ctx.fillRect(x * tile, y * tile, tile, tile);
    }
  }

  // sources
  ctx.fillStyle = "#f1c40f";
  for (const s of room.sources) {
    ctx.beginPath();
    ctx.arc(s.x * tile + tile / 2, s.y * tile + tile / 2, tile * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  // controller
  ctx.fillStyle = "#9b59b6";
  ctx.fillRect(room.controller.x * tile + tile * 0.2, room.controller.y * tile + tile * 0.2, tile * 0.6, tile * 0.6);

  // structures (very rough icons)
  for (const st of room.structures) {
    const px = st.x * tile;
    const py = st.y * tile;

    switch (st.type) {
      case "spawn": {
        // TEMP: fake energy (0..300) just to visualize
        const fakeEnergy = 300;
        drawSpawn(px, py, fakeEnergy, 300);
        break;
      }
      case "extension": {
        // TEMP: fake energy for visualization (0..50)
        const fakeEnergy = ((st.x * 7 + st.y * 13) % 51); // deterministic 0..50
        drawExtension(px, py, fakeEnergy, 50);
        break;
      }
      case "tower": {
        // TEMP fake energy (0..1000) for visualization
        const fakeEnergy = 800;
        drawTower(px, py, fakeEnergy, 1000);
        break;
      }
      case "container": {
        // TEMP: fake energy just for visuals (0..2000)
        const fakeEnergy = 1000;
        drawContainer(px, py, fakeEnergy, 2000);
        break;
      }
      case "road":
        drawRoad(px, py);
        break;
      case "constructedWall":
        ctx.fillStyle = "#111"; // keep walls very dark
        ctx.fillRect(px, py, tile, tile);
        break;
      case "rampart":
        drawRampart(px, py);
        break;
      case "storage":
        drawStorage(px, py);
        break;
      case "link":
        drawLink(px, py);
        break;
      default:
        break;
    }
  }

  // creeps
  if (snapshot) {
    for (const c of snapshot.creeps) {
      const capacity = 50; // 1 CARRY part = 50
      const energy = 50;

      drawCreep(c.x * tile, c.y * tile, energy, capacity);
    }
  }
}

function rafLoop() {
  draw();
  requestAnimationFrame(rafLoop);
}

// websocket
const ws = new WebSocket(`ws://${location.host}/ws`);

ws.onopen = () => {
  statusEl.textContent = "connected";
};

ws.onclose = () => {
  statusEl.textContent = "disconnected";
};

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);

  if (msg.type === "room") {
    room = msg.room as RoomExport;
  } else if (msg.type === "snap") {
    snapshot = msg.snap as SimSnapshot;
    tickEl.textContent = `tick: ${snapshot.tick}`;
  }
};

rafLoop();

