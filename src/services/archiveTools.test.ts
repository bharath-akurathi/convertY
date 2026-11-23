import type { ZipEntry, ZipLimits } from './archiveTools';
import {
  assertZipEntryLimits,
  createZip,
  downloadZipEntry,
  extractZip,
  formatZipLimit,
  getUniqueZipEntryName,
  MAX_ZIP_ARCHIVE_BYTES,
  MAX_ZIP_ENTRIES,
  MAX_ZIP_EXTRACTED_BYTES,
} from './archiveTools';

const SMALL_LIMITS: ZipLimits = {
  maxArchiveBytes: MAX_ZIP_ARCHIVE_BYTES,
  maxEntries: MAX_ZIP_ENTRIES,
  maxExtractedBytes: MAX_ZIP_EXTRACTED_BYTES,
};

describe('archiveTools', () => {
  it('creates a ZIP containing the given files', async () => {
    const files = [
      new File(['hello'], 'hello.txt', { type: 'text/plain' }),
      new File(['world'], 'world.txt', { type: 'text/plain' }),
    ];

    const zip = await createZip(files);
    expect(zip.type).toBe('application/zip');
    expect(zip.size).toBeGreaterThan(0);

    const extracted = await extractZip(new File([zip], 'out.zip'));
    expect(extracted.map((entry) => entry.name).sort()).toEqual([
      'hello.txt',
      'world.txt',
    ]);
    expect(new TextDecoder().decode(extracted[0].data)).toBe('hello');
  });

  it('creates an empty ZIP when no files are given', async () => {
    const zip = await createZip([]);
    expect(zip.type).toBe('application/zip');
    const extracted = await extractZip(new File([zip], 'empty.zip'));
    expect(extracted).toEqual([]);
  });

  it('keeps both files when two inputs share a name', async () => {
    const files = [
      new File(['first'], 'photo.png', { type: 'image/png' }),
      new File(['second'], 'photo.png', { type: 'image/png' }),
    ];

    const zip = await createZip(files);
    const extracted = await extractZip(new File([zip], 'out.zip'));
    const byName = new Map(
      extracted.map((entry) => [
        entry.name,
        new TextDecoder().decode(entry.data),
      ]),
    );

    expect([...byName.keys()].sort()).toEqual(['photo-2.png', 'photo.png']);
    expect(byName.get('photo.png')).toBe('first');
    expect(byName.get('photo-2.png')).toBe('second');
  });

  it('extracts entries with names, sizes, and data', async () => {
    const zip = await createZip([
      new File(['abc'], 'a.txt', { type: 'text/plain' }),
    ]);
    const entries = await extractZip(new File([zip], 'a.zip'));

    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('a.txt');
    expect(entries[0].size).toBe(3);
    expect(entries[0].data).toBeInstanceOf(Uint8Array);
  });

  it('rejects an archive that exceeds the size limit', async () => {
    const zip = await createZip([
      new File(['abc'], 'a.txt', { type: 'text/plain' }),
    ]);

    await expect(
      extractZip(new File([zip], 'a.zip'), {
        ...SMALL_LIMITS,
        maxArchiveBytes: 1,
      }),
    ).rejects.toThrow('too large');
  });

  it('rejects an archive with too many entries', async () => {
    const zip = await createZip([
      new File(['a'], 'a.txt', { type: 'text/plain' }),
      new File(['b'], 'b.txt', { type: 'text/plain' }),
    ]);

    await expect(
      extractZip(new File([zip], 'a.zip'), {
        ...SMALL_LIMITS,
        maxEntries: 1,
      }),
    ).rejects.toThrow('too many entries');
  });

  it('rejects an archive that expands past the byte limit', async () => {
    const zip = await createZip([
      new File(['abcdef'], 'a.txt', { type: 'text/plain' }),
    ]);

    await expect(
      extractZip(new File([zip], 'a.zip'), {
        ...SMALL_LIMITS,
        maxExtractedBytes: 5,
      }),
    ).rejects.toThrow('expands to more than');
  });

  it('rejects data that is not a ZIP archive', async () => {
    const bad = new File([new Uint8Array([1, 2, 3, 4])], 'bad.zip');

    await expect(extractZip(bad)).rejects.toThrow();
  });

  it('downloads a single ZIP entry via an anchor click', () => {
    const click = vi.fn();
    const revokeObjectURL = vi.fn();
    globalThis.URL.revokeObjectURL = revokeObjectURL;
    const createElement = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        if (tag === 'a') {
          return { click } as unknown as HTMLAnchorElement;
        }
        return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
      });

    try {
      const entry: ZipEntry = {
        name: 'a.txt',
        size: 3,
        data: new Uint8Array([97, 98, 99]),
      };
      downloadZipEntry(entry);
      expect(click).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalled();
    } finally {
      createElement.mockRestore();
    }
  });

  describe('getUniqueZipEntryName', () => {
    it('returns the name unchanged when it is unused', () => {
      expect(getUniqueZipEntryName('photo.png', new Set())).toBe('photo.png');
    });

    it('adds a -2 suffix on collision', () => {
      expect(getUniqueZipEntryName('photo.png', new Set(['photo.png']))).toBe(
        'photo-2.png',
      );
    });

    it('increments the suffix until the name is unique', () => {
      expect(
        getUniqueZipEntryName(
          'photo.png',
          new Set(['photo.png', 'photo-2.png']),
        ),
      ).toBe('photo-3.png');
    });

    it('handles names without an extension', () => {
      expect(getUniqueZipEntryName('archive', new Set(['archive']))).toBe(
        'archive-2',
      );
    });
  });

  describe('assertZipEntryLimits', () => {
    it('throws when there are too many entries', () => {
      expect(() => {
        assertZipEntryLimits(
          { 'a.txt': new Uint8Array([1]), 'b.txt': new Uint8Array([2]) },
          { ...SMALL_LIMITS, maxEntries: 1 },
        );
      }).toThrow('too many entries');
    });

    it('throws when the total uncompressed size is too large', () => {
      expect(() => {
        assertZipEntryLimits(
          { 'a.txt': new Uint8Array([1, 2, 3]) },
          { ...SMALL_LIMITS, maxExtractedBytes: 2 },
        );
      }).toThrow('expands to more than');
    });

    it('accepts entries within the limits', () => {
      expect(() => {
        assertZipEntryLimits({ 'a.txt': new Uint8Array([1, 2, 3]) });
      }).not.toThrow();
    });
  });

  describe('formatZipLimit', () => {
    it('formats whole megabytes', () => {
      expect(formatZipLimit(100 * 1024 * 1024)).toBe('100 MB');
      expect(formatZipLimit(500 * 1024 * 1024)).toBe('500 MB');
    });
  });
});
