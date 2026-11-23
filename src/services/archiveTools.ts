import { unzipSync, zipSync } from 'fflate';

export interface ZipEntry {
  name: string;
  size: number;
  data: Uint8Array;
}

export async function createZip(files: File[]): Promise<Blob> {
  const entries: Record<string, Uint8Array> = {};

  for (const file of files) {
    const buffer = await file.arrayBuffer();
    entries[file.name] = new Uint8Array(buffer);
  }

  return new Blob([zipSync(entries)], { type: 'application/zip' });
}

export async function extractZip(file: File): Promise<ZipEntry[]> {
  const buffer = await file.arrayBuffer();
  const entries = unzipSync(new Uint8Array(buffer));

  return Object.entries(entries).map(([name, data]) => ({
    name,
    size: data.length,
    data,
  }));
}

export function downloadZipEntry(entry: ZipEntry): void {
  const blob = new Blob([entry.data as BlobPart], {
    type: 'application/octet-stream',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = entry.name;
  anchor.click();
  URL.revokeObjectURL(url);
}
