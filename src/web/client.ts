import type { RoomExport, SimSnapshot } from "../shared.js";

/**
 * =========
 * DOM / Canvas
 * =========
 */
const canvas = document.getElementById("room") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const statusEl = document.getElementById("status")!;
const tickEl = document.getElementById("tick")!;
const toggleBtn = document.getElementById("toggle") as HTMLButtonElement;

const tileXEl = document.getElementById("tileX")!;
const tileYEl = document.getElementById("tileY")!;
const tileTerrainEl = document.getElementById("tileTerrain")!;

// Right panel structure section
const structureSectionEl = document.getElementById("structureSection") as HTMLDivElement;
const structureTypeEl = document.getElementById("structureType")!;
const structurePosEl = document.getElementById("structurePos")!;
const structureHitsEl = document.getElementById("structureHits")!;
const structureDecayEl = document.getElementById("structureDecay")!;

// Right panel creep section
const creepSectionEl = document.getElementById("creepSection") as HTMLDivElement;
const creepIdEl = document.getElementById("creepId")!;
const creepPosEl = document.getElementById("creepPos")!;
const creepTargetEl = document.getElementById("creepTarget")!;

// Tooltip picker
const pickTooltipEl = document.getElementById("pickTooltip") as HTMLDivElement;

/**
 * =========
 * Constants / Types
 * =========
 */
const W = 50;
const H = 50;

type TilePos = { x: number; y: number };
type RoomStructure = RoomExport["structures"][number];

/**
 * =========
 * State
 * =========
 */
let paused = false;

let room: RoomExport | null = null;
let snapshot: SimSnapshot | null = null;

let hovered: TilePos | null = null;

// click-selected tile (optional; useful if you later want an overlay)
let selected: TilePos | null = null;

// Lookup: "x,y" -> structures[]
const structuresByPos = new Map<string, RoomStructure[]>();

// Lookup: structureId -> { energy, cap } (from simulation snapshot)
const structureEnergyById = new Map<string, { energy: number; cap: number }>();

function rebuildStructureEnergyIndex() {
  structureEnergyById.clear();
  if (!snapshot) return;
  for (const s of snapshot.structures) {
    structureEnergyById.set(s.id, { energy: s.energy, cap: s.energyCapacity });
  }
}

/**
 * Simple scale: pixels per tile.
 * NOTE: if you later support zoom/pan, this becomes dynamic.
 */
const tile = Math.floor(Math.min(canvas.width / W, canvas.height / H));

/**
 * =========
 * Coordinate Helpers
 * =========
 */
function key(x: number, y: number) {
  return `${x},${y}`;
}

function terrainAt(terrainStr: string, x: number, y: number): number {
  return terrainStr.charCodeAt(y * W + x) - 48;
}

function terrainName(v: number): "plain" | "wall" | "swamp" {
  if (v === 1) return "wall";
  if (v === 2) return "swamp";
  return "plain";
}

function rebuildStructureIndex() {
  structuresByPos.clear();
  if (!room) return;

  for (const st of room.structures) {
    const k = key(st.x, st.y);
    const arr = structuresByPos.get(k);
    if (arr) arr.push(st);
    else structuresByPos.set(k, [st]);
  }
}

// Lookup: "x,y" -> creeps[]
const creepsByPos = new Map<string, SimSnapshot["creeps"][number][]>();

function rebuildCreepIndex() {
  creepsByPos.clear();
  if (!snapshot) return;

  for (const c of snapshot.creeps) {
    const k = key(c.x, c.y);
    const arr = creepsByPos.get(k);
    if (arr) arr.push(c);
    else creepsByPos.set(k, [c]);
  }
}

/**
 * Convert mouse event -> tile coordinate (handles CSS scaling).
 */
function mouseToTile(ev: MouseEvent): TilePos | null {
  const rect = canvas.getBoundingClientRect();

  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const mx = (ev.clientX - rect.left) * scaleX;
  const my = (ev.clientY - rect.top) * scaleY;

  const tx = Math.floor(mx / tile);
  const ty = Math.floor(my / tile);

  if (tx < 0 || tx >= W || ty < 0 || ty >= H) return null;
  return { x: tx, y: ty };
}

