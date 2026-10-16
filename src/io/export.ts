import { getStroke } from 'perfect-freehand';
import { selectionBounds } from '../core/geometry';
import type { Arrowhead, Element, FileRecord, FreeDrawElement, LinearElement } from '../core/types';
import { RenderCache } from '../render/cache';
import { drawElement } from '../render/shapes';
import { sketchFor } from '../render/sketch';
import type { Sketch } from '../render/sketch';
import { fontFamily } from '../render/fonts';

export interface ExportOptions {
  background?: string | null;
  scale?: 1 | 2 | 3;
  padding?: number;
  selectionOnly?: boolean;
}

function exportMetrics(elements: readonly Element[], options: ExportOptions) {
  const padding = options.padding ?? 20;
  const scale = options.scale ?? 1;
  const bounds = selectionBounds(elements) ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const width = Math.max(1, Math.ceil((bounds.maxX - bounds.minX + padding * 2) * scale));
  const height = Math.max(1, Math.ceil((bounds.maxY - bounds.minY + padding * 2) * scale));
  return { bounds, padding, scale, width, height };
}

/** Render an export using the same canvas renderer as the editor. */
export async function exportToCanvas(
  elements: readonly Element[],
  files: Record<string, FileRecord>,
  options: ExportOptions = {},
): Promise<HTMLCanvasElement> {
  const metrics = exportMetrics(elements, options);
  const canvas = document.createElement('canvas');
  canvas.width = metrics.width;
  canvas.height = metrics.height;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('Canvas export is not supported');
  if (options.background) {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const cache = new RenderCache();
  const imageFiles = elements
    .filter((element) => element.type === 'image')
    .map((element) => files[element.fileId])
    .filter((file): file is FileRecord => Boolean(file));
  await cache.preload(imageFiles);
  const camera = {
    x: (metrics.padding - metrics.bounds.minX) * metrics.scale,
    y: (metrics.padding - metrics.bounds.minY) * metrics.scale,
    zoom: metrics.scale,
  };
  for (const element of elements) {
    drawElement(
      ctx,
      element,
      camera,
      1,
      cache,
      files[element.type === 'image' ? element.fileId : ''],
      () => undefined,
    );
  }
  return canvas;
}

const escapeXml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    };
    return entities[character]!;
  });

const number = (value: number): string => Number(value.toFixed(3)).toString();

function rotation(element: Element): string {
  if (!element.angle) return '';
  const cx = element.x + element.width / 2;
  const cy = element.y + element.height / 2;
  return ` transform="rotate(${number((element.angle * 180) / Math.PI)} ${number(cx)} ${number(cy)})"`;
}

function paint(element: Element): string {
  const dash =
    element.strokeStyle === 'dashed'
      ? ' stroke-dasharray="10 8"'
      : element.strokeStyle === 'dotted'
        ? ' stroke-dasharray="2 6" stroke-linecap="round"'
        : '';
  const fill = element.fillStyle === 'none' ? 'none' : element.backgroundColor;
  return `stroke="${escapeXml(element.strokeColor)}" stroke-width="${number(element.strokeWidth)}" stroke-linejoin="${element.roundness === 'round' ? 'round' : 'miter'}" fill="${escapeXml(fill)}" opacity="${number(element.opacity / 100)}"${dash}`;
}

/** Sketchy shapes: one SVG path per rough.js path, with the same data the canvas uses. */
function sketchSvg(element: Element, sketch: Sketch): string {
  const dash =
    element.strokeStyle === 'dashed'
      ? ' stroke-dasharray="10 8"'
      : element.strokeStyle === 'dotted'
        ? ' stroke-dasharray="2 6"'
        : '';
  const join = element.roundness === 'round' ? 'round' : 'miter';
  const opacity = number(element.opacity / 100);
  const paths = sketch.paths
    .map(
      (part) =>
        `<path d="${part.d}" fill="${escapeXml(part.fill)}" stroke="${escapeXml(part.stroke)}" stroke-width="${number(part.strokeWidth)}" stroke-linecap="round" stroke-linejoin="${join}" opacity="${opacity}"${part.dashed ? dash : ''}/>`,
    )
    .join('');
  return `<g${rotation(element)}>${paths}</g>`;
}

function outlineFor(element: FreeDrawElement): number[][] {
  return getStroke(
    element.points.map((point) => [point[0], point[1], point[2] ?? 0.5]),
    {
      size: element.strokeWidth * 2.2,
      simulatePressure: element.simulatePressure,
      smoothing: 0.5,
      streamline: 0.5,
    },
  );
}

function arrowheadPath(
  type: Arrowhead,
  tip: [number, number],
  previous: [number, number],
  width: number,
  color: string,
): string {
  if (!type) return '';
  const angle = Math.atan2(tip[1] - previous[1], tip[0] - previous[0]);
  const size = 8 + width * 2;
  const transform = `translate(${number(tip[0])} ${number(tip[1])}) rotate(${number((angle * 180) / Math.PI)})`;
  if (type === 'dot') {
    const radius = size / 3;
    return `<path d="M ${number(-radius)} 0 a ${number(radius)} ${number(radius)} 0 1 0 ${number(radius * 2)} 0 a ${number(radius)} ${number(radius)} 0 1 0 ${number(-radius * 2)} 0" fill="${escapeXml(color)}" transform="${transform}"/>`;
  }
  const d =
    type === 'bar'
      ? `M 0 ${number(-size / 2)} L 0 ${number(size / 2)}`
      : `M ${number(-size)} ${number(-size / 2)} L 0 0 L ${number(-size)} ${number(size / 2)}`;
  return `<path d="${d}" fill="none" stroke="${escapeXml(color)}" stroke-width="${number(width)}" stroke-linecap="round" stroke-linejoin="round" transform="${transform}"/>`;
}

