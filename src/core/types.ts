export type ElementType =
  'rectangle' | 'ellipse' | 'diamond' | 'line' | 'arrow' | 'freedraw' | 'text' | 'image';
export type FillStyle = 'solid' | 'hachure' | 'cross-hatch' | 'none';
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';
export type Arrowhead = null | 'arrow' | 'bar' | 'dot';
export type ToolId =
  | 'select'
  | 'rectangle'
  | 'diamond'
  | 'ellipse'
  | 'arrow'
  | 'line'
  | 'freedraw'
  | 'eraser'
  | 'text'
  | 'image'
  | 'hand';
export interface Point {
  x: number;
  y: number;
}
export interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;
  opacity: number;
  roundness: 'sharp' | 'round';
  seed: number;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  groupIds: string[];
  locked: boolean;
}
export interface ShapeElement extends BaseElement {
  type: 'rectangle' | 'ellipse' | 'diamond';
}
export interface LinearElement extends BaseElement {
  type: 'line' | 'arrow';
  points: [number, number][];
  startArrowhead: Arrowhead;
  endArrowhead: Arrowhead;
}
export interface FreeDrawElement extends BaseElement {
  type: 'freedraw';
  points: [number, number, number?][];
  simulatePressure: boolean;
}
export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: 'hand' | 'sans' | 'mono';
  textAlign: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
  lineHeight: number;
}
export interface ImageElement extends BaseElement {
  type: 'image';
  fileId: string;
  status: 'pending' | 'loaded' | 'error';
}
export type Element = ShapeElement | LinearElement | FreeDrawElement | TextElement | ImageElement;
export interface FileRecord {
  id: string;
  mimeType: string;
  dataURL: string;
  created: number;
}
export interface StyleDefaults {
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;
  opacity: number;
  roundness: 'sharp' | 'round';
  startArrowhead: Arrowhead;
  endArrowhead: Arrowhead;
  fontFamily: 'hand' | 'sans' | 'mono';
  fontSize: number;
  textAlign: 'left' | 'center' | 'right';
}
export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}
export interface AppStateData {
  viewBackgroundColor: string;
  gridEnabled: boolean;
  activeTool: ToolId;
  toolLocked: boolean;
  selectedIds: Set<string>;
  drawingId: string | null;
  editingId: string | null;
  camera: CameraState;
  style: StyleDefaults;
  showStats: boolean;
}
export interface Scene {
  elements: Element[];
  files: Record<string, FileRecord>;
  appState: AppStateData;
}
export const DEFAULT_STYLE: StyleDefaults = {
  strokeColor: '#D8DEE9',
  backgroundColor: 'transparent',
  fillStyle: 'none',
  strokeWidth: 2,
  strokeStyle: 'solid',
  roughness: 0,
  opacity: 100,
  roundness: 'round',
  startArrowhead: null,
  endArrowhead: 'arrow',
  fontFamily: 'sans',
  fontSize: 20,
  textAlign: 'left',
};
export const DEFAULT_APP_STATE = (): AppStateData => ({
  viewBackgroundColor: '#171B24',
  gridEnabled: false,
  activeTool: 'select',
  toolLocked: false,
  selectedIds: new Set(),
  drawingId: null,
  editingId: null,
  camera: { x: 0, y: 0, zoom: 1 },
  style: { ...DEFAULT_STYLE },
  showStats: false,
});
