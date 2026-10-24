/// <reference types="vite/client" />

interface Vector3 { x: number; y: number; z: number }
interface DashboardState {
  stage: string;
  paused: boolean;
  elapsed: number;
  playbackRate: number;
  spider: Vector3;
  burst: number;
  impact: number;
  renderDpr: number;
  renderer: 'webgl' | 'canvas-fallback';
  camera: { yaw: number; pitch: number };
  clusters: Array<Vector3 & { name: string }>;
  particleDepthRange: { min: number; max: number };
  zoom: number;
  pan: { x: number; y: number };
  particles: number;
}
interface Window {
  demoState?: () => DashboardState;
  demo3D?: () => { probes: Array<{ world: Vector3; screen: { x: number; y: number; k: number; depth: number } }> };
}
