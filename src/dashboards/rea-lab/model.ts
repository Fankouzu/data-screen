export type Vec3 = [number, number, number];
export type ReaPhase = 'LOADING' | 'LIFTING' | 'DECOMPILING' | 'SYNCING' | 'RESOLVED';
export const CYCLE_SECONDS = 18;
export const stages: { phase: ReaPhase; title: string; subtitle: string; start: number }[] = [
  { phase: 'LOADING', title: 'REA. BYTES IN. SOURCE OUT.', subtitle: 'disassembler on the left · decompiler on the right', start: 0 },
  { phase: 'LIFTING', title: 'REA DISASSEMBLES', subtitle: 'raw bytes combed into clean opcodes', start: 2.6 },
  { phase: 'DECOMPILING', title: 'REA DECOMPILES', subtitle: 'every function gets a second pass', start: 6 },
  { phase: 'SYNCING', title: 'REA LOCKS ON', subtitle: 'same graph · two views · closing the phase gap', start: 9 },
  { phase: 'RESOLVED', title: 'REA. BYTES IN. SOURCE OUT.', subtitle: 'nothing ships unread.', start: 14 },
];
export interface ReaSnapshot {
  time: number; paused: boolean; speed: number; fps: number; phase: ReaPhase; phaseIndex: number;
  lifted: number; decompiled: number; flagged: number; sync: number; gap: number;
  flagRate: number; crossings: number; inFlight: number; zoom: number; azimuth: number;
}
export interface ReaDiagnostics {
  renderer: 'canvas2d'; disposed: boolean; activeFrame: boolean; frameCount: number;
  nodeCount: number; linkCount: number; depthRange: { min: number; max: number };
  rotation: { yaw: number; pitch: number; zoom: number };
  camera: { x: number; y: number; zoom: number };
  probes: { world: Vec3; screen: [number, number]; depth: number }[];
}
export interface ReaController {
  setPaused(paused: boolean): void; setSpeed(speed: number): void; restart(): void;
  resetView(): void; dispose(): void; getSnapshot(): ReaSnapshot; debug(): ReaDiagnostics;
}
export interface ReaOptions { initialPaused?: boolean; onUpdate(snapshot: ReaSnapshot): void; }
export const initialReaSnapshot: ReaSnapshot = {
  time: 0, paused: false, speed: 1, fps: 60, phase: 'LOADING', phaseIndex: 0,
  lifted: 0, decompiled: 0, flagged: 0, sync: 0, gap: .42, flagRate: 38,
  crossings: 0, inFlight: 0, zoom: 1, azimuth: 0,
};
