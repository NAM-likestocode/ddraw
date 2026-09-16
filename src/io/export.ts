import type { Element } from '../core/types';
export interface ExportOptions {
  background?: string;
  scale?: number;
  padding?: number;
}
/** Export implementation is supplied in the export phase. */
export async function exportToCanvas(
  _elements: readonly Element[],
  _opts: ExportOptions = {},
): Promise<HTMLCanvasElement> {
  throw new Error('Export is not implemented yet');
}