/**
 * =========
 * Right Panel Updates
 * =========
 */
function updateTilePanel() {
  if (!hovered || !room) {
    tileXEl.textContent = "-";
    tileYEl.textContent = "-";
    tileTerrainEl.textContent = "-";
    return;
  }

  tileXEl.textContent = String(hovered.x);
  tileYEl.textContent = String(hovered.y);

  const t = terrainAt(room.terrain, hovered.x, hovered.y);
  tileTerrainEl.textContent = terrainName(t);
}

function clearStructurePanel() {
  structureSectionEl.style.display = "none";
  structureTypeEl.textContent = "-";
  structurePosEl.textContent = "-";
  structureHitsEl.textContent = "-";
  structureDecayEl.textContent = "-";
}

function showStructurePanel(st: RoomStructure) {
  structureSectionEl.style.display = "block";

  structureTypeEl.textContent = st.type;
  structurePosEl.textContent = `(${st.x}, ${st.y})`;

  // hits is guaranteed by your RoomExport type, but keep it safe anyway:
  structureHitsEl.textContent = st.hits !== undefined ? String(st.hits) : "-";

  // placeholder for now
  structureDecayEl.textContent = "-";
}

function clearCreepPanel() {
  creepSectionEl.style.display = "none";
  creepIdEl.textContent = "-";
  creepPosEl.textContent = "-";
  creepTargetEl.textContent = "-";
}

function showCreepPanel(c: SimSnapshot["creeps"][number]) {
  creepSectionEl.style.display = "block";
  creepIdEl.textContent = c.id;
  creepPosEl.textContent = `(${c.x}, ${c.y})`;
  creepTargetEl.textContent = c.targetId ?? "-";
}

/**
 * =========
 * Tooltip Picker
 * =========
 */
function hidePickTooltip() {
  pickTooltipEl.style.display = "none";
  pickTooltipEl.innerHTML = "";
}

function structurePriority(type: string): number {
  // smaller = earlier
  switch (type) {
    case "spawn": return 0;
    case "tower": return 1;
    case "storage": return 2;
    case "container": return 3;
    case "extension": return 4;
    case "link": return 5;
    case "rampart": return 6;
    case "constructedWall": return 7;
    case "road": return 8;
    default: return 50;
  }
}

function showPickTooltip(
  items: RoomStructure[],
  screenX: number,
  screenY: number,
  onPick: (st: RoomStructure) => void
) {
  pickTooltipEl.innerHTML = "";

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = "Select structure:";
  pickTooltipEl.appendChild(title);

  for (const st of items) {
    const div = document.createElement("div");
    div.className = "item";
    div.textContent = st.type;

    div.addEventListener("click", (e) => {
      e.stopPropagation(); // prevent outside-click handler
      hidePickTooltip();
      onPick(st);
    });

    pickTooltipEl.appendChild(div);
  }

  // Place near cursor
  pickTooltipEl.style.display = "block";
  pickTooltipEl.style.left = `${screenX + 12}px`;
  pickTooltipEl.style.top = `${screenY + 12}px`;

  // Clamp to viewport
  const pad = 12;
  const rect = pickTooltipEl.getBoundingClientRect();

  let left = rect.left;
  let top = rect.top;

  if (rect.right > window.innerWidth - pad) left = window.innerWidth - pad - rect.width;
  if (rect.bottom > window.innerHeight - pad) top = window.innerHeight - pad - rect.height;

  pickTooltipEl.style.left = `${Math.max(pad, left)}px`;
  pickTooltipEl.style.top = `${Math.max(pad, top)}px`;
}

// Clicking inside tooltip should NOT close it via document click
pickTooltipEl.addEventListener("click", (ev) => {
  ev.stopPropagation();
});

// Click anywhere else closes tooltip
document.addEventListener("click", (ev) => {
  const target = ev.target as Node | null;
  if (target && pickTooltipEl.contains(target)) return;
  hidePickTooltip();
});

/**
 * =========
 * Input / UI
 * =========
 */
