export const VORTEX_CYCLE = 30;
export const operators = ['WATCHER', 'ANALYST', 'RISK', 'EXECUTOR', 'REPORTER', 'HUMAN'] as const;
export interface VortexSnapshot {
  time: number; paused: boolean; speed: number; hue: number; fps: number;
  phase: 'OBSERVE' | 'ANALYZE' | 'RISK CHECK' | 'EXECUTE' | 'REPORT';
  confidence: number; riskHold: boolean; decisions: number; latency: number;
  net: number; events: number;
  camera: { yaw: number; pitch: number; zoom: number };
}
export const initialVortexSnapshot: VortexSnapshot = {
  time: 0, paused: false, speed: 1, hue: 0, fps: 60, phase: 'OBSERVE', confidence: .94,
  riskHold: false, decisions: 34, latency: 248, net: 425, events: 4470,
  camera: { yaw: 0, pitch: 0, zoom: 1 },
};
export interface VortexDiagnostics extends VortexSnapshot {
  renderer: string; particles: number; strands: number; renderedFrames: number; activeFrame: boolean;
  depthRange: { min: number; max: number };
  probes: Array<{ world: { x: number; y: number; z: number }; screen: { x: number; y: number; scale: number } }>;
}
export interface VortexController {
  setPaused(paused: boolean): void;
  setSpeed(speed: number): void;
  restart(): void;
  resetView(): void;
  dispose(): void;
  getDiagnostics(): VortexDiagnostics;
}
export interface VortexOptions {
  onUpdate: (snapshot: VortexSnapshot) => void;
  onFrame?: (time: number) => void;
  initialPaused?: boolean;
}
