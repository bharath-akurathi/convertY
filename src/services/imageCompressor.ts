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

export interface TargetSizeResult extends CompressedImage {
  /** Whether the compressed output actually fits within the target size. */
  targetMet: boolean;
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

function get2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D context is not available');
  }

  return context;
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

  try {
    const context = get2dContext(canvas);
    context.drawImage(bitmap, 0, 0, width, height);
    return {
      imageData: context.getImageData(0, 0, width, height),
      width,
      height,
    };
  } finally {
    bitmap.close();
  }
}

/** Scales decoded image data by a factor between 0 and 1 via canvas. */
export function scaleImageData(
  imageData: ImageData,
  scale: number,
): { height: number; imageData: ImageData; width: number } {
  const width = Math.max(1, Math.round(imageData.width * scale));
  const height = Math.max(1, Math.round(imageData.height * scale));

  const source = document.createElement('canvas');
  source.width = imageData.width;
  source.height = imageData.height;
  get2dContext(source).putImageData(imageData, 0, 0);

  const target = document.createElement('canvas');
  target.width = width;
  target.height = height;
  const targetContext = get2dContext(target);
  targetContext.drawImage(source, 0, 0, width, height);

  return {
    imageData: targetContext.getImageData(0, 0, width, height),
    width,
    height,
  };
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

/** Dimension scales tried (largest first) when quality alone cannot hit the target. */
const TARGET_SIZE_SCALES = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];

export async function compressToTargetSize(
  file: File,
  format: CompressorFormat,
  targetBytes: number,
  maxWidth?: number,
  maxHeight?: number,
): Promise<TargetSizeResult> {
  const bitmap = await createImageBitmap(file);
  const { imageData } = decodeToImageData(bitmap, maxWidth, maxHeight);

  async function encode(
    pixels: ImageData,
    quality: number,
  ): Promise<CompressedImage> {
    const data = await encodeImageData(pixels, format, quality);
    return {
      blob: new Blob([data], { type: getCompressorMimeType(format) }),
      width: pixels.width,
      height: pixels.height,
      format,
      quality,
    };
  }

  let smallest = await encode(imageData, 1);
  if (smallest.blob.size <= targetBytes) {
    let best = smallest;
    if (format !== 'png') {
      let low = 2;
      let high = 100;
      while (low <= high) {
        const quality = Math.floor((low + high) / 2);
        const result = await encode(imageData, quality);
        if (result.blob.size <= targetBytes) {
          best = result;
          low = quality + 1;
        } else {
          high = quality - 1;
        }
      }
    }
    return { ...best, targetMet: true };
  }

  for (const scale of TARGET_SIZE_SCALES) {
    const scaled = scaleImageData(imageData, scale);
    const result = await encode(scaled.imageData, 1);
    if (result.blob.size <= targetBytes) {
      return { ...result, targetMet: true };
    }
    if (result.blob.size < smallest.blob.size) smallest = result;
  }
  return { ...smallest, targetMet: false };
}
