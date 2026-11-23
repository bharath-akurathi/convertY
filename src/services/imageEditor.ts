import type { CompressorFormat } from './imageCompressor';
import { encodeImageData } from './imageCompressor';

export interface ImageFilters {
  brightness: number;
  contrast: number;
  saturate: number;
  grayscale: number;
  sepia: number;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Rotation = 0 | 90 | 180 | 270;

export interface ImageEdit {
  rotation: Rotation;
  flipHorizontal: boolean;
  flipVertical: boolean;
  crop: CropRect | null;
  filters: ImageFilters;
  format: CompressorFormat;
  quality: number;
}

export const DEFAULT_FILTERS: ImageFilters = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  grayscale: 0,
  sepia: 0,
};

export function getDefaultEdit(): ImageEdit {
  return {
    rotation: 0,
    flipHorizontal: false,
    flipVertical: false,
    crop: null,
    filters: { ...DEFAULT_FILTERS },
    format: 'jpeg',
    quality: 80,
  };
}

export function buildFilterString(filters: ImageFilters): string {
  return [
    `brightness(${String(filters.brightness)}%)`,
    `contrast(${String(filters.contrast)}%)`,
    `saturate(${String(filters.saturate)}%)`,
    `grayscale(${String(filters.grayscale)}%)`,
    `sepia(${String(filters.sepia)}%)`,
  ].join(' ');
}

export function rotateDimensions(
  width: number,
  height: number,
  rotation: Rotation,
): { height: number; width: number } {
  if (rotation === 90 || rotation === 270) {
    return { width: height, height: width };
  }

  return { width, height };
}

export function normalizeCropRect(
  rect: CropRect,
  imageWidth: number,
  imageHeight: number,
): CropRect {
  const x = Math.max(0, Math.min(rect.x, imageWidth));
  const y = Math.max(0, Math.min(rect.y, imageHeight));
  const width = Math.max(0, Math.min(rect.width, imageWidth - x));
  const height = Math.max(0, Math.min(rect.height, imageHeight - y));

  return { x, y, width, height };
}

export function getEditedDimensions(
  width: number,
  height: number,
  edit: ImageEdit,
): { height: number; width: number } {
  const cropped = edit.crop
    ? normalizeCropRect(edit.crop, width, height)
    : { x: 0, y: 0, width, height };

  return rotateDimensions(cropped.width, cropped.height, edit.rotation);
}

export async function applyEdits(
  bitmap: ImageBitmap,
  edit: ImageEdit,
): Promise<Blob> {
  const source = edit.crop
    ? normalizeCropRect(edit.crop, bitmap.width, bitmap.height)
    : { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
  const { width, height } = rotateDimensions(
    source.width,
    source.height,
    edit.rotation,
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D context is not available');
  }

  context.filter = buildFilterString(edit.filters);
  context.translate(width / 2, height / 2);
  context.rotate((edit.rotation * Math.PI) / 180);
  context.scale(edit.flipHorizontal ? -1 : 1, edit.flipVertical ? -1 : 1);
  context.drawImage(
    bitmap,
    source.x,
    source.y,
    source.width,
    source.height,
    -source.width / 2,
    -source.height / 2,
    source.width,
    source.height,
  );

  const imageData = context.getImageData(0, 0, width, height);
  const data = await encodeImageData(imageData, edit.format, edit.quality);

  const mimeType =
    edit.format === 'jpeg'
      ? 'image/jpeg'
      : edit.format === 'webp'
        ? 'image/webp'
        : edit.format === 'avif'
          ? 'image/avif'
          : 'image/png';

  return new Blob([data], { type: mimeType });
}
