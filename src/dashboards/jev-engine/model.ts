export type Vec3 = [number, number, number];
export const STRAND_COUNT = 2600;
export interface JevSnapshot {
  time: number; paused: boolean; speed: number; fps: number;
  decisions: number; load: number; gated: number; escalations: number;
  confidence: number; tokens: number; latency: number; yaw: number; pitch: number; zoom: number;
}
export interface JevDiagnostics {
  renderer: 'canvas2d'; disposed: boolean; activeFrame: boolean; frameCount: number;
  strandCount: number; particleCount: number; depthRange: { min: number; max: number };
  rotation: { yaw: number; pitch: number; zoom: number };
  probes: { world: Vec3; screen: [number, number]; depth: number }[];
  sweepAngle: number;
}
export interface JevController {
  setPaused(value: boolean): void; setSpeed(value: number): void;
  restart(): void; resetView(): void; dispose(): void;
  getSnapshot(): JevSnapshot; debug(): JevDiagnostics;
}
export interface JevOptions { initialPaused?: boolean; onUpdate(snapshot: JevSnapshot): void }
export const initialJevSnapshot: JevSnapshot = {
  time: 0, paused: false, speed: 1, fps: 60, decisions: 9786, load: 398.5,
  gated: 127, escalations: 5, confidence: 73.9, tokens: 1.93, latency: 226,
  yaw: 40.7, pitch: 16.6, zoom: 1,
};
export const noise = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
