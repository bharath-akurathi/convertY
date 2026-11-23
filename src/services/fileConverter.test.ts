import type { ConversionOptions } from '../types/converter';
import { getDefaultOptions } from '../utils/helpers';
import type { ConversionEngine } from './fileConverter';
import { convertFile } from './fileConverter';

describe('convertFile', () => {
  const options: ConversionOptions = getDefaultOptions();

  function createEngine(
    overrides: Partial<ConversionEngine> = {},
  ): ConversionEngine {
    return {
      loaded: true,
      load: vi.fn(() => Promise.resolve()),
      convert: vi.fn(() => Promise.resolve(new Uint8Array([1, 2, 3]))),
      ...overrides,
    };
  }

  it('converts a file with the engine and returns a blob and filename', async () => {
    const engine = createEngine();
    const file = new File([], 'photo.png', { type: 'image/png' });

    const result = await convertFile(engine, file, 'jpg', 'image', options);

    expect(engine.load).not.toHaveBeenCalled();
    expect(engine.convert).toHaveBeenCalledWith(
      file,
      'photo.jpg',
      expect.arrayContaining(['-i', 'input.png']),
    );
    expect(result.filename).toBe('photo.jpg');
    expect(result.blob.type).toBe('image/jpeg');
    expect(result.blob.size).toBe(3);
  });

  it('loads the engine first when it is not loaded', async () => {
    const engine = createEngine({ loaded: false });
    const file = new File([], 'song.mp3', { type: 'audio/mpeg' });

    const result = await convertFile(engine, file, 'wav', 'audio', options);

    expect(engine.load).toHaveBeenCalled();
    expect(result.filename).toBe('song.wav');
  });

  it('uses a custom output filename when given', async () => {
    const engine = createEngine();
    const file = new File([], 'clip.mp4', { type: 'video/mp4' });

    const result = await convertFile(
      engine,
      file,
      'webm',
      'video',
      options,
      'my clip!.webm',
    );

    expect(result.filename).toBe('my_clip_.webm');
    expect(engine.convert).toHaveBeenCalledWith(
      file,
      'my_clip_.webm',
      expect.any(Array),
    );
  });

  it('falls back to a default filename when the name is empty', async () => {
    const engine = createEngine();
    const file = new File([], 'photo.png', { type: 'image/png' });

    const result = await convertFile(engine, file, 'jpg', 'image', options, '');

    expect(result.filename).toBe('output.jpg');
  });
});