function initInput(ws: WebSocket) {
  canvas.addEventListener("mousemove", (ev) => {
    hovered = mouseToTile(ev);
    updateTilePanel();
  });

  canvas.addEventListener("mouseleave", () => {
    hovered = null;
    updateTilePanel();
  });

  canvas.addEventListener("click", (ev) => {
    ev.stopPropagation();

    hidePickTooltip();

    const t = mouseToTile(ev);

    if (!t) {
      selected = null;
      clearStructurePanel();
      clearCreepPanel();
      return;
    }

    selected = t;

    const creepsHere = creepsByPos.get(key(t.x, t.y)) ?? [];
    const structsHere = structuresByPos.get(key(t.x, t.y)) ?? [];

    // Nothing on tile
    if (creepsHere.length === 0 && structsHere.length === 0) {
      clearStructurePanel();
      clearCreepPanel();
      return;
    }

    // Only one thing total -> show directly
    if (creepsHere.length + structsHere.length === 1) {
      if (creepsHere.length === 1) {
        showCreepPanel(creepsHere[0]);
        clearStructurePanel();
      } else {
        showStructurePanel(structsHere[0]);
        clearCreepPanel();
      }
      return;
    }

    // Multiple items: show picker tooltip (creeps + structures)
    // We'll create "pick items" with labels and callbacks.
    type PickItem =
      | { kind: "creep"; label: string; creep: SimSnapshot["creeps"][number] }
      | { kind: "structure"; label: string; st: RoomStructure };

    const picks: PickItem[] = [];

    // Put creeps first (feels natural when you click a moving unit)
    for (const c of creepsHere) {
      picks.push({ kind: "creep", label: `Creep: ${c.id}`, creep: c });
    }

    // Then structures (sorted by priority like you already do)
    const sortedStructs = [...structsHere].sort(
      (a, b) => structurePriority(a.type) - structurePriority(b.type)
    );
    for (const st of sortedStructs) {
      picks.push({ kind: "structure", label: `Structure: ${st.type}`, st });
    }

    // Render picker using existing tooltip DOM
    pickTooltipEl.innerHTML = "";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = "Select entity:";
    pickTooltipEl.appendChild(title);

    for (const p of picks) {
      const div = document.createElement("div");
      div.className = "item";
      div.textContent = p.label;

      div.addEventListener("click", (e) => {
        e.stopPropagation();
        hidePickTooltip();

        if (p.kind === "creep") {
          showCreepPanel(p.creep);
          clearStructurePanel();
        } else {
          showStructurePanel(p.st);
          clearCreepPanel();
        }
      });

      pickTooltipEl.appendChild(div);
    }

    // Place tooltip
    pickTooltipEl.style.display = "block";
    pickTooltipEl.style.left = `${ev.clientX + 12}px`;
    pickTooltipEl.style.top = `${ev.clientY + 12}px`;

    // Clamp to viewport (reuse your existing clamp logic)
    const pad = 12;
    const rect = pickTooltipEl.getBoundingClientRect();
    let left = rect.left;
    let top = rect.top;
    if (rect.right > window.innerWidth - pad) left = window.innerWidth - pad - rect.width;
    if (rect.bottom > window.innerHeight - pad) top = window.innerHeight - pad - rect.height;
    pickTooltipEl.style.left = `${Math.max(pad, left)}px`;
    pickTooltipEl.style.top = `${Math.max(pad, top)}px`;
  });

  toggleBtn.onclick = () => {
    paused = !paused;
    toggleBtn.textContent = paused ? "resume" : "pause";

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: paused ? "pause" : "resume" }));
    }
  };
}

/**
 * =========
 * Drawing Primitives
 * =========
 */
