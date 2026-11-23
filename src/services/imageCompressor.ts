import { encode as encodeAvif } from '@jsquash/avif';
import { encode as encodeJpeg } from '@jsquash/jpeg';
import { encode as encodePng } from '@jsquash/png';
import { encode as encodeWebp } from '@jsquash/webp';

export type CompressorFormat = 'jpeg' | 'webp' | 'avif' | 'png';

export interface CompressOptions {
  format: CompressorFormat;
  quality: number;
  maxWidth?: number;
  maxHeight?: number;
}

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
  format: CompressorFormat;
  quality: number;
}

export function getCompressorMimeType(format: CompressorFormat): string {
  switch (format) {
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'avif':
      return 'image/avif';
    case 'png':
      return 'image/png';
  }
}

export function getCompressorExtension(format: CompressorFormat): string {
  return format === 'jpeg' ? 'jpg' : format;
}

export function scaleDimensions(
  width: number,
  height: number,
  maxWidth?: number,
  maxHeight?: number,
): { height: number; width: number } {
  const widthScale = maxWidth && width > maxWidth ? maxWidth / width : 1;
  const heightScale = maxHeight && height > maxHeight ? maxHeight / height : 1;
  const scale = Math.min(widthScale, heightScale);

  if (scale >= 1) {
    return { width, height };
  }

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function encodeImageData(
  imageData: ImageData,
  format: CompressorFormat,
  quality: number,
): Promise<ArrayBuffer> {
  const clampedQuality = Math.max(1, Math.min(100, quality));

  switch (format) {
    case 'jpeg':
      return encodeJpeg(imageData, { quality: clampedQuality });
    case 'webp':
      return encodeWebp(imageData, { quality: clampedQuality });
    case 'avif':
      return encodeAvif(imageData, { quality: clampedQuality });
    case 'png':
      return encodePng(imageData);
  }
}

function decodeToImageData(
  bitmap: ImageBitmap,
  maxWidth?: number,
  maxHeight?: number,
): { height: number; imageData: ImageData; width: number } {
  const { width, height } = scaleDimensions(
    bitmap.width,
    bitmap.height,
    maxWidth,
    maxHeight,
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D context is not available');
  }

  context.drawImage(bitmap, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  bitmap.close();

  return { imageData, width, height };
}

export async function compressImage(
  file: File,
  options: CompressOptions,
): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file);
  const { imageData, width, height } = decodeToImageData(
    bitmap,
    options.maxWidth,
    options.maxHeight,
  );
  const data = await encodeImageData(
    imageData,
    options.format,
    options.quality,
  );

  return {
    blob: new Blob([data], { type: getCompressorMimeType(options.format) }),
    width,
    height,
    format: options.format,
    quality: options.quality,
  };
}

export async function compressToTargetSize(
  file: File,
  format: CompressorFormat,
  targetBytes: number,
  maxWidth?: number,
  maxHeight?: number,
): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file);
  const { imageData, width, height } = decodeToImageData(
    bitmap,
    maxWidth,
    maxHeight,
  );

  let low = 1;
  let high = 100;
  let best: CompressedImage | null = null;

  for (let attempt = 0; attempt < 7; attempt += 1) {
    const quality = Math.floor((low + high) / 2);
    const data = await encodeImageData(imageData, format, quality);
    const blob = new Blob([data], { type: getCompressorMimeType(format) });
    const result: CompressedImage = { blob, width, height, format, quality };

    if (blob.size <= targetBytes) {
      best = result;
      low = quality + 1;
    } else {
      high = quality - 1;
    }

    if (low > high) {
      break;
    }
  }

  if (best) {
    return best;
  }

  const data = await encodeImageData(imageData, format, 1);
  return {
    blob: new Blob([data], { type: getCompressorMimeType(format) }),
    width,
    height,
    format,
    quality: 1,
  };
}
