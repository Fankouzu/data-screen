export const phases = ['STATE', 'ASK', 'JEV', 'GATE', 'CODE'] as const;
export const CASE_DURATION = 6;
export interface DecisionCase {
  id: string; label: string; short: string; color: string;
  question: string; result: string; confidence: number; action: string;
  input: string; kind: 'Choice' | 'Score' | 'Noul';
}
export const cases: DecisionCase[] = [
  { id: 'email', label: 'EMAIL TRIAGE', short: 'email', color: '#ff795b', question: 'folder', result: 'phishing', confidence: .97, action: 'quarantine', input: 'mail received', kind: 'Choice' },
  { id: 'youtube', label: 'YOUTUBE COMMENT', short: 'youtube', color: '#49ffd0', question: 'worth_reply', result: 'yes', confidence: .94, action: 'draft_reply', input: 'new comment', kind: 'Noul' },
  { id: 'skool', label: 'COMMUNITY SIGNAL', short: 'skool', color: '#71e7ff', question: 'next_worker', result: 'research', confidence: .91, action: 'assign_worker', input: 'community post', kind: 'Choice' },
  { id: 'x-feed', label: 'X FEED POST', short: 'x feed', color: '#ef62e9', question: 'viral_fit', result: 'high', confidence: .92, action: 'draft_short', input: 'post candidate', kind: 'Score' },
  { id: 'meetings', label: 'MEETING NOTES', short: 'meetings', color: '#a4c8ff', question: 'follow_up', result: 'yes', confidence: .93, action: 'calendar', input: 'meeting ended', kind: 'Noul' },
  { id: 'clips', label: 'CLIP SELECTION', short: 'clips', color: '#ffb765', question: 'clip_quality', result: 'high', confidence: .90, action: 'export_clip', input: 'video segment', kind: 'Score' },
  { id: 'contracts', label: 'CONTRACT REVIEW', short: 'contracts', color: '#ff9daf', question: 'risk_level', result: 'low', confidence: .96, action: 'review_folder', input: 'contract uploaded', kind: 'Score' },
  { id: 'leads', label: 'INBOUND LEAD', short: 'leads', color: '#ffe65d', question: 'lead_quality', result: 'high', confidence: .89, action: 'book_call', input: 'new lead', kind: 'Score' },
  { id: 'brain-dump', label: 'IDEA ROUTER', short: 'brain-dump', color: '#c2fc6b', question: 'next_worker', result: 'write', confidence: .91, action: 'save_note', input: 'idea captured', kind: 'Choice' },
  { id: 'support', label: 'SUPPORT TICKET', short: 'support', color: '#c991ff', question: 'urgency', result: 'critical', confidence: .71, action: 'human_gate', input: 'support request', kind: 'Score' },
  { id: 'trading', label: 'MARKET SIGNAL', short: 'trading', color: '#7abfff', question: 'signal_quality', result: 'review', confidence: .82, action: 'human_gate', input: 'market event', kind: 'Score' },
  { id: 'agents', label: 'BROWSER AGENT', short: 'agents', color: '#70aaff', question: 'action', result: 'type_destination', confidence: .94, action: 'code_clicks', input: 'browser state', kind: 'Choice' },
];
export interface GridSnapshot {
  time: number; caseIndex: number; phase: number; progress: number;
  paused: boolean; speed: number; decisions: number; confidence: number;
  fps: number; camera: { yaw: number; pitch: number; zoom: number };
}
export const initialSnapshot: GridSnapshot = {
  time: 0, caseIndex: 7, phase: 0, progress: 0, paused: false, speed: 1,
  decisions: 562, confidence: 0, fps: 60, camera: { yaw: 0, pitch: 0, zoom: 1 },
};
export interface GridDiagnostics extends GridSnapshot {
  cards: number; walls: number; depthRange: { min: number; max: number };
  renderedFrames: number; activeFrame: boolean;
  probes: Array<{ world: { x: number; y: number; z: number }; screen: { x: number; y: number; scale: number } }>;
}
export interface GridController {
  setPaused(paused: boolean): void;
  setSpeed(speed: number): void;
  setCase(index: number): void;
  restart(): void;
  resetView(): void;
  dispose(): void;
  getDiagnostics(): GridDiagnostics;
}
export interface GridOptions {
  onUpdate: (snapshot: GridSnapshot) => void;
  initialPaused?: boolean;
}
