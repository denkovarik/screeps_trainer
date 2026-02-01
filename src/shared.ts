export type TerrainCell = 0 | 1 | 2; // 0 plain, 1 wall, 2 swamp

export type RoomExport = {
  roomName: string;
  time: number;
  terrain: string; // length should be 2500 (50*50)
  sources: { id: string; x: number; y: number; energyCapacity: number }[];
  controller: { id: string; x: number; y: number; level: number };
  structures: { id: string; type: string; x: number; y: number; hits: number }[];
  exits?: Record<string, string>;
};

export type SimCreep = {
  id: string;
  x: number;
  y: number;
  targetId: string;
};

export type SimSnapshot = {
  tick: number;
  roomName: string;
  creeps: SimCreep[];
};

