import fs from "node:fs";
import type { RoomExport, SimCreep, SimSnapshot } from "../shared.js";
import { bfsDistanceField, stepToward } from "./path.js";

const W = 50;
const H = 50;

function decodeTerrain(terrainStr: string): Uint8Array {
  if (terrainStr.length !== W * H) {
    throw new Error(`terrain length ${terrainStr.length} != ${W * H}. (Expected 2500)`);
  }
  const arr = new Uint8Array(W * H);
  for (let i = 0; i < terrainStr.length; i++) {
    const c = terrainStr.charCodeAt(i);
    const v = c - 48; // '0'..'2'
    arr[i] = v;
  }
  return arr;
}

function defaultEnergyCapacity(type: string): number {
  switch (type) {
    case "spawn": return 300;
    case "extension": return 50;
    case "tower": return 1000;
    case "container": return 2000;
    case "storage": return 100000;
    case "link": return 800;
    default: return 0; // roads/walls/ramparts etc.
  }
}

export type World = {
  room: RoomExport;
  terrain: Uint8Array;
  tick: number;
  creeps: SimCreep[];

  // cached distance field for current target (MVP: single creep)
  distField: Int32Array | null;
  targetPos: { x: number; y: number; id: string } | null;

  // per-structure dynamic state (energy + capacity)
  structureEnergy: Map<string, { energy: number; capacity: number }>;
};

export function loadWorld(roomExportPath: string): World {
  const raw = fs.readFileSync(roomExportPath, "utf8").trim();
  const room = JSON.parse(raw) as RoomExport;

  const terrain = decodeTerrain(room.terrain);

  // Init structure energy state (server-authoritative)
  const structureEnergy = new Map<string, { energy: number; capacity: number }>();
  for (const st of room.structures) {
    const cap = defaultEnergyCapacity(st.type);

    // MVP: start spawn full, others empty (simple + visible)
    const startEnergy = cap > 0 ? cap : 0;

    structureEnergy.set(st.id, { energy: startEnergy, capacity: cap });
  }

  // Spawn creep near spawn/controller; your start is currently fixed
  const startX = 32;
  const startY = 38;

  const target = room.sources[0];
  const creep: SimCreep = {
    id: "creep1",
    x: startX,
    y: startY,
    targetId: target?.id ?? "none"
  };

  const world: World = {
    room,
    terrain,
    tick: 0,
    creeps: [creep],
    distField: null,
    targetPos: target ? { x: target.x, y: target.y, id: target.id } : null,
    structureEnergy
  };

  if (world.targetPos) {
    world.distField = bfsDistanceField(world.terrain, world.targetPos.x, world.targetPos.y);
  }

  return world;
}

export function stepWorld(world: World): SimSnapshot {
  world.tick++;

  const creep = world.creeps[0];
  if (creep && world.targetPos && world.distField) {
    // If creep reached target, switch target to other source (if any)
    if (creep.x === world.targetPos.x && creep.y === world.targetPos.y) {
      const other = world.room.sources.find(s => s.id !== world.targetPos!.id);
      if (other) {
        world.targetPos = { x: other.x, y: other.y, id: other.id };
        creep.targetId = other.id;
        world.distField = bfsDistanceField(world.terrain, other.x, other.y);
      }
    } else {
      const next = stepToward(world.terrain, world.distField, creep.x, creep.y);
      creep.x = next.x;
      creep.y = next.y;
    }
  }

  // =========================================================
  // DEBUG: Print extension energy every N ticks (Option A)
  // =========================================================
  //const DEBUG_EVERY_N_TICKS = 20;

  //if (world.tick % DEBUG_EVERY_N_TICKS === 0) {
  //  const exts = world.room.structures.filter(s => s.type === "extension");
  //
  //  const rows = exts.map((st) => {
  //    const se = world.structureEnergy.get(st.id);
  //    return {
  //      id: st.id.slice(-6),     // shorter for readability
  //      x: st.x,
  //      y: st.y,
  //      energy: se?.energy ?? 0,
  //      cap: se?.capacity ?? 0
  //    };
  //  });
  //
  //  console.log(`\n[tick ${world.tick}] extension energy (${rows.length})`);
  //  console.table(rows);
  //
  //  // Optional quick summary too:
  //  const totalEnergy = rows.reduce((acc, r) => acc + (typeof r.energy === "number" ? r.energy : 0), 0);
  //  const totalCap = rows.reduce((acc, r) => acc + (typeof r.cap === "number" ? r.cap : 0), 0);
  //  console.log(`[tick ${world.tick}] extensions total: ${totalEnergy}/${totalCap}`);
  //}

  return {
    tick: world.tick,
    roomName: world.room.roomName,
    creeps: world.creeps.map(c => ({ ...c })),
    structures: world.room.structures.map(st => {
      const se = world.structureEnergy.get(st.id);
      return {
        id: st.id,
        energy: se?.energy ?? 0,
        energyCapacity: se?.capacity ?? 0
      };
    })
  };
}

