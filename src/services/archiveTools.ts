import { unzip, zipSync } from 'fflate';

export interface ZipEntry {
  name: string;
  size: number;
  data: Uint8Array;
}

/** Largest archive file accepted for extraction (100 MB). */
export const MAX_ZIP_ARCHIVE_BYTES = 100 * 1024 * 1024;
/** Largest number of entries accepted in one archive. */
export const MAX_ZIP_ENTRIES = 1000;
/** Largest total uncompressed size accepted in one archive (500 MB). */
export const MAX_ZIP_EXTRACTED_BYTES = 500 * 1024 * 1024;

export interface ZipLimits {
  maxArchiveBytes: number;
  maxEntries: number;
  maxExtractedBytes: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxArchiveBytes: MAX_ZIP_ARCHIVE_BYTES,
  maxEntries: MAX_ZIP_ENTRIES,
  maxExtractedBytes: MAX_ZIP_EXTRACTED_BYTES,
};

export function formatZipLimit(bytes: number): string {
  return `${String(Math.round(bytes / (1024 * 1024)))} MB`;
}

/**
 * Returns a name that is not already in `used`, adding a numeric suffix
 * (for example, photo.png becomes photo-2.png) when the name collides.
 * The returned name is added to `used`.
 */
export function getUniqueZipEntryName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }

  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let index = 2;
  let candidate = `${base}-${String(index)}${ext}`;

  while (used.has(candidate)) {
    index += 1;
    candidate = `${base}-${String(index)}${ext}`;
  }

  used.add(candidate);
  return candidate;
}

export async function createZip(files: File[]): Promise<Blob> {
  const entries: Record<string, Uint8Array> = {};
  const used = new Set<string>();

  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const name = getUniqueZipEntryName(file.name, used);
    entries[name] = new Uint8Array(buffer);
  }

  return new Blob([zipSync(entries)], { type: 'application/zip' });
}

export function assertZipEntryLimits(
  entries: Record<string, Uint8Array>,
  limits: ZipLimits = DEFAULT_ZIP_LIMITS,
): void {
  const names = Object.keys(entries);

  if (names.length > limits.maxEntries) {
    throw new Error(
      `ZIP archive has too many entries (${String(names.length)}). Maximum is ${String(limits.maxEntries)}.`,
    );
  }

  let total = 0;

  for (const name of names) {
    total += entries[name].length;

    if (total > limits.maxExtractedBytes) {
      throw new Error(
        `ZIP archive expands to more than ${formatZipLimit(limits.maxExtractedBytes)} when extracted.`,
      );
    }
  }
}

export async function extractZip(
  file: File,
  limits: ZipLimits = DEFAULT_ZIP_LIMITS,
): Promise<ZipEntry[]> {
  if (file.size > limits.maxArchiveBytes) {
    throw new Error(
      `ZIP archive is too large (${formatZipLimit(file.size)}). Maximum is ${formatZipLimit(limits.maxArchiveBytes)}.`,
    );
  }

  const buffer = await file.arrayBuffer();
  const entries = await new Promise<Record<string, Uint8Array>>(
    (resolve, reject) => {
      unzip(new Uint8Array(buffer), (error, data) => {
        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      });
    },
  );

  assertZipEntryLimits(entries, limits);

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
