import type { Element, Point, ShapeElement, ToolId } from '../core/types';
import type { ToolContext } from '../tools/types';
import type { IconName } from '../ui/icons';
import type { MenuAction } from '../ui/menu';
import { createId } from '../core/ids';
import { childrenOf, isNode, toggleCollapsed } from '../core/mindmap';
import { alignMoves, distributeMoves, unitsOf, type Alignment, type Move } from '../core/arrange';
import {
  deleteSelection,
  duplicateSelection,
  selectionToClipboard,
  selectionWithBranches,
} from '../core/selection';
import { addChildNode, addSiblingNode, renameNode, startMindmap } from '../tools/mindmap';
import { editLabel } from '../tools/labelEditor';
import { editTextAt } from '../tools/text';
import { convertItem, kindOf } from '../core/convert';

export type ActionSection =
  'Text' | 'Mind map' | 'Edit' | 'Align' | 'Arrange' | 'Canvas' | 'Tools' | 'View' | 'File';

export interface Action {
  id: string;
  label: string | (() => string);
  section: ActionSection;
  keys?: string;
  icon?: IconName;
  /** Extra words the command palette matches. */
  keywords?: string;
  /** Which right-click menu shows the action. */
  menu?: 'selection' | 'canvas';
  enabled?(): boolean;
  /** `at` is the scene point that was right-clicked, when there is one. */
  run(at?: Point): void;
}

export interface ActionHost {
  ctx: ToolContext;
  setTool(id: ToolId): void;
  menu(name: MenuAction): void;
  zoomToFit(): void;
  zoomToSelection(): void;
  paste(text: string, at?: Point): void;
  styleDetails(): void;
}

const isShape = (el: Element | null): el is ShapeElement =>
  el?.type === 'rectangle' || el?.type === 'ellipse' || el?.type === 'diamond';

export const labelOf = (action: Action): string =>
  typeof action.label === 'string' ? action.label : action.label();

const TOOLS: [ToolId, string, string, IconName][] = [
  ['select', 'Select', 'V', 'select'],
  ['hand', 'Hand', 'H', 'hand'],
  ['rectangle', 'Rectangle', 'R', 'rectangle'],
  ['diamond', 'Diamond', 'D', 'diamond'],
  ['ellipse', 'Ellipse', 'O', 'ellipse'],
  ['arrow', 'Arrow', 'A', 'arrow'],
  ['line', 'Line', 'L', 'line'],
  ['freedraw', 'Pen', 'P', 'freedraw'],
  ['text', 'Text', 'T', 'text'],
  ['image', 'Image', 'I', 'image'],
  ['eraser', 'Eraser', 'E', 'eraser'],
  ['mindmap', 'Mind map', 'M', 'mindmap'],
];

const ALIGNMENTS: [Alignment, string, IconName][] = [
  ['left', 'Align left', 'alignLeft'],
  ['center', 'Align centre', 'alignCenter'],
  ['right', 'Align right', 'alignRight'],
  ['top', 'Align top', 'alignTop'],
  ['middle', 'Align middle', 'alignMiddle'],
  ['bottom', 'Align bottom', 'alignBottom'],
];