function drawCircle(
  x: number,
  y: number,
  r: number,
  fill?: string,
  stroke?: string,
  lineWidth = 2
) {
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

/**
 * =========
 * Entity Drawing
 * =========
 */
function drawCreep(px: number, py: number, energy: number, capacity: number) {
  const cx = px + tile / 2;
  const cy = py + tile / 2;

  const rOuter = tile * 0.5;

  const rim = Math.max(3, tile * 0.3);
  const rFillMax = Math.max(0, rOuter - rim);

  const clamped = Math.max(0, Math.min(energy, capacity));
  const ratio = capacity > 0 ? clamped / capacity : 0;

  ctx.beginPath();
  ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
  ctx.fillStyle = "#000";
  ctx.fill();

  const rFill = rFillMax * ratio;
  if (rFill > 0.5) {
    ctx.beginPath();
    ctx.arc(cx, cy, rFill, 0, Math.PI * 2);
    ctx.fillStyle = "#f1c40f";
    ctx.fill();
  }

  ctx.strokeStyle = "#f1c40f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - rOuter);
  ctx.lineTo(cx, cy - rOuter * 0.85);
  ctx.stroke();

  ctx.strokeStyle = "#2ecc71";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy + rOuter * 0.9);
  ctx.lineTo(cx, cy + rOuter * 0.82);
  ctx.stroke();
}

function drawSpawn(px: number, py: number, energy = 0, capacity = 300) {
  const cx = px + tile / 2;
  const cy = py + tile / 2;

  const rOuter = tile * 0.42;
  const rFillMax = rOuter * 0.78;

  const clamped = Math.max(0, Math.min(energy, capacity));
  const ratio = capacity > 0 ? clamped / capacity : 0;

  drawCircle(cx, cy, rOuter, "#000000", "#2ecc71", 2);

  const rFill = rFillMax * ratio;

  if (rFill > 0.5) {
    ctx.shadowColor = "#f1c40f";
    ctx.shadowBlur = tile * 0.45;

    drawCircle(cx, cy, rFill, "#f1c40f");

    ctx.shadowBlur = 0;
  } else {
    drawCircle(cx, cy, rOuter * 0.22, "#111");
  }

  ctx.strokeStyle = "#2ecc71";
  ctx.lineWidth = 2;
  const rInner = rOuter * 0.3;
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

  const rOuter = tile * 0.28;
  const rFillMax = rOuter * 0.82;

  const clamped = Math.max(0, Math.min(energy, capacity));
  const ratio = capacity > 0 ? clamped / capacity : 0;

  drawCircle(cx, cy, rOuter, "#000000", "#444", 2);

  const rFill = rFillMax * ratio;

  if (rFill > 0.5) {
    // Always yellow fill; fullness is shown by how big the fill circle is.
    drawCircle(cx, cy, rFill, "#f1c40f");
  } else {
    drawCircle(cx, cy, rOuter * 0.28, "#111");
  }
}

function drawTower(px: number, py: number, energy = 0, capacity = 1000) {
  const cx = px + tile / 2;
  const cy = py + tile / 2;

  ctx.save();

  const r = tile * 0.42;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#000";
  ctx.fill();

  ctx.strokeStyle = "#2ecc71";
  ctx.lineWidth = 1;
  ctx.stroke();

  const baseW = tile * 0.55;
  const baseH = tile * 0.75;

  const baseX = cx - baseW / 2;
  const baseY = cy - baseH / 2;

  ctx.fillStyle = "#777";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1;

  ctx.fillRect(baseX, baseY, baseW, baseH);
  ctx.strokeRect(baseX, baseY, baseW, baseH);

  const pad = 1;

  const innerX = baseX + pad;
  const innerY = baseY + pad;
  const innerW = baseW - pad * 2;
  const innerH = baseH - pad * 2;

  const clamped = Math.max(0, Math.min(energy, capacity));
  const ratio = capacity > 0 ? clamped / capacity : 0;

  const fillH = innerH * ratio;

  ctx.fillStyle = "#f1c40f";
  ctx.fillRect(innerX, innerY + innerH - fillH, innerW, fillH);

  const gunW = tile * 0.18;
  const gunH = tile * 0.4;

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

  const w = tile * 0.45;
  const h = tile * 0.8;

  const x = cx - w / 2;
  const y = py + tile * 0.1;

  const clamped = Math.max(0, Math.min(energy, capacity));
  const ratio = capacity > 0 ? clamped / capacity : 0;

  ctx.save();

  ctx.fillStyle = "#000";
  ctx.fillRect(x, y, w, h);

  if (ratio > 0) {
    const fh = h * ratio;
    ctx.shadowColor = "#f1c40f";
    ctx.shadowBlur = tile * 0.25;

    ctx.fillStyle = "#f1c40f";
    ctx.fillRect(x, y + h - fh, w, fh);
  }

  ctx.shadowBlur = 0;

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
  const size = tile * 1.6;

  const x = px + tile / 2 - size / 2;
  const y = py + tile / 2 - size / 2;

  const clamped = Math.max(0, Math.min(energy, capacity));
  const ratio = capacity > 0 ? clamped / capacity : 0;

  ctx.save();

  ctx.fillStyle = "#000";
  ctx.fillRect(x, y, size, size);

  if (ratio > 0) {
    const fh = size * ratio;

    ctx.shadowColor = "#f1c40f";
    ctx.shadowBlur = tile * 0.4;

    ctx.fillStyle = "#f1c40f";
    ctx.fillRect(x, y + size - fh, size, fh);
  }

  ctx.shadowBlur = 0;

  ctx.strokeStyle = "#bbb";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, size, size);

  const hatch = size * 0.18;
  ctx.fillStyle = "#222";
  ctx.fillRect(x + size / 2 - hatch / 2, y + size / 2 - hatch / 2, hatch, hatch);

  ctx.restore();
}

