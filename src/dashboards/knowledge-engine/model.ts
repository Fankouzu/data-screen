export type Vec3 = [number, number, number];
export type KnowledgePhase = 'READER' | 'LIBRARIAN' | 'ANSWER' | 'CHECKER';
export const pages: { name: string; position: Vec3; claim: string }[] = [
  { name: 'decisions.md', position: [.02, -1.37, -.16], claim: 'Record each decision with evidence' },
  { name: 'context.md', position: [1.05, -.98, .02], claim: 'Route context across sessions' },
  { name: 'people.md', position: [-.48, -.83, .30], claim: 'Keep owners and contacts current' },
  { name: 'routines.md', position: [.82, -.36, .30], claim: 'Review runs daily at 02:00' },
  { name: 'index.md', position: [-.12, -.22, -.25], claim: 'Link every page back to its source' },
  { name: 'writing.md', position: [-1.0, -.02, -.02], claim: 'Start with one active project' },
  { name: 'research.md', position: [.05, .36, .50], claim: 'Trace every claim to evidence' },
  { name: 'capture.md', position: [-1.0, .81, .34], claim: 'Keep every original untouched' },
  { name: 'projects.md', position: [1.03, .60, -.04], claim: 'One outcome per active project' },
  { name: 'memory.md', position: [.45, .98, .26], claim: 'Carry verified context forward' },
  { name: 'inbox.md', position: [1.30, 1.17, .05], claim: 'Capture first, classify later' },
  { name: 'sources.md', position: [-.47, 1.43, -.12], claim: 'Preserve citations and checksums' },
];
export const patchOrder = [7, 9, 3, 8, 5, 2, 0, 1, 6, 11, 10, 4];
export interface KnowledgeSnapshot {
  time: number; paused: boolean; speed: number; fps: number;
  phase: KnowledgePhase; stageLabel: string; activePage: number; workPage: number; inspecting: boolean; committed: number;
  nodeCount: number; linkCount: number; scanned: number; conflicts: number;
  command: string; claim: string; azimuth: number; zoom: number;
}
export interface KnowledgeLabel { id: string; text: string; x: number; y: number; scale: number; active: boolean; visible: boolean; kind: 'page' | 'source' | 'detail' }
export interface KnowledgeOverlay { labels: KnowledgeLabel[]; anchor: { x: number; y: number; visible: boolean }; }
export interface KnowledgeDiagnostics {
  renderer: 'webgl' | 'canvas2d'; nodeCount: number; linkCount: number;
  depthRange: { min: number; max: number }; rotation: { yaw: number; pitch: number; zoom: number };
  disposed: boolean; activeFrame: boolean; frameCount: number;
  probes: { world: Vec3; screen: [number, number]; depth: number }[];
}
export interface KnowledgeController {
  setPaused(value: boolean): void; setSpeed(value: number): void; restart(): void;
  resetView(): void; selectPage(index: number): void; dispose(): void;
  getSnapshot(): KnowledgeSnapshot; debug(): KnowledgeDiagnostics;
}
export interface KnowledgeOptions { initialPaused?: boolean; onUpdate(snapshot: KnowledgeSnapshot): void; onOverlay?(overlay: KnowledgeOverlay): void; }
export const initialKnowledgeSnapshot: KnowledgeSnapshot = {
  time: 0, paused: false, speed: 1, fps: 60, phase: 'READER', stageLabel: 'INGEST', activePage: 7, workPage: 7, inspecting: false, committed: 0,
  nodeCount: 2788, linkCount: 10240, scanned: 0, conflicts: 0, command: '> reader ingest raw/source-042.pdf --read-only',
  claim: 'Keep every original untouched', azimuth: 0, zoom: 1,
};