function linearSvg(element: LinearElement): string {
  const points = element.points.map(
    (point) => [element.x + point[0], element.y + point[1]] as [number, number],
  );
  const pointText = points.map((point) => `${number(point[0])},${number(point[1])}`).join(' ');
  let heads = '';
  if (points.length > 1) {
    heads += arrowheadPath(
      element.startArrowhead,
      points[0]!,
      points[1]!,
      element.strokeWidth,
      element.strokeColor,
    );
    heads += arrowheadPath(
      element.endArrowhead,
      points.at(-1)!,
      points.at(-2)!,
      element.strokeWidth,
      element.strokeColor,
    );
  }
  return `<g${rotation(element)} opacity="${number(element.opacity / 100)}"><polyline points="${pointText}" ${paint({ ...element, opacity: 100, fillStyle: 'none' })}/>${heads}</g>`;
}

/** Generate SVG without depending on the DOM, so it is also usable in tests and desktop code. */
export function exportToSvg(
  elements: readonly Element[],
  files: Record<string, FileRecord>,
  options: ExportOptions = {},
): string {
  const metrics = exportMetrics(elements, options);
  const viewX = metrics.bounds.minX - metrics.padding;
  const viewY = metrics.bounds.minY - metrics.padding;
  const viewWidth = metrics.width / metrics.scale;
  const viewHeight = metrics.height / metrics.scale;
  const body: string[] = [];
  if (options.background)
    body.push(
      `<rect x="${number(viewX)}" y="${number(viewY)}" width="${number(viewWidth)}" height="${number(viewHeight)}" fill="${escapeXml(options.background)}"/>`,
    );

  for (const element of elements) {
    const sketch = sketchFor(element);
    if (sketch) {
      body.push(sketchSvg(element, sketch));
    } else if (element.type === 'rectangle') {
      const radius =
        element.roundness === 'round'
          ? Math.min(12, Math.abs(element.width) / 4, Math.abs(element.height) / 4)
          : 0;
      body.push(
        `<rect x="${number(element.x)}" y="${number(element.y)}" width="${number(element.width)}" height="${number(element.height)}"${radius ? ` rx="${number(radius)}"` : ''} ${paint(element)}${rotation(element)}/>`,
      );
    } else if (element.type === 'ellipse') {
      body.push(
        `<ellipse cx="${number(element.x + element.width / 2)}" cy="${number(element.y + element.height / 2)}" rx="${number(Math.abs(element.width / 2))}" ry="${number(Math.abs(element.height / 2))}" ${paint(element)}${rotation(element)}/>`,
      );
    } else if (element.type === 'diamond') {
      const points = `${number(element.x + element.width / 2)},${number(element.y)} ${number(element.x + element.width)},${number(element.y + element.height / 2)} ${number(element.x + element.width / 2)},${number(element.y + element.height)} ${number(element.x)},${number(element.y + element.height / 2)}`;
      body.push(`<polygon points="${points}" ${paint(element)}${rotation(element)}/>`);
    } else if (element.type === 'line' || element.type === 'arrow') {
      body.push(linearSvg(element));
    } else if (element.type === 'freedraw') {
      const outline = outlineFor(element);
      const first = outline[0];
      const path = first
        ? `M ${number(element.x + first[0]!)} ${number(element.y + first[1]!)} ${outline
            .slice(1)
            .map((point) => `L ${number(element.x + point[0]!)} ${number(element.y + point[1]!)}`)
            .join(' ')} Z`
        : '';
      body.push(
        `<path d="${path}" fill="${escapeXml(element.strokeColor)}" opacity="${number(element.opacity / 100)}"${rotation(element)}/>`,
      );
    } else if (element.type === 'text') {
      const family = fontFamily(element.fontFamily);
      const x =
        element.textAlign === 'left'
          ? element.x
          : element.textAlign === 'center'
            ? element.x + element.width / 2
            : element.x + element.width;
      const anchor =
        element.textAlign === 'left' ? 'start' : element.textAlign === 'center' ? 'middle' : 'end';
      const lines = element.text
        .split('\n')
        .map(
          (line, lineIndex) =>
            `<tspan x="${number(x)}" y="${number(element.y + lineIndex * element.fontSize * element.lineHeight)}">${escapeXml(line)}</tspan>`,
        )
        .join('');
      body.push(
        `<text font-family="${escapeXml(family)}" font-size="${number(element.fontSize)}" text-anchor="${anchor}" dominant-baseline="text-before-edge" fill="${escapeXml(element.strokeColor)}" opacity="${number(element.opacity / 100)}"${rotation(element)}>${lines}</text>`,
      );
    } else if (element.type === 'image') {
      const file = files[element.fileId];
      body.push(
        `<image x="${number(element.x)}" y="${number(element.y)}" width="${number(element.width)}" height="${number(element.height)}" href="${escapeXml(file?.dataURL ?? '')}" opacity="${number(element.opacity / 100)}"${rotation(element)}/>`,
      );
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${metrics.width}" height="${metrics.height}" viewBox="${number(viewX)} ${number(viewY)} ${number(viewWidth)} ${number(viewHeight)}">${body.join('')}</svg>`;
}
