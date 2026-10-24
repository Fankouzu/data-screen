export type NeuralMode = 'auto' | 'merged' | 'split';
export type NeuralPhase = 'DISTRIBUTED' | 'FUSION' | 'UNIFIED' | 'HEDGE';
export const CYCLE_DURATION = 28;
export const feeds = [
  { id: 'spot', label: 'SPOT · BTC', detail: 'LAST SPOT / FEED PRICE', color: '#f3bf66' },
  { id: 'flow', label: 'ORDER FLOW', detail: 'BOOK IMBALANCE / TICKS', color: '#c9d1e3' },
  { id: 'probability', label: 'P_MODEL · UP', detail: 'MODEL / IMPLIED PROB.', color: '#69e4aa' },
  { id: 'basis', label: 'BASIS · UP ASK', detail: 'MODEL − MARKET / EDGE', color: '#87b9ff' },
  { id: 'reward', label: 'REWARD · EDGE', detail: 'EXPECTED VALUE / SHARE', color: '#f6ed82' },
  { id: 'inventory', label: 'INV · LONG / SHORT', detail: 'HEDGE / NET EXPOSURE', color: '#b1a2ff' },
] as const;
export interface NeuralSnapshot {
  time: number; paused: boolean; speed: number; mode: NeuralMode;
  phase: NeuralPhase; separation: number; pnl: number; btc: number;
  probability: number; edge: number; orders: number; latency: number;
  fps: number; camera: { yaw: number; pitch: number; zoom: number };
}
export const initialSnapshot: NeuralSnapshot = {
  time: 0, paused: false, speed: 1, mode: 'auto', phase: 'DISTRIBUTED', separation: 1,
  pnl: 312016, btc: 81871, probability: .570, edge: 1.78, orders: 3181, latency: 23.25,
  fps: 60, camera: { yaw: 0, pitch: 0, zoom: 1 },
};
export interface NeuralDiagnostics extends NeuralSnapshot {
  nodes: number; edges: number; clusters: number;
  depthRange: { min: number; max: number }; renderedFrames: number; activeFrame: boolean;
  probes: Array<{ world: { x: number; y: number; z: number }; screen: { x: number; y: number; scale: number } }>;
}
export interface NeuralController {
  setPaused(value: boolean): void;
  setSpeed(value: number): void;
  setMode(value: NeuralMode): void;
  restart(): void;
  resetView(): void;
  dispose(): void;
  getDiagnostics(): NeuralDiagnostics;
}
export interface NeuralOptions { onUpdate: (state: NeuralSnapshot) => void; initialPaused?: boolean }
