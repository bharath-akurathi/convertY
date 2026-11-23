import { Unzip, UnzipInflate, UnzipPassThrough, zipSync } from 'fflate';

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

/** Converts an unknown thrown value to an Error. */
export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error('ZIP extraction failed.');
}

/** One entry from the ZIP central directory (the archive's index). */
export interface ZipCentralDirectoryEntry {
  name: string;
  /** Declared uncompressed size, in bytes. */
  uncompressedSize: number;
}

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

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const EOCD_SIZE = 22;
const CENTRAL_DIRECTORY_FIXED_SIZE = 46;
/** A ZIP comment can be at most 64 KiB, so the EOCD is within this range. */
const MAX_ZIP_COMMENT_BYTES = 65535;
const ZIP64_SENTINEL_16 = 0xffff;
const ZIP64_SENTINEL_32 = 0xffffffff;

/**
 * Reads the ZIP central directory (the index at the end of the archive)
 * and returns each entry's name and declared uncompressed size. This runs
 * before any decompression, so a highly-compressed archive can be rejected
 * from its declared sizes alone. Throws when the data is not a valid
 * (non-ZIP64) ZIP archive.
 */
export function readZipCentralDirectory(
  data: Uint8Array,
): ZipCentralDirectoryEntry[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // The end-of-central-directory record sits at the very end of the file,
  // optionally followed by a comment, so scan backwards for its signature.
  let eocd = -1;
  const scanStart = Math.max(
    0,
    data.length - EOCD_SIZE - MAX_ZIP_COMMENT_BYTES,
  );

  for (let i = data.length - EOCD_SIZE; i >= scanStart; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }

  if (eocd === -1) {
    throw new Error('Invalid ZIP archive: end of central directory not found.');
  }

  const totalEntries = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);

  if (totalEntries === ZIP64_SENTINEL_16 || cdOffset === ZIP64_SENTINEL_32) {
    throw new Error('ZIP64 archives are not supported.');
  }

  const entries: ZipCentralDirectoryEntry[] = [];
  let offset = cdOffset;

  for (let n = 0; n < totalEntries; n++) {
    if (
      offset + CENTRAL_DIRECTORY_FIXED_SIZE > data.length ||
      view.getUint32(offset, true) !== CENTRAL_DIRECTORY_SIGNATURE
    ) {
      throw new Error(
        'Invalid ZIP archive: central directory is truncated or corrupt.',
      );
    }

    const uncompressedSize = view.getUint32(offset + 24, true);

    if (uncompressedSize === ZIP64_SENTINEL_32) {
      throw new Error('ZIP64 archives are not supported.');
    }

    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameStart = offset + CENTRAL_DIRECTORY_FIXED_SIZE;
    const nameEnd = nameStart + nameLength;

    if (nameEnd > data.length) {
      throw new Error(
        'Invalid ZIP archive: central directory is truncated or corrupt.',
      );
    }

    entries.push({
      name: new TextDecoder().decode(data.subarray(nameStart, nameEnd)),
      uncompressedSize,
    });
    offset = nameEnd + extraLength + commentLength;
  }

  return entries;
}

/**
 * Enforces the entry-count and total-uncompressed-size limits against the
 * sizes declared in the central directory, before any decompression.
 */
export function assertZipCentralDirectoryLimits(
  entries: ZipCentralDirectoryEntry[],
  limits: ZipLimits = DEFAULT_ZIP_LIMITS,
): void {
  if (entries.length > limits.maxEntries) {
    throw new Error(
      `ZIP archive has too many entries (${String(entries.length)}). Maximum is ${String(limits.maxEntries)}.`,
    );
  }

  let total = 0;

  for (const entry of entries) {
    total += entry.uncompressedSize;

    if (total > limits.maxExtractedBytes) {
      throw new Error(
        `ZIP archive expands to more than ${formatZipLimit(limits.maxExtractedBytes)} when extracted.`,
      );
    }
  }
}

