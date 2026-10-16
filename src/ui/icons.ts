import {
  BoxSelect,
  Circle,
  createElement,
  Diamond,
  Eraser,
  FolderOpen,
  Grid3x3,
  Hand,
  Image as ImageIcon,
  ImageDown,
  Keyboard,
  Lock,
  LockOpen,
  Menu,
  Minus,
  MousePointer2,
  MoveRight,
  Network,
  Pencil,
  Plus,
  Redo2,
  Save,
  SaveAll,
  Scan,
  Share2,
  Slash,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from 'lucide';

// Named imports only, so the bundle contains just these Lucide icons.
const ICONS = {
  select: MousePointer2,
  hand: Hand,
  rectangle: Square,
  diamond: Diamond,
  ellipse: Circle,
  arrow: MoveRight,
  line: Slash,
  freedraw: Pencil,
  eraser: Eraser,
  text: Type,
  image: ImageIcon,
  mindmap: Network,
  lock: Lock,
  unlock: LockOpen,
  undo: Undo2,
  redo: Redo2,
  zoomOut: Minus,
  zoomIn: Plus,
  fit: Scan,
  selection: BoxSelect,
  menu: Menu,
  open: FolderOpen,
  save: Save,
  saveAs: SaveAll,
  export: ImageDown,
  clear: Trash2,
  grid: Grid3x3,
  share: Share2,
  shortcuts: Keyboard,
  close: X,
};

export type IconName = keyof typeof ICONS;

const STROKE_WIDTH = 1.75;

/** Decorative SVG icon (hidden from assistive tech) that takes its colour from `currentColor`. */
export function icon(name: IconName, size = 20): SVGElement {
  return createElement(ICONS[name], {
    class: 'icon',
    width: size,
    height: size,
    stroke: 'currentColor',
    'stroke-width': STROKE_WIDTH,
    'aria-hidden': 'true',
  });
}
