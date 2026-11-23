import type { ZipEntry } from './archiveTools';
import { createZip, downloadZipEntry, extractZip } from './archiveTools';

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
});
