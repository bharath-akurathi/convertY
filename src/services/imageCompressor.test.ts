import { encode as encodeAvif } from '@jsquash/avif';
import { encode as encodeJpeg } from '@jsquash/jpeg';
import { encode as encodePng } from '@jsquash/png';
import { encode as encodeWebp } from '@jsquash/webp';

import {
  compressImage,
  compressToTargetSize,
  encodeImageData,
  getCompressorExtension,
  getCompressorMimeType,
  scaleDimensions,
  scaleImageData,
} from './imageCompressor';

vi.mock('@jsquash/jpeg', () => ({
  encode: vi.fn((_imageData: ImageData, options?: { quality?: number }) =>
    Promise.resolve(new Uint8Array((options?.quality ?? 80) * 10).buffer),
  ),
}));

vi.mock('@jsquash/webp', () => ({
  encode: vi.fn((_imageData: ImageData, options?: { quality?: number }) =>
    Promise.resolve(new Uint8Array((options?.quality ?? 80) * 10).buffer),
  ),
}));

vi.mock('@jsquash/avif', () => ({
  encode: vi.fn((_imageData: ImageData, options?: { quality?: number }) =>
    Promise.resolve(new Uint8Array((options?.quality ?? 80) * 10).buffer),
  ),
}));

vi.mock('@jsquash/png', () => ({
  // PNG ignores quality; the encoded size grows with the pixel count so
  // dimension reduction actually shrinks the output.
  encode: vi.fn((imageData: ImageData) =>
    Promise.resolve(
      new Uint8Array(
        Math.max(1, Math.round((imageData.width * imageData.height) / 1200)),
      ).buffer,
    ),
  ),
}));

const mockedJpeg = vi.mocked(encodeJpeg);
const mockedWebp = vi.mocked(encodeWebp);
const mockedAvif = vi.mocked(encodeAvif);
const mockedPng = vi.mocked(encodePng);

function createFakeBitmap(width = 800, height = 600): ImageBitmap {
  return {
    width,
    height,
    close: vi.fn(),
  };
}

function createFakeImageData(width: number, height: number): ImageData {
  return {
    data: new Uint8ClampedArray(width * height * 4),
    width,
    height,
  } as ImageData;
}

