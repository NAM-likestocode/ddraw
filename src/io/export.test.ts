import { describe, expect, it } from 'vitest';
import type { BaseElement, Element, FileRecord } from '../core/types';
import { exportToSvg } from './export';

const base = (id: string, type: BaseElement['type'], x: number, y: number): BaseElement => ({
  id,
  type,
  x,
  y,
  width: 60,
  height: 40,
  angle: 0,
  strokeColor: '#D8DEE9',
  backgroundColor: '#CD7EBF',
  fillStyle: 'solid',
  strokeWidth: 2,
  strokeStyle: 'solid',
  roughness: 0,
  opacity: 100,
  roundness: 'round',
  seed: 1,
  version: 1,
  versionNonce: 1,
  isDeleted: false,
  groupIds: [],
  locked: false,
});

describe('exportToSvg', () => {
  it('serializes every element type with dimensions based on bounds and padding', () => {
    const elements: Element[] = [
      { ...base('rect', 'rectangle', 0, 0), type: 'rectangle' },
      { ...base('ellipse', 'ellipse', 80, 0), type: 'ellipse' },
      { ...base('diamond', 'diamond', 160, 0), type: 'diamond' },
      {
        ...base('line', 'line', 0, 80),
        type: 'line',
        points: [
          [0, 0],
          [60, 40],
        ],
        startArrowhead: null,
        endArrowhead: null,
      },
      {
        ...base('arrow', 'arrow', 80, 80),
        type: 'arrow',
        points: [
          [0, 0],
          [60, 40],
        ],
        startArrowhead: 'dot',
        endArrowhead: 'arrow',
      },
      {
        ...base('draw', 'freedraw', 160, 80),
        type: 'freedraw',
        points: [
          [0, 0, 0.5],
          [30, 40, 0.5],
          [60, 0, 0.5],
        ],
        simulatePressure: true,
      },
      {
        ...base('text', 'text', 240, 0),
        type: 'text',
        text: 'Hello\nSVG',
        fontSize: 20,
        fontFamily: 'sans',
        textAlign: 'left',
        verticalAlign: 'top',
        lineHeight: 1.25,
      },
      {
        ...base('image', 'image', 400, 200),
        type: 'image',
        fileId: 'image-file',
        status: 'loaded',
      },
    ];
    const files: Record<string, FileRecord> = {
      'image-file': {
        id: 'image-file',
        mimeType: 'image/png',
        dataURL: 'data:image/png;base64,AA==',
        created: 1,
      },
    };

    const svg = exportToSvg(elements, files, { padding: 20, scale: 1, background: null });

    expect(svg).toMatch(/^<svg xmlns=/);
    expect(svg).toContain('width="500"');
    expect(svg).toContain('height="280"');
    expect(svg).toContain('<rect');
    expect(svg).toContain('<ellipse');
    expect(svg).toContain('<polygon');
    expect(svg).toContain('<polyline');
    expect(svg).toContain('<path');
    expect(svg).toContain('<text');
    expect(svg).toContain('<image');
    expect(svg).toContain('data:image/png;base64,AA==');
    expect(svg.endsWith('</svg>')).toBe(true);
  });
});