/** Every command, shared by the right-click menu, the command palette and shortcuts. */
export function createActions(host: ActionHost): Action[] {
  const { store, appState } = host.ctx;
  const selected = (): Element[] =>
    [...appState.value.selectedIds]
      .map((id) => store.get(id))
      .filter((e): e is Element => Boolean(e && !e.isDeleted));
  const single = () => {
    const list = selected();
    return list.length === 1 ? list[0]! : null;
  };
  const any = () => selected().length > 0;
  const units = () => unitsOf(selected()).length;
  const center = (): Point =>
    host.ctx.camera.screenToWorld({
      x: host.ctx.host.clientWidth / 2,
      y: host.ctx.host.clientHeight / 2,
    });
  const move = (moves: Map<string, Move>) => {
    if (!moves.size) return;
    store.update(moves.keys(), (el) => {
      const m = moves.get(el.id)!;
      el.x += m.dx;
      el.y += m.dy;
    });
  };
  const copy = () => {
    const text = selectionToClipboard(store, appState);
    if (text) void navigator.clipboard?.writeText(text);
  };
  const editable = () => {
    const one = single();
    return one?.type === 'text' || isShape(one);
  };

  return [
    {
      id: 'edit-text',
      label: () => (isNode(single()) ? 'Rename topic' : 'Edit text'),
      section: 'Text',
      keys: 'F2',
      icon: 'rename',
      keywords: 'label write type',
      menu: 'selection',
      enabled: editable,
      run() {
        const one = single();
        if (!one) return;
        if (isNode(one)) renameNode(host.ctx, one.id);
        else if (one.type === 'text') editTextAt(one.x, one.y, host.ctx, one);
        else if (isShape(one)) editLabel(one, host.ctx);
      },
    },
    {
      id: 'to-text',
      label: 'Turn into plain text',
      section: 'Text',
      icon: 'text',
      keywords: 'convert box shape switch',
      menu: 'selection',
      enabled: () => kindOf(single()) === 'box',
      run: () => convertItem(host.ctx.store, single()!.id, 'text', host.ctx.appState.value.style),
    },
    {
      id: 'to-box',
      label: 'Turn into a box',
      section: 'Text',
      icon: 'rectangle',
      keywords: 'convert text shape switch rectangle',
      menu: 'selection',
      enabled: () => kindOf(single()) === 'text',
      run: () => convertItem(host.ctx.store, single()!.id, 'box', host.ctx.appState.value.style),
    },
    {
      id: 'topic-child',
      label: 'Add child topic',
      section: 'Mind map',
      keys: 'Tab',
      icon: 'child',
      keywords: 'mindmap node branch',
      menu: 'selection',
      enabled: () => isNode(single()),
      run: () => addChildNode(host.ctx, single()!.id),
    },
    {
      id: 'topic-sibling',
      label: 'Add sibling topic',
      section: 'Mind map',
      keys: 'Enter',
      icon: 'sibling',
      keywords: 'mindmap node branch',
      menu: 'selection',
      enabled: () => isNode(single()),
      run: () => addSiblingNode(host.ctx, single()!.id),
    },
    {
      id: 'topic-collapse',
      label: () => {
        const one = single();
        return isNode(one) && one.mindmap.collapsed ? 'Expand branch' : 'Collapse branch';
      },
      section: 'Mind map',
      icon: 'collapse',
      keywords: 'mindmap fold hide show',
      menu: 'selection',
      enabled: () => {
        const one = single();
        return isNode(one) && childrenOf(store, one.id).length > 0;
      },
      run: () => toggleCollapsed(store, single()!.id),
    },
    {
      id: 'cut',
      label: 'Cut',
      section: 'Edit',
      keys: 'Ctrl+X',
      icon: 'cut',
      menu: 'selection',
      enabled: any,
      run() {
        copy();
        deleteSelection(store, appState);
      },
    },
    {
      id: 'copy',
      label: 'Copy',
      section: 'Edit',
      keys: 'Ctrl+C',
      icon: 'duplicate',
      menu: 'selection',
      enabled: any,
      run: copy,
    },
    {
      id: 'paste',
      label: 'Paste',
      section: 'Edit',
      keys: 'Ctrl+V',
      icon: 'paste',
      menu: 'canvas',
      enabled: () => Boolean(navigator.clipboard?.readText),
      run(at) {
        void navigator.clipboard
          .readText()
          .then((text) => text && host.paste(text, at))
          .catch(() => alert('Ddraw is not allowed to read the clipboard. Press Ctrl+V instead.'));
      },
    },
    {
      id: 'duplicate',
      label: 'Duplicate',
      section: 'Edit',
      keys: 'Ctrl+D',
      icon: 'duplicate',
      menu: 'selection',
      enabled: any,
      run: () => duplicateSelection(store, appState),
    },
    {
      id: 'delete',
      label: 'Delete',
      section: 'Edit',
      keys: 'Delete',
      icon: 'clear',
      keywords: 'remove',
      menu: 'selection',
      enabled: any,
      run: () => deleteSelection(store, appState),
    },
    ...ALIGNMENTS.map(([how, label, glyph]): Action => ({
      id: `align-${how}`,
      label,
      section: 'Align',
      icon: glyph,
      menu: 'selection',
      enabled: () => units() > 1,
      run: () => move(alignMoves(selected(), how)),
    })),
    {
      id: 'distribute-x',
      label: 'Distribute horizontally',
      section: 'Align',
      icon: 'distributeX',
      keywords: 'space evenly',
      menu: 'selection',
      enabled: () => units() > 2,
      run: () => move(distributeMoves(selected(), 'x')),
    },
    {
      id: 'distribute-y',
      label: 'Distribute vertically',
      section: 'Align',
      icon: 'distributeY',
      keywords: 'space evenly',
      menu: 'selection',
      enabled: () => units() > 2,
      run: () => move(distributeMoves(selected(), 'y')),
    },
    {
      id: 'front',
      label: 'Bring to front',
      section: 'Arrange',
      keys: 'Ctrl+Shift+]',
      icon: 'front',
      keywords: 'layer order top',
      menu: 'selection',
      enabled: any,
      run: () =>
        store.reorder(
          selectionWithBranches(store, appState).map((e) => e.id),
          'front',
        ),
    },
    {
      id: 'back',
      label: 'Send to back',
      section: 'Arrange',
      keys: 'Ctrl+Shift+[',
      icon: 'back',
      keywords: 'layer order bottom',
      menu: 'selection',
      enabled: any,
      run: () =>
        store.reorder(
          selectionWithBranches(store, appState).map((e) => e.id),
          'back',
        ),
    },
    {
      id: 'group',
      label: 'Group',
      section: 'Arrange',
      keys: 'Ctrl+G',
      icon: 'group',
      menu: 'selection',
      enabled: () => selected().length > 1,
      run() {
        const group = createId();
        store.update(appState.value.selectedIds, (el) => {
          el.groupIds = [...el.groupIds, group];
        });
      },
    },
    {
      id: 'ungroup',
      label: 'Ungroup',
      section: 'Arrange',
      keys: 'Ctrl+Shift+G',
      icon: 'ungroup',
      menu: 'selection',
      enabled: () => selected().some((e) => e.groupIds.length > 0),
      run() {
        store.update(appState.value.selectedIds, (el) => {
          el.groupIds = [];
        });
      },
    },
    {
      id: 'lock',
      label: 'Lock',
      section: 'Arrange',
      icon: 'lock',
      keywords: 'freeze pin',
      menu: 'selection',
      enabled: any,
      run() {
        store.update(appState.value.selectedIds, (el) => {
          el.locked = true;
        });
        appState.update({ selectedIds: new Set() });
      },
    },
    {
      id: 'style',
      label: 'All style options…',
      section: 'Arrange',
      icon: 'more',
      keywords: 'properties colour color stroke fill opacity font',
      menu: 'selection',
      enabled: any,
      run: () => host.styleDetails(),
    },
    {
      id: 'select-all',
      label: 'Select all',
      section: 'Canvas',
      keys: 'Ctrl+A',
      icon: 'selection',
      menu: 'canvas',
      enabled: () => store.getElements().some((e) => !e.locked),
      run: () =>
        appState.update({
          selectedIds: new Set(
            store
              .getElements()
              .filter((e) => !e.locked)
              .map((e) => e.id),
          ),
        }),
    },
    {
      id: 'new-mindmap',
      label: 'New mind map here',
      section: 'Canvas',
      icon: 'mindmap',
      keywords: 'topic idea brainstorm',
      menu: 'canvas',
      run(at) {
        host.setTool('select');
        startMindmap(host.ctx, at ?? center());
      },
    },
    {
      id: 'unlock-all',
      label: 'Unlock everything',
      section: 'Canvas',
      icon: 'unlock',
      menu: 'canvas',
      enabled: () => store.getElements().some((e) => e.locked),
      run() {
        const ids = store
          .getElements()
          .filter((e) => e.locked)
          .map((e) => e.id);
        store.update(ids, (el) => {
          el.locked = false;
        });
        appState.update({ selectedIds: new Set(ids) });
      },
    },
    {
      id: 'undo',
      label: 'Undo',
      section: 'Edit',
      keys: 'Ctrl+Z',
      icon: 'undo',
      enabled: () => store.canUndo(),
      run: () => store.undo(),
    },
    {
      id: 'redo',
      label: 'Redo',
      section: 'Edit',
      keys: 'Ctrl+Shift+Z',
      icon: 'redo',
      enabled: () => store.canRedo(),
      run: () => store.redo(),
    },
    {
      id: 'fit',
      label: 'Zoom to fit everything',
      section: 'View',
      keys: 'Shift+1',
      icon: 'fit',
      menu: 'canvas',
      enabled: () => store.getElements().length > 0,
      run: () => host.zoomToFit(),
    },
    {
      id: 'fit-selection',
      label: 'Zoom to selection',
      section: 'View',
      keys: 'Shift+2',
      icon: 'selection',
      enabled: any,
      run: () => host.zoomToSelection(),
    },
    {
      id: 'zoom-reset',
      label: 'Reset zoom',
      section: 'View',
      keys: 'Ctrl+0',
      icon: 'zoomIn',
      run: () => host.ctx.camera.reset(),
    },
    {
      id: 'grid',
      label: () => (appState.value.gridEnabled ? 'Hide grid' : 'Show grid'),
      section: 'View',
      icon: 'grid',
      menu: 'canvas',
      run: () => host.menu('grid'),
    },
    {
      id: 'shortcuts',
      label: 'Keyboard shortcuts',
      section: 'View',
      keys: '?',
      icon: 'shortcuts',
      keywords: 'help keys',
      run: () => host.menu('shortcuts'),
    },
    ...TOOLS.map(([tool, label, keys, glyph]): Action => ({
      id: `tool-${tool}`,
      label: `${label} tool`,
      section: 'Tools',
      keys,
      icon: glyph,
      run: () => host.setTool(tool),
    })),
    {
      id: 'open',
      label: 'Open…',
      section: 'File',
      keys: 'Ctrl+O',
      icon: 'open',
      run: () => host.menu('open'),
    },
    {
      id: 'save',
      label: 'Save',
      section: 'File',
      keys: 'Ctrl+S',
      icon: 'save',
      run: () => host.menu('save'),
    },
    {
      id: 'save-as',
      label: 'Save as…',
      section: 'File',
      keys: 'Ctrl+Shift+S',
      icon: 'saveAs',
      run: () => host.menu('saveAs'),
    },
    {
      id: 'export',
      label: 'Export image…',
      section: 'File',
      keys: 'Ctrl+Shift+E',
      icon: 'export',
      keywords: 'png svg picture',
      menu: 'canvas',
      run: () => host.menu('export'),
    },
    {
      id: 'share',
      label: 'Share and collaborate…',
      section: 'File',
      icon: 'share',
      keywords: 'link room live',
      run: () => host.menu('share'),
    },
    {
      id: 'clear',
      label: 'Clear canvas',
      section: 'File',
      icon: 'clear',
      keywords: 'reset new empty',
      run: () => host.menu('clear'),
    },
  ];
}