describe('imageCompressor', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.resolve(createFakeBitmap())),
    );

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag !== 'canvas') {
        return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
      }

      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: vi.fn(),
          putImageData: vi.fn(),
          getImageData: (_x: number, _y: number, w: number, h: number) =>
            createFakeImageData(w, h),
        }),
      };

      return canvas as unknown as HTMLCanvasElement;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('maps formats to MIME types and extensions', () => {
    expect(getCompressorMimeType('jpeg')).toBe('image/jpeg');
    expect(getCompressorMimeType('webp')).toBe('image/webp');
    expect(getCompressorMimeType('avif')).toBe('image/avif');
    expect(getCompressorMimeType('png')).toBe('image/png');
    expect(getCompressorExtension('jpeg')).toBe('jpg');
    expect(getCompressorExtension('webp')).toBe('webp');
    expect(getCompressorExtension('avif')).toBe('avif');
    expect(getCompressorExtension('png')).toBe('png');
  });

  it('scales dimensions down to fit the limits, keeping aspect ratio', () => {
    expect(scaleDimensions(800, 600)).toEqual({ width: 800, height: 600 });
    expect(scaleDimensions(800, 600, 400)).toEqual({
      width: 400,
      height: 300,
    });
    expect(scaleDimensions(800, 600, undefined, 300)).toEqual({
      width: 400,
      height: 300,
    });
    expect(scaleDimensions(800, 600, 400, 300)).toEqual({
      width: 400,
      height: 300,
    });
    expect(scaleDimensions(100, 100, 400, 400)).toEqual({
      width: 100,
      height: 100,
    });
  });

  it('encodes with each encoder and clamps quality to 1-100', async () => {
    const imageData = createFakeImageData(2, 2);

    await encodeImageData(imageData, 'jpeg', 150);
    expect(mockedJpeg).toHaveBeenCalledWith(imageData, { quality: 100 });

    await encodeImageData(imageData, 'webp', 0);
    expect(mockedWebp).toHaveBeenCalledWith(imageData, { quality: 1 });

    await encodeImageData(imageData, 'avif', 50);
    expect(mockedAvif).toHaveBeenCalledWith(imageData, { quality: 50 });

    await encodeImageData(imageData, 'png', 90);
    expect(mockedPng).toHaveBeenCalledWith(imageData);
  });

  it('compresses an image file with the chosen format and quality', async () => {
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const result = await compressImage(file, {
      format: 'webp',
      quality: 70,
    });

    expect(result.format).toBe('webp');
    expect(result.quality).toBe(70);
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
    expect(result.blob.type).toBe('image/webp');
    expect(result.blob.size).toBe(700);
  });

  it('scales the image down when max dimensions are given', async () => {
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const result = await compressImage(file, {
      format: 'jpeg',
      quality: 80,
      maxWidth: 400,
      maxHeight: 400,
    });

    expect(result.width).toBe(400);
    expect(result.height).toBe(300);
  });

  it('throws when the canvas 2D context is unavailable', async () => {
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag !== 'canvas') {
        return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
      }

      return {
        width: 0,
        height: 0,
        getContext: () => null,
      } as unknown as HTMLCanvasElement;
    });

    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    await expect(
      compressImage(file, { format: 'jpeg', quality: 80 }),
    ).rejects.toThrow('Canvas 2D context is not available');
  });

  it('scales decoded image data by a factor', () => {
    const imageData = createFakeImageData(800, 600);
    const scaled = scaleImageData(imageData, 0.5);

    expect(scaled.width).toBe(400);
    expect(scaled.height).toBe(300);
    expect(scaled.imageData.width).toBe(400);
    expect(scaled.imageData.height).toBe(300);
  });

  it('binary-searches quality to hit a target size', async () => {
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const result = await compressToTargetSize(file, 'jpeg', 600);

    expect(result.blob.size).toBeLessThanOrEqual(600);
    expect(result.quality).toBe(60);
    expect(result.targetMet).toBe(true);
  });

  it('falls back to quality 1 when even the lowest quality is too large', async () => {
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const result = await compressToTargetSize(file, 'jpeg', 5);

    expect(result.quality).toBe(1);
    expect(result.blob.size).toBe(10);
    expect(result.targetMet).toBe(false);
  });

  it('keeps the original PNG dimensions when it already fits', async () => {
    const result = await compressToTargetSize(
      new File([], 'photo.png'),
      'png',
      400,
    );
    expect(result).toMatchObject({ width: 800, height: 600, targetMet: true });
    expect(result.blob.size).toBe(400);
  });

  it('returns the smallest encoding when a later scale produces a larger file', async () => {
    mockedPng
      .mockResolvedValueOnce(new ArrayBuffer(15))
      .mockResolvedValueOnce(new ArrayBuffer(2))
      .mockResolvedValueOnce(new ArrayBuffer(3));
    const result = await compressToTargetSize(
      new File([], 'photo.png'),
      'png',
      1,
    );
    expect(result.blob.size).toBe(2);
    expect(result.targetMet).toBe(false);
  });

  it('shrinks PNG dimensions to hit a target size', async () => {
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const result = await compressToTargetSize(file, 'png', 350);

    // Full-size PNG is 400 bytes; at 0.9 scale (720x540) it is 324 bytes.
    expect(result.targetMet).toBe(true);
    expect(result.blob.size).toBeLessThanOrEqual(350);
    expect(result.width).toBe(720);
    expect(result.height).toBe(540);
    expect(result.quality).toBe(1);
  });

  it('reports when a PNG target size cannot be met', async () => {
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const result = await compressToTargetSize(file, 'png', 3);

    // Even the smallest scale (80x60) is 4 bytes, over the 3-byte target.
    expect(result.targetMet).toBe(false);
    expect(result.blob.size).toBe(4);
    expect(result.width).toBe(80);
    expect(result.height).toBe(60);
  });
});
