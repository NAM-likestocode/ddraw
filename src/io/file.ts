import type {
  AppStateData,
  BaseElement,
  Element,
  ElementType,
  FileRecord,
  FillStyle,
  StrokeStyle,
} from '../core/types';
import { DEFAULT_APP_STATE, DEFAULT_STYLE } from '../core/types';
import { createId, createNonce } from '../core/ids';
export interface DdrawFile {
  type: 'ddraw';
  version: 1;
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
    version: 1,
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
      fontFamily: (str('fontFamily', 'sans') === 'Virgil' ? 'hand' : str('fontFamily', 'sans')) as
        'hand' | 'sans' | 'mono',
      textAlign: str('textAlign', 'left') as 'left' | 'center' | 'right',
      verticalAlign: str('verticalAlign', 'top') as 'top' | 'middle' | 'bottom',
      lineHeight: n('lineHeight', 1.25),
    };
  if (type === 'image') return { ...base, type, fileId: str('fileId', ''), status: 'loaded' };
  return { ...base, type } as Element;
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
