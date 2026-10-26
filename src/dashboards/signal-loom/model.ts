export interface SignalSnapshot {
  time: number;
  paused: boolean;
  speed: number;
  fps: number;
  phase: string;
  caseIndex: number;
  camera: string;
  decisions: number;
  confidence: number;
  latency: number;
}

export interface SignalDiagnostics {
  pointCount: number;
  depthRange: { min: number; max: number };
  rotation: { yaw: number; pitch: number; zoom: number };
  disposed: boolean;
  renderer: 'webgl' | 'canvas2d';
  frameCount: number;
  activeFrame: boolean;
  probes: { world: [number, number, number]; screen: [number, number] }[];
}

export interface SignalController {
  setPaused(value: boolean): void;
  setSpeed(value: number): void;
  restart(): void;
  resetView(): void;
  dispose(): void;
  getSnapshot(): SignalSnapshot;
  debug(): SignalDiagnostics;
}

export interface SignalOptions {
  initialPaused?: boolean;
  onUpdate(snapshot: SignalSnapshot): void;
}

export const initialSignalSnapshot: SignalSnapshot = {
  time: 0, paused: false, speed: 1, fps: 60, phase: 'STATE', caseIndex: 0,
  camera: 'THREE-QUARTER', decisions: 732, confidence: .97, latency: 256,
};