function drawLink(px: number, py: number) {
  const cx = px + tile / 2;
  const cy = py + tile / 2;

  const rOuter = tile * 0.4;
  const rMid = tile * 0.32;
  const rInner = tile * 0.22;

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

  ctx.shadowColor = "#2ecc71";
  ctx.shadowBlur = tile * 0.2;

  diamond(rOuter, "#2ecc71");

  ctx.shadowBlur = 0;

  diamond(rMid, "#000000");
  diamond(rInner, "#999");

  ctx.restore();
}

/**
 * =========
 * Overlays
 * =========
 */
function drawHoverOverlay() {
  if (!hovered) return;

  const px = hovered.x * tile;
  const py = hovered.y * tile;

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(px, py, tile, tile);

  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, py + 1, tile - 2, tile - 2);
}

/**
 * =========
 * Main Draw
 * =========
 */
function draw() {
  if (!room) return;

  // terrain
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = terrainAt(room.terrain, x, y);
      if (v === 1) ctx.fillStyle = "#000000";      // natural wall
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
  ctx.fillRect(
    room.controller.x * tile + tile * 0.2,
    room.controller.y * tile + tile * 0.2,
    tile * 0.6,
    tile * 0.6
  );

  // structures (use server-provided structure energy from snapshot)
  for (const st of room.structures) {
    const px = st.x * tile;
    const py = st.y * tile;

    const se = structureEnergyById.get(st.id);
    const energy = se?.energy ?? 0;
    const cap = se?.cap ?? 0;

    switch (st.type) {
      case "spawn":
        drawSpawn(px, py, energy, cap || 300);
        break;

      case "extension":
        drawExtension(px, py, energy, cap || 50);
        break;

      case "tower":
        drawTower(px, py, energy, cap || 1000);
        break;

      case "container":
        drawContainer(px, py, energy, cap || 2000);
        break;

      case "storage":
        drawStorage(px, py, energy, cap || 100000);
        break;

      case "road":
        drawRoad(px, py);
        break;

      case "constructedWall":
        ctx.fillStyle = "#111";
        ctx.fillRect(px, py, tile, tile);
        break;

      case "rampart":
        drawRampart(px, py);
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
      const capacity = 50;
      const energy = 50;
      drawCreep(c.x * tile, c.y * tile, energy, capacity);
    }
  }

  // overlays last
  drawHoverOverlay();
}

function rafLoop() {
  draw();
  requestAnimationFrame(rafLoop);
}

/**
 * =========
 * Networking
 * =========
 */
function createWebSocket(): WebSocket {
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
      rebuildStructureIndex();
      updateTilePanel();
      clearStructurePanel();
      hidePickTooltip();
      clearCreepPanel();
    } else if (msg.type === "snap") {
      snapshot = msg.snap as SimSnapshot;
      tickEl.textContent = `tick: ${snapshot.tick}`;
      rebuildStructureEnergyIndex();
      rebuildCreepIndex();
    }
  };

  return ws;
}

/**
 * =========
 * Init
 * =========
 */
function init() {
  const ws = createWebSocket();
  initInput(ws);
  rafLoop();
}

init();

