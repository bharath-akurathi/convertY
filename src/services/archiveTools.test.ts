import { zipSync } from 'fflate';

import type {
  ZipCentralDirectoryEntry,
  ZipEntry,
  ZipLimits,
} from './archiveTools';
import {
  assertZipCentralDirectoryLimits,
  assertZipEntryLimits,
  createZip,
  downloadZipEntry,
  extractZip,
  formatZipLimit,
  getUniqueZipEntryName,
  MAX_ZIP_ARCHIVE_BYTES,
  MAX_ZIP_ENTRIES,
  MAX_ZIP_EXTRACTED_BYTES,
  readZipCentralDirectory,
  toError,
  unzipWithLimits,
} from './archiveTools';

const SMALL_LIMITS: ZipLimits = {
  maxArchiveBytes: MAX_ZIP_ARCHIVE_BYTES,
  maxEntries: MAX_ZIP_ENTRIES,
  maxExtractedBytes: MAX_ZIP_EXTRACTED_BYTES,
};

/**
 * Returns a copy of a ZIP archive whose central directory declares a
 * different uncompressed size for one entry (the local header is left
 * untouched, so the entry still decompresses to its true size). Used to
 * simulate an archive whose headers understate its expanded size.
 */
function patchDeclaredSize(
  zip: Uint8Array,
  entryName: string,
  declaredSize: number,
): Uint8Array {
  const patched = new Uint8Array(zip);
  const view = new DataView(patched.buffer);
  const nameBytes = new TextEncoder().encode(entryName);

  for (let i = 0; i + 46 <= patched.length; i++) {
    if (view.getUint32(i, true) !== 0x02014b50) {
      continue;
    }

    const nameLength = view.getUint16(i + 28, true);
    const nameStart = i + 46;
    const name = patched.subarray(nameStart, nameStart + nameLength);

    if (
      name.length === nameBytes.length &&
      name.every((byte, index) => byte === nameBytes[index])
    ) {
      view.setUint32(i + 24, declaredSize, true);
      return patched;
    }
  }

  throw new Error(`central directory entry not found for ${entryName}`);
}

/** Finds the offset of the end-of-central-directory record. */
function findEocd(data: Uint8Array): number {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  for (let i = data.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      return i;
    }
  }

  throw new Error('end of central directory not found');
}

/**
 * Returns a copy of a ZIP archive with one 16-bit field of its
 * end-of-central-directory record replaced.
 */
function patchEocdField(
  zip: Uint8Array,
  fieldOffset: number,
  value: number,
): Uint8Array {
  const patched = new Uint8Array(zip);
  const view = new DataView(patched.buffer);
  view.setUint16(findEocd(patched) + fieldOffset, value, true);
  return patched;
}

/**
 * Returns a copy of a ZIP archive with one 32-bit field of its
 * end-of-central-directory record replaced.
 */
function patchEocdField32(
  zip: Uint8Array,
  fieldOffset: number,
  value: number,
): Uint8Array {
  const patched = new Uint8Array(zip);
  const view = new DataView(patched.buffer);
  view.setUint32(findEocd(patched) + fieldOffset, value, true);
  return patched;
}

/**
 * Returns a copy of a ZIP archive whose central directory declares a
 * much longer name for one entry than the archive actually contains.
 */
function patchNameLength(
  zip: Uint8Array,
  entryName: string,
  nameLength: number,
): Uint8Array {
  const patched = new Uint8Array(zip);
  const view = new DataView(patched.buffer);
  const nameBytes = new TextEncoder().encode(entryName);

  for (let i = 0; i + 46 <= patched.length; i++) {
    if (view.getUint32(i, true) !== 0x02014b50) {
      continue;
    }

    const length = view.getUint16(i + 28, true);
    const nameStart = i + 46;
    const name = patched.subarray(nameStart, nameStart + length);

    if (
      name.length === nameBytes.length &&
      name.every((byte, index) => byte === nameBytes[index])
    ) {
      view.setUint16(i + 28, nameLength, true);
      return patched;
    }
  }

  throw new Error(`central directory entry not found for ${entryName}`);
}