/** Compressed input is fed to the streaming decoder in chunks of this size. */
const ZIP_PUSH_CHUNK_BYTES = 64 * 1024;

/**
 * Decompresses a ZIP archive entry by entry, enforcing the limits on the
 * actual decompressed bytes as they arrive. Extraction aborts as soon as
 * the entry count or the decompressed-byte budget is exceeded, so an
 * archive whose headers understate its true size cannot keep expanding
 * unchecked. Rejects on malformed input.
 */
export function unzipWithLimits(
  data: Uint8Array,
  limits: ZipLimits = DEFAULT_ZIP_LIMITS,
): Promise<ZipEntry[]> {
  return new Promise((resolve, reject) => {
    // Validate the archive structure up front so malformed input rejects
    // instead of silently producing no entries.
    try {
      readZipCentralDirectory(data);
    } catch (err) {
      reject(toError(err));
      return;
    }

    const entries: ZipEntry[] = [];
    let filesSeen = 0;
    let totalBytes = 0;
    let settled = false;

    function fail(error: Error): void {
      /* v8 ignore start */
      if (settled) {
        return;
      }
      /* v8 ignore stop */

      settled = true;
      reject(error);
    }

    const uz = new Unzip((file) => {
      if (settled) {
        return;
      }

      filesSeen += 1;

      if (filesSeen > limits.maxEntries) {
        fail(
          new Error(
            `ZIP archive has too many entries (${String(filesSeen)}). Maximum is ${String(limits.maxEntries)}.`,
          ),
        );
        return;
      }

      const chunks: Uint8Array[] = [];

      file.ondata = (err, chunk, final) => {
        if (err) {
          fail(toError(err));
          return;
        }

        totalBytes += chunk.length;

        if (totalBytes > limits.maxExtractedBytes) {
          fail(
            new Error(
              `ZIP archive expands to more than ${formatZipLimit(limits.maxExtractedBytes)} when extracted.`,
            ),
          );
          file.terminate();
          return;
        }

        chunks.push(chunk);

        if (final) {
          const size = chunks.reduce((sum, part) => sum + part.length, 0);
          const combined = new Uint8Array(size);
          let at = 0;

          for (const part of chunks) {
            combined.set(part, at);
            at += part.length;
          }

          entries.push({ name: file.name, size, data: combined });
        }
      };

      file.start();
    });

    uz.register(UnzipPassThrough);
    uz.register(UnzipInflate);

    /* eslint-disable @typescript-eslint/no-unnecessary-condition -- `settled` is flipped by fail(), which runs inside the decoder callbacks invoked by push(); the linter cannot see that. */
    try {
      for (
        let offset = 0;
        offset < data.length && !settled;
        offset += ZIP_PUSH_CHUNK_BYTES
      ) {
        const final = offset + ZIP_PUSH_CHUNK_BYTES >= data.length;
        uz.push(
          data.subarray(
            offset,
            Math.min(offset + ZIP_PUSH_CHUNK_BYTES, data.length),
          ),
          final,
        );
      }
    } catch (err) {
      fail(toError(err));
      return;
    }

    if (!settled) {
      settled = true;
      resolve(entries);
    }
    /* eslint-enable @typescript-eslint/no-unnecessary-condition */
  });
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
  const data = new Uint8Array(buffer);

  // Enforce the limits from the central directory before decompressing
  // anything, so a highly-compressed archive is rejected up front.
  const centralEntries = readZipCentralDirectory(data);
  assertZipCentralDirectoryLimits(centralEntries, limits);

  // Decompress with incremental enforcement on the actual bytes, so an
  // archive whose headers understate its true size is caught mid-stream.
  const entries = await unzipWithLimits(data, limits);

  // Final check on the extracted data, as defense in depth.
  const record: Record<string, Uint8Array> = {};

  for (const entry of entries) {
    record[entry.name] = entry.data;
  }

  assertZipEntryLimits(record, limits);

  return entries;
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
