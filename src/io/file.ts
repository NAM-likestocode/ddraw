import type {
  AppStateData,
  BaseElement,
  Binding,
  Element,
  ElementType,
  FileRecord,
  FillStyle,
  FontFamily,
  MindmapLink,
  ShapeLabel,
  StrokeStyle,
} from '../core/types';
import { DEFAULT_APP_STATE, DEFAULT_STYLE } from '../core/types';
import { createId, createNonce } from '../core/ids';
/**
 * File format version. 2 added shape labels, attached arrows and mind maps;
 * version 1 files open unchanged because those fields are optional.
 */
export const FILE_VERSION = 2;
export interface DdrawFile {
  type: 'ddraw';
  version: typeof FILE_VERSION;
  source: 'ddraw';
  elements: Element[];
  appState: { viewBackgroundColor: string; gridEnabled: boolean };
  files: Record<string, FileRecord>;
}
export function serialize(
  elements: Element[],
  appState: AppStateData,
  files: Record<string, FileRecord>,
): string {
  return JSON.stringify({
    type: 'ddraw',
    version: FILE_VERSION,
    source: 'ddraw',
    elements,
    appState: {
      viewBackgroundColor: appState.viewBackgroundColor,
      gridEnabled: appState.gridEnabled,
    },
    files,
  } satisfies DdrawFile);
}
const valid = new Set<ElementType>([
  'rectangle',
  'ellipse',
  'diamond',
  'line',
  'arrow',
  'freedraw',
  'text',
  'image',
]);
function record(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}
const font = (v: unknown): FontFamily =>
  v === 'hand' || v === 'Virgil' ? 'hand' : v === 'mono' ? 'mono' : 'sans';
function importLabel(v: unknown): ShapeLabel | undefined {
  const r = record(v);
  if (!r || typeof r.text !== 'string') return undefined;
  return {
    text: r.text,
    fontSize: typeof r.fontSize === 'number' && r.fontSize > 0 ? r.fontSize : 20,
    fontFamily: font(r.fontFamily),
  };
}
function importMindmap(v: unknown): MindmapLink | undefined {
  const r = record(v);
  if (!r || typeof r.rootId !== 'string') return undefined;
  return {
    rootId: r.rootId,
    parentId: typeof r.parentId === 'string' ? r.parentId : null,
    side: r.side === 'left' ? 'left' : 'right',
    order: typeof r.order === 'number' ? r.order : 0,
    collapsed: r.collapsed === true,
    color: typeof r.color === 'string' ? r.color : DEFAULT_STYLE.strokeColor,
  };
}
function importBinding(v: unknown): Binding | null {
  const r = record(v);
  return r && typeof r.elementId === 'string' ? { elementId: r.elementId } : null;
}
function importElement(v: unknown): Element | null {
  const r = record(v);
  const type = r?.type;
  if (!r || typeof type !== 'string' || !valid.has(type as ElementType)) return null;
  const n = (key: string, fallback = 0) =>
    typeof r[key] === 'number' ? (r[key] as number) : fallback;
  const str = (key: string, fallback: string) =>
    typeof r[key] === 'string' ? (r[key] as string) : fallback;
  const fill = str('fillStyle', 'none');
  const stroke = str('strokeStyle', 'solid');
  const round =
    r.roundness === 'round' || (typeof r.roundness === 'object' && r.roundness !== null);
  const base: BaseElement = {
    id: str('id', createId()),
    type: type as ElementType,
    x: n('x'),
    y: n('y'),
    width: n('width'),
    height: n('height'),
    angle: n('angle'),
    strokeColor: str('strokeColor', DEFAULT_STYLE.strokeColor),
    backgroundColor: str('backgroundColor', 'transparent'),
    fillStyle: (['solid', 'hachure', 'cross-hatch', 'none'].includes(fill)
      ? fill
      : 'none') as FillStyle,
    strokeWidth: n('strokeWidth', 2),
    strokeStyle: (['solid', 'dashed', 'dotted'].includes(stroke) ? stroke : 'solid') as StrokeStyle,
    roughness: n('roughness'),
    opacity: n('opacity', 100),
    roundness: round ? 'round' : 'sharp',
    seed: n('seed', createNonce()),
    version: n('version', 1),
    versionNonce: n('versionNonce', createNonce()),
    isDeleted: Boolean(r.isDeleted),
    groupIds: Array.isArray(r.groupIds)
      ? (r.groupIds.filter((x) => typeof x === 'string') as string[])
      : [],
    locked: Boolean(r.locked),
  };
  if (type === 'line' || type === 'arrow')
    return {
      ...base,
      type,
      points: Array.isArray(r.points)
        ? (r.points as [number, number][])
        : [
            [0, 0],
            [base.width, base.height],
          ],
      startArrowhead: (r.startArrowhead ?? null) as null | 'arrow' | 'bar' | 'dot',
      endArrowhead: (r.endArrowhead ?? (type === 'arrow' ? 'arrow' : null)) as
        null | 'arrow' | 'bar' | 'dot',
      startBinding: importBinding(r.startBinding),
      endBinding: importBinding(r.endBinding),
    };
  if (type === 'freedraw')
    return {
      ...base,
      type,
      points: Array.isArray(r.points) ? (r.points as [number, number, number?][]) : [],
      simulatePressure: r.simulatePressure !== false,
    };
  if (type === 'text')
    return {
      ...base,
      type,
      text: str('text', ''),
      fontSize: n('fontSize', 20),
      fontFamily: font(r.fontFamily),
      textAlign: str('textAlign', 'left') as 'left' | 'center' | 'right',
      verticalAlign: str('verticalAlign', 'top') as 'top' | 'middle' | 'bottom',
      lineHeight: n('lineHeight', 1.25),
    };
  if (type === 'image') return { ...base, type, fileId: str('fileId', ''), status: 'loaded' };
  const label = importLabel(r.label);
  const mindmap = importMindmap(r.mindmap);
  return {
    ...base,
    type: type as 'rectangle' | 'ellipse' | 'diamond',
    ...(label && { label }),
    ...(mindmap && { mindmap }),
  };
}
export function deserialize(json: string): {
  elements: Element[];
  appState: AppStateData;
  files: Record<string, FileRecord>;
} {
  const root = record(JSON.parse(json));
  if (!root) throw new Error('Invalid drawing file');
  if (root.type !== 'ddraw' && root.type !== 'excalidraw')
    throw new Error('Unsupported drawing file');
  if (root.type === 'ddraw' && typeof root.version === 'number' && root.version > FILE_VERSION)
    throw new Error(
      'This drawing was made with a newer version of Ddraw. Update Ddraw to open it.',
    );
  const elements = (Array.isArray(root.elements) ? root.elements : [])
    .map(importElement)
    .filter((e): e is Element => e !== null);
  const state = DEFAULT_APP_STATE();
  const saved = record(root.appState);
  if (saved) {
    if (typeof saved.viewBackgroundColor === 'string')
      state.viewBackgroundColor = saved.viewBackgroundColor;
    if (typeof saved.gridEnabled === 'boolean') state.gridEnabled = saved.gridEnabled;
  }
  const files = (record(root.files) ?? {}) as Record<string, FileRecord>;
  return { elements, appState: state, files };
}