/**
 * Returns a copy of a ZIP archive with one entry's local-header
 * compression method replaced, so its decoder is unsupported.
 */
function patchLocalCompression(
  zip: Uint8Array,
  entryName: string,
  method: number,
): Uint8Array {
  const patched = new Uint8Array(zip);
  const view = new DataView(patched.buffer);
  const nameBytes = new TextEncoder().encode(entryName);

  for (let i = 0; i + 30 <= patched.length; i++) {
    if (view.getUint32(i, true) !== 0x04034b50) {
      continue;
    }

    const nameLength = view.getUint16(i + 26, true);
    const nameStart = i + 30;
    const name = patched.subarray(nameStart, nameStart + nameLength);

    if (
      name.length === nameBytes.length &&
      name.every((byte, index) => byte === nameBytes[index])
    ) {
      view.setUint16(i + 8, method, true);
      return patched;
    }
  }

  throw new Error(`local header not found for ${entryName}`);
}

/**
 * Returns a copy of a ZIP archive with one byte of an entry's compressed
 * data flipped, so its DEFLATE stream is corrupt.
 */
function corruptCompressedData(zip: Uint8Array, entryName: string): Uint8Array {
  const corrupted = new Uint8Array(zip);
  const view = new DataView(corrupted.buffer);
  const nameBytes = new TextEncoder().encode(entryName);

  for (let i = 0; i + 30 <= corrupted.length; i++) {
    if (view.getUint32(i, true) !== 0x04034b50) {
      continue;
    }

    const nameLength = view.getUint16(i + 26, true);
    const extraLength = view.getUint16(i + 28, true);
    const nameStart = i + 30;
    const name = corrupted.subarray(nameStart, nameStart + nameLength);

    if (
      name.length === nameBytes.length &&
      name.every((byte, index) => byte === nameBytes[index])
    ) {
      const dataStart = nameStart + nameLength + extraLength;
      corrupted[dataStart + 5] ^= 0xff;
      return corrupted;
    }
  }

  throw new Error(`local header not found for ${entryName}`);
}

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

  it('preserves ordinary files named like object properties', async () => {
    const zip = await createZip([
      new File(['contents'], '__proto__'),
      new File(['another'], 'constructor'),
    ]);
    const entries = await extractZip(new File([zip], 'names.zip'));
    expect(entries.map((entry) => entry.name)).toEqual([
      '__proto__',
      'constructor',
    ]);
    expect(new TextDecoder().decode(entries[0].data)).toBe('contents');
  });

  it('reports a ZIP entry name that exceeds the format limit', async () => {
    await expect(
      createZip([new File([], 'a'.repeat(65536))]),
    ).rejects.toThrow();
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

  it('rejects a highly-compressible archive from its declared size alone', async () => {
    // A 2 MB file of repeated bytes compresses to ~2 KB. The central
    // directory declares the true 2 MB size, so the pre-check rejects it
    // before any decompression when the budget is smaller.
    const big = new File(
      [new Uint8Array(2 * 1024 * 1024).fill(65)],
      'big.txt',
      { type: 'text/plain' },
    );
    const zip = await createZip([big]);

    await expect(
      extractZip(new File([zip], 'big.zip'), {
        ...SMALL_LIMITS,
        maxExtractedBytes: 1024 * 1024,
      }),
    ).rejects.toThrow('expands to more than');
  });

  describe('readZipCentralDirectory', () => {
    it('returns each entry name and declared uncompressed size', async () => {
      const zip = await createZip([
        new File(['hello'], 'hello.txt', { type: 'text/plain' }),
        new File(['world!'], 'world.txt', { type: 'text/plain' }),
      ]);
      const data = new Uint8Array(await zip.arrayBuffer());

      expect(readZipCentralDirectory(data)).toEqual([
        { name: 'hello.txt', uncompressedSize: 5 },
        { name: 'world.txt', uncompressedSize: 6 },
      ]);
    });

    it('returns an empty list for an empty archive', async () => {
      const zip = await createZip([]);
      const data = new Uint8Array(await zip.arrayBuffer());

      expect(readZipCentralDirectory(data)).toEqual([]);
    });

    it('throws when the data is not a ZIP archive', () => {
      expect(() =>
        readZipCentralDirectory(new Uint8Array([1, 2, 3, 4])),
      ).toThrow('end of central directory');
    });

    it('throws when the central directory is truncated', async () => {
      const zip = await createZip([
        new File(['hello'], 'hello.txt', { type: 'text/plain' }),
      ]);
      const data = new Uint8Array(await zip.arrayBuffer());
      // Remove the last bytes so the central directory entry is cut off.
      const truncated = data.subarray(0, data.length - 10);

      expect(() => readZipCentralDirectory(truncated)).toThrow(
        'central directory',
      );
    });

    it('throws when the central directory offset points nowhere', async () => {
      const zip = await createZip([
        new File(['hello'], 'hello.txt', { type: 'text/plain' }),
      ]);
      const data = new Uint8Array(await zip.arrayBuffer());
      // Point the central directory at the start of the file, where a
      // local file header (not a central directory entry) lives.
      const patched = patchEocdField32(data, 16, 0);

      expect(() => readZipCentralDirectory(patched)).toThrow(
        'central directory',
      );
    });

    it('throws for a ZIP64 archive', async () => {
      const zip = await createZip([
        new File(['hello'], 'hello.txt', { type: 'text/plain' }),
      ]);
      const data = new Uint8Array(await zip.arrayBuffer());
      const patched = patchEocdField(data, 10, 0xffff);

      expect(() => readZipCentralDirectory(patched)).toThrow('ZIP64');
    });

    it('throws for a ZIP64 central directory entry', async () => {
      const zip = await createZip([
        new File(['hello'], 'hello.txt', { type: 'text/plain' }),
      ]);
      const data = new Uint8Array(await zip.arrayBuffer());
      const patched = patchDeclaredSize(data, 'hello.txt', 0xffffffff);

      expect(() => readZipCentralDirectory(patched)).toThrow('ZIP64');
    });

    it('throws when an entry name runs past the end of the data', async () => {
      const zip = await createZip([
        new File(['hello'], 'hello.txt', { type: 'text/plain' }),
      ]);
      const data = new Uint8Array(await zip.arrayBuffer());
      const patched = patchNameLength(data, 'hello.txt', 60000);

      expect(() => readZipCentralDirectory(patched)).toThrow(
        'central directory',
      );
    });
  });

  describe('assertZipCentralDirectoryLimits', () => {
    const entries: ZipCentralDirectoryEntry[] = [
      { name: 'a.txt', uncompressedSize: 3 },
      { name: 'b.txt', uncompressedSize: 4 },
    ];

    it('throws when there are too many entries', () => {
      expect(() => {
        assertZipCentralDirectoryLimits(entries, {
          ...SMALL_LIMITS,
          maxEntries: 1,
        });
      }).toThrow('too many entries');
    });

    it('throws when the declared total exceeds the byte limit', () => {
      expect(() => {
        assertZipCentralDirectoryLimits(entries, {
          ...SMALL_LIMITS,
          maxExtractedBytes: 5,
        });
      }).toThrow('expands to more than');
    });

    it('accepts entries within the limits', () => {
      expect(() => {
        assertZipCentralDirectoryLimits(entries, SMALL_LIMITS);
      }).not.toThrow();
    });
  });

  describe('unzipWithLimits', () => {
    it('extracts entries with names, sizes, and data', async () => {
      const zip = await createZip([
        new File(['abc'], 'a.txt', { type: 'text/plain' }),
      ]);
      const data = new Uint8Array(await zip.arrayBuffer());

      const entries = await unzipWithLimits(data);

      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe('a.txt');
      expect(entries[0].size).toBe(3);
      expect(new TextDecoder().decode(entries[0].data)).toBe('abc');
    });

    it('rejects when the entry count exceeds the limit', async () => {
      const zip = await createZip([
        new File(['a'], 'a.txt', { type: 'text/plain' }),
        new File(['b'], 'b.txt', { type: 'text/plain' }),
      ]);
      const data = new Uint8Array(await zip.arrayBuffer());

      await expect(
        unzipWithLimits(data, { ...SMALL_LIMITS, maxEntries: 1 }),
      ).rejects.toThrow('too many entries');
    });

    it('rejects when the actual bytes exceed the limit even if the declared sizes pass', async () => {
      // Build a ZIP, then falsify the central directory so it declares a
      // much smaller size than the file really expands to. The pre-check
      // trusts the declared size, so only the streaming enforcement can
      // catch this.
      const zip = await createZip([
        new File(['x'.repeat(100)], 'a.txt', { type: 'text/plain' }),
      ]);
      const data = new Uint8Array(await zip.arrayBuffer());
      const patched = patchDeclaredSize(data, 'a.txt', 5);

      await expect(
        unzipWithLimits(patched, {
          ...SMALL_LIMITS,
          maxExtractedBytes: 50,
        }),
      ).rejects.toThrow('expands to more than');
    });

    it('rejects malformed input', async () => {
      await expect(
        unzipWithLimits(new Uint8Array([1, 2, 3, 4])),
      ).rejects.toThrow();
    });

    it('extracts an empty file', async () => {
      const zip = await createZip([
        new File([], 'empty.txt', { type: 'text/plain' }),
      ]);
      const data = new Uint8Array(await zip.arrayBuffer());

      const entries = await unzipWithLimits(data);

      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe('empty.txt');
      expect(entries[0].size).toBe(0);
      expect(entries[0].data).toHaveLength(0);
    });

    it('extracts a stored file delivered in many chunks', async () => {
      // A stored (uncompressed) entry arrives in many small chunks, so
      // the streaming code must accumulate them and only finish the entry
      // on the final chunk.
      const content = new TextEncoder().encode('abcdefgh'.repeat(20000));
      const zipped = zipSync({ 'a.txt': [content, { level: 0 }] });

      const entries = await unzipWithLimits(new Uint8Array(zipped));

      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe('a.txt');
      expect(entries[0].size).toBe(content.length);
      expect(new TextDecoder().decode(entries[0].data)).toBe(
        'abcdefgh'.repeat(20000),
      );
    });

    it('rejects when the compressed data is corrupt', async () => {
      const zip = await createZip([
        new File(
          ['hello world, this is some text to compress. '.repeat(50)],
          'a.txt',
          { type: 'text/plain' },
        ),
      ]);
      const data = new Uint8Array(await zip.arrayBuffer());
      const corrupted = corruptCompressedData(data, 'a.txt');

      await expect(unzipWithLimits(corrupted)).rejects.toThrow();
    });

    it('rejects an entry whose compression method is unsupported', async () => {
      const zip = await createZip([
        new File(['hello'], 'a.txt', { type: 'text/plain' }),
      ]);
      const data = new Uint8Array(await zip.arrayBuffer());
      // LZMA (14) has no registered decoder, so starting the entry fails.
      const patched = patchLocalCompression(data, 'a.txt', 14);

      await expect(unzipWithLimits(patched)).rejects.toThrow();
    });

    it('stops discovering entries once the count limit is exceeded', async () => {
      const zip = await createZip([
        new File(['a'], 'a.txt', { type: 'text/plain' }),
        new File(['b'], 'b.txt', { type: 'text/plain' }),
        new File(['c'], 'c.txt', { type: 'text/plain' }),
        new File(['d'], 'd.txt', { type: 'text/plain' }),
      ]);
      const data = new Uint8Array(await zip.arrayBuffer());

      await expect(
        unzipWithLimits(data, { ...SMALL_LIMITS, maxEntries: 2 }),
      ).rejects.toThrow('too many entries');
    });
  });

  describe('toError', () => {
    it('returns an Error unchanged', () => {
      const error = new Error('boom');

      expect(toError(error)).toBe(error);
    });

    it('wraps a non-Error value', () => {
      expect(toError('boom')).toBeInstanceOf(Error);
      expect(toError('boom').message).toBe('ZIP extraction failed.');
    });
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
