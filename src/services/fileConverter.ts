import type { ConversionOptions } from '../types/converter';
import type { Category } from '../utils/constants';
import { getMimeType } from '../utils/formats';
import {
  buildFFmpegArgs,
  getInputName,
  getOutputFilename,
  sanitizeFilename,
} from '../utils/helpers';

export interface ConversionEngine {
  loaded: boolean;
  load: () => Promise<void>;
  convert: (
    inputFile: File,
    outputName: string,
    args: string[],
  ) => Promise<Uint8Array>;
}

export interface ConvertedFile {
  blob: Blob;
  filename: string;
}

export async function convertFile(
  engine: ConversionEngine,
  file: File,
  outputFormat: string,
  category: Category,
  options: ConversionOptions,
  outputFilename?: string,
): Promise<ConvertedFile> {
  if (!engine.loaded) {
    await engine.load();
  }

  const inputName = getInputName(file);
  const outputName =
    sanitizeFilename(
      outputFilename ?? getOutputFilename(file.name, outputFormat),
    ) || `output.${outputFormat}`;
  const args = buildFFmpegArgs(inputName, outputFormat, category, options);
  const data = await engine.convert(file, outputName, args);

  return {
    blob: new Blob([data as BlobPart], { type: getMimeType(outputFormat) }),
    filename: outputName,
  };
}
