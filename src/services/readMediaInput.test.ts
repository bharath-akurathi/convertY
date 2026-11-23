import { fetchFile } from '@ffmpeg/util';

import { getInputName } from '../utils/helpers';
import { readMediaInput } from './readMediaInput';

vi.mock('@ffmpeg/util', () => ({
  fetchFile: vi.fn(() => Promise.resolve(new Uint8Array([1]))),
}));

describe('readMediaInput', () => {
  const svg = new File(['<svg/>'], 'picture.SVG');

  const decode = vi.fn<() => Promise<void>>();
  beforeEach(() => {
    decode.mockResolvedValue(undefined);
    vi.stubGlobal(
      'Image',
      class {
        decode = decode;
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('passes bitmap input through to FFmpeg', async () => {
    const file = new File([], 'photo.png');
    await readMediaInput(file);
    expect(fetchFile).toHaveBeenCalledWith(file);
  });

  it('rasterizes SVG input to PNG for the FFmpeg decoder', async () => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    const png = new Blob(['png'], { type: 'image/png' });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (callback) => {
        callback(png);
      },
    );
    expect(getInputName(svg)).toBe('input.png');
    expect(
      getInputName(new File([], 'no-extension', { type: 'image/svg+xml' })),
    ).toBe('input.png');
    await readMediaInput(svg);
    expect(drawImage).toHaveBeenCalledOnce();
    expect(fetchFile).toHaveBeenCalledWith(png);
  });

  it('releases the image URL when decoding fails', async () => {
    decode.mockRejectedValue(new Error('invalid SVG'));
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    await expect(readMediaInput(svg)).rejects.toThrow('invalid SVG');
    expect(revoke).toHaveBeenCalledWith('blob://test');
  });

  it('reports an unavailable canvas context', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(readMediaInput(svg)).rejects.toThrow('Canvas 2D context');
  });

  it('reports a failed PNG export', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (callback) => {
        callback(null);
      },
    );
    await expect(readMediaInput(svg)).rejects.toThrow(
      'Could not rasterize SVG',
    );
  });
});
