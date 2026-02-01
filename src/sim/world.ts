import fs from "node:fs";
import path from "node:path";
import type { RoomExport, SimCreep, SimSnapshot } from "../shared.js";
import { bfsDistanceField, stepToward } from "./path.js";

const W = 50;
const H = 50;

function decodeTerrain(terrainStr: string): Uint8Array {
  // Screeps terrain string is 2500 chars; your export appears to be digits 0/1/2.
  if (terrainStr.length !== W * H) {
    throw new Error(`terrain length ${terrainStr.length} != ${W * H}. (Expected 2500)`);
  }
  const arr = new Uint8Array(W * H);
  for (let i = 0; i < terrainStr.length; i++) {
    const c = terrainStr.charCodeAt(i);
    // '0'..'2'
    const v = c - 48;
    arr[i] = v;
  }
  return arr;
}

export type World = {
  room: RoomExport;
  terrain: Uint8Array;
  tick: number;
  creeps: SimCreep[];
  // cached distance field for current target (MVP: single creep)
  distField: Int32Array | null;
  targetPos: { x: number; y: number; id: string } | null;
};

export function loadWorld(roomExportPath: string): World {
  const raw = fs.readFileSync(roomExportPath, "utf8").trim();
  const room = JSON.parse(raw) as RoomExport;

  const terrain = decodeTerrain(room.terrain);

  // Spawn creep at spawn if exists, else near controller, else center
  const spawn = room.structures.find(s => s.type === "spawn");
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
    targetPos: target ? { x: target.x, y: target.y, id: target.id } : null
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

  return {
    tick: world.tick,
    roomName: world.room.roomName,
    creeps: world.creeps.map(c => ({ ...c }))
  };
}

