import type { ImageEdit } from './imageEditor';
import {
  applyEdits,
  buildFilterString,
  DEFAULT_FILTERS,
  getDefaultEdit,
  getEditedDimensions,
  normalizeCropRect,
  rotateDimensions,
} from './imageEditor';

vi.mock('./imageCompressor', () => ({
  encodeImageData: vi.fn(() =>
    Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
  ),
}));

function createFakeBitmap(width = 800, height = 600): ImageBitmap {
  return { width, height, close: vi.fn() };
}

function createEdit(overrides: Partial<ImageEdit> = {}): ImageEdit {
  return { ...getDefaultEdit(), ...overrides };
}

describe('imageEditor', () => {
  it('builds a CSS filter string from filter values', () => {
    expect(buildFilterString(DEFAULT_FILTERS)).toBe(
      'brightness(100%) contrast(100%) saturate(100%) grayscale(0%) sepia(0%)',
    );
    expect(
      buildFilterString({
        brightness: 120,
        contrast: 80,
        saturate: 150,
        grayscale: 100,
        sepia: 40,
      }),
    ).toBe(
      'brightness(120%) contrast(80%) saturate(150%) grayscale(100%) sepia(40%)',
    );
  });

  it('swaps dimensions for 90 and 270 degree rotations only', () => {
    expect(rotateDimensions(800, 600, 0)).toEqual({ width: 800, height: 600 });
    expect(rotateDimensions(800, 600, 90)).toEqual({ width: 600, height: 800 });
    expect(rotateDimensions(800, 600, 180)).toEqual({
      width: 800,
      height: 600,
    });
    expect(rotateDimensions(800, 600, 270)).toEqual({
      width: 600,
      height: 800,
    });
  });

  it('clamps a crop rectangle to the image bounds', () => {
    expect(
      normalizeCropRect({ x: -10, y: -5, width: 900, height: 700 }, 800, 600),
    ).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
    expect(
      normalizeCropRect({ x: 700, y: 500, width: 200, height: 200 }, 800, 600),
    ).toEqual({
      x: 700,
      y: 500,
      width: 100,
      height: 100,
    });
    expect(
      normalizeCropRect({ x: 900, y: 700, width: 10, height: 10 }, 800, 600),
    ).toEqual({
      x: 800,
      y: 600,
      width: 0,
      height: 0,
    });
  });

  it('computes edited dimensions with crop and rotation', () => {
    expect(getEditedDimensions(800, 600, createEdit())).toEqual({
      width: 800,
      height: 600,
    });
    expect(
      getEditedDimensions(
        800,
        600,
        createEdit({
          crop: { x: 0, y: 0, width: 400, height: 300 },
          rotation: 90,
        }),
      ),
    ).toEqual({ width: 300, height: 400 });
  });

  it('applies edits on canvas and encodes the result', async () => {
    const drawImage = vi.fn();
    const getImageData = vi.fn(
      (_x: number, _y: number, width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
      }),
    );
    const context = {
      drawImage,
      getImageData,
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      filter: '',
    };

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag !== 'canvas') {
        return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
      }

      return {
        width: 0,
        height: 0,
        getContext: () => context,
      } as unknown as HTMLCanvasElement;
    });

    try {
      const blob = await applyEdits(
        createFakeBitmap(),
        createEdit({
          rotation: 90,
          flipHorizontal: true,
          flipVertical: true,
          crop: { x: 10, y: 20, width: 400, height: 300 },
          format: 'webp',
          quality: 70,
        }),
      );

      expect(blob.type).toBe('image/webp');
      expect(blob.size).toBe(3);
      expect(context.rotate).toHaveBeenCalledWith(Math.PI / 2);
      expect(context.scale).toHaveBeenCalledWith(-1, -1);
      expect(drawImage).toHaveBeenCalled();
      expect(context.filter).toContain('brightness(100%)');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('maps each output format to its MIME type', async () => {
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag !== 'canvas') {
        return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
      }

      return {
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: vi.fn(),
          getImageData: (_x: number, _y: number, w: number, h: number) => ({
            data: new Uint8ClampedArray(w * h * 4),
            width: w,
            height: h,
          }),
          translate: vi.fn(),
          rotate: vi.fn(),
          scale: vi.fn(),
          filter: '',
        }),
      } as unknown as HTMLCanvasElement;
    });

    try {
      const bitmap = createFakeBitmap(10, 10);
      expect(
        (await applyEdits(bitmap, createEdit({ format: 'jpeg' }))).type,
      ).toBe('image/jpeg');
      expect(
        (await applyEdits(bitmap, createEdit({ format: 'avif' }))).type,
      ).toBe('image/avif');
      expect(
        (await applyEdits(bitmap, createEdit({ format: 'png' }))).type,
      ).toBe('image/png');
    } finally {
      vi.restoreAllMocks();
    }
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

    try {
      await expect(
        applyEdits(createFakeBitmap(), createEdit()),
      ).rejects.toThrow('Canvas 2D context is not available');
    } finally {
      vi.restoreAllMocks();
    }
  });
});
