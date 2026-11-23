import { useEffect, useRef, useState } from 'react';

import {
  type CompressorFormat,
  getCompressorExtension,
} from '../../services/imageCompressor';
import type { CropRect, ImageEdit, Rotation } from '../../services/imageEditor';
import {
  applyEdits,
  buildFilterString,
  DEFAULT_FILTERS,
  getDefaultEdit,
  normalizeCropRect,
} from '../../services/imageEditor';
import { downloadBlob } from '../../utils/download';
import { createFileUrl, isLargeFile, revokeFileUrl } from '../../utils/helpers';
import { FileDropzone } from '../FileDropzone';

interface DragPoint {
  x: number;
  y: number;
}

const FILTER_PRESETS: { label: string; filters: typeof DEFAULT_FILTERS }[] = [
  { label: 'Normal', filters: { ...DEFAULT_FILTERS } },
  {
    label: 'Grayscale',
    filters: { ...DEFAULT_FILTERS, grayscale: 100 },
  },
  {
    label: 'Sepia',
    filters: { ...DEFAULT_FILTERS, sepia: 100 },
  },
  {
    label: 'Vivid',
    filters: { ...DEFAULT_FILTERS, saturate: 150, contrast: 120 },
  },
];

export function ImageEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [edit, setEdit] = useState<ImageEdit>(() => getDefaultEdit());
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultFormat, setResultFormat] = useState<CompressorFormat>('jpeg');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<DragPoint | null>(null);
  const [cropDraft, setCropDraft] = useState<CropRect | null>(null);
  const containerRectRef = useRef<DOMRect | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const fileGenerationRef = useRef(0);

  // Release preview URLs and the decoded bitmap when the component
  // unmounts so repeated use does not leak blob URLs or image memory.
  useEffect(() => {
    return () => {
      revokeFileUrl(previewUrlRef.current);
      revokeFileUrl(resultUrlRef.current);
      bitmapRef.current?.close();
      bitmapRef.current = null;
    };
  }, []);

  async function handleFileSelect(selected: File) {
    // Guard against an older decode finishing after a newer file was
    // selected: only the latest selection may set the bitmap.
    fileGenerationRef.current += 1;
    const generation = fileGenerationRef.current;

    revokeFileUrl(previewUrlRef.current);
    revokeFileUrl(resultUrlRef.current);
    const url = createFileUrl(selected);
    previewUrlRef.current = url;
    resultUrlRef.current = null;

    setFile(selected);
    setPreviewUrl(url);
    setEdit(getDefaultEdit());
    setResultUrl(null);
    setResultBlob(null);
    setError(null);

    try {
      const image = await createImageBitmap(selected);

      if (fileGenerationRef.current !== generation) {
        image.close();
        return;
      }

      bitmapRef.current?.close();
      bitmapRef.current = image;
      setBitmap(image);
    } catch {
      if (fileGenerationRef.current !== generation) {
        return;
      }

      bitmapRef.current?.close();
      bitmapRef.current = null;
      setError('Could not read this image file.');
      setBitmap(null);
    }
  }

  function rotate(direction: 1 | -1) {
    setEdit((previous) => ({
      ...previous,
      rotation: ((((previous.rotation + direction * 90) % 360) + 360) %
        360) as Rotation,
    }));
  }

  function updateFilter(key: keyof typeof DEFAULT_FILTERS, value: number) {
    setEdit((previous) => ({
      ...previous,
      filters: { ...previous.filters, [key]: value },
    }));
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    /* v8 ignore next 3 */
    if (!bitmap) {
      return;
    }

    const target = event.currentTarget;

    // Keep receiving pointer events even if the pointer leaves the preview
    // (and make touch drags work instead of scrolling the page).
    if (typeof target.setPointerCapture === 'function') {
      target.setPointerCapture(event.pointerId);
    }

    const rect = target.getBoundingClientRect();
    containerRectRef.current = rect;
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    setDragStart(point);
    setCropDraft({ x: point.x, y: point.y, width: 0, height: 0 });
  }

  function toImageCoords(point: DragPoint): DragPoint {
    /* v8 ignore next 3 */
    if (!bitmap || !containerRectRef.current) {
      return point;
    }

    return {
      x: (point.x / containerRectRef.current.width) * bitmap.width,
      y: (point.y / containerRectRef.current.height) * bitmap.height,
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    const start = toImageCoords(dragStart);
    const end = toImageCoords(current);

    setCropDraft({
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    });
  }

  function handlePointerUp() {
    if (!dragStart || !cropDraft || !bitmap) {
      setDragStart(null);
      return;
    }

    const crop = normalizeCropRect(cropDraft, bitmap.width, bitmap.height);

    if (crop.width > 0 && crop.height > 0) {
      setEdit((previous) => ({ ...previous, crop }));
    }

    setDragStart(null);
    setCropDraft(null);
  }

  function handlePointerCancel() {
    setDragStart(null);
    setCropDraft(null);
  }

  async function handleExport() {
    /* v8 ignore next 3 */
    if (!bitmap || !file) {
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const blob = await applyEdits(bitmap, edit);
      revokeFileUrl(resultUrlRef.current);
      const url = createFileUrl(blob);
      resultUrlRef.current = url;
      setResultBlob(blob);
      // Remember the format used for this export so the download name
      // matches the exported file even if the selector changes afterwards.
      setResultFormat(edit.format);
      setResultUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsBusy(false);
    }
  }

  function handleDownload() {
    /* v8 ignore next 3 */
    if (!resultBlob || !file) {
      return;
    }

    const base = file.name.replace(/\.[^.]*$/, '') || 'image';
    downloadBlob(
      resultBlob,
      `${base}-edited.${getCompressorExtension(resultFormat)}`,
    );
  }

  const activeCrop = cropDraft ?? edit.crop;

  return (
    <div className="space-y-6 rounded-lg bg-white p-6 shadow-xs dark:bg-slate-800">
      <h2 className="text-xl font-semibold">Image editor</h2>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Crop, rotate, flip, and filter images in your browser. Drag on the
        preview to draw a crop rectangle.
      </p>

      <FileDropzone
        disabled={isBusy}
        onFileSelect={(selected) => {
          void handleFileSelect(selected);
        }}
      />

      {file && (
        <div>
          <p className="font-medium">{file.name}</p>
          {isLargeFile(file) && (
            <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
              Large file: editing may be slow or fail.
            </p>
          )}
        </div>
      )}

      {bitmap && previewUrl && (
        <div className="space-y-4">
          <div
            className="relative inline-block max-w-full cursor-crosshair touch-none overflow-hidden rounded-md"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            role="img"
            aria-label="Image preview — drag to select a crop area"
          >
            <img
              alt="Image to edit"
              className="max-h-96 max-w-full object-contain"
              draggable={false}
              src={previewUrl}
              style={{ filter: buildFilterString(edit.filters) }}
            />
            {activeCrop && (
              <div
                className="pointer-events-none absolute border-2 border-blue-500 bg-blue-500/20"
                style={{
                  left: `${String((activeCrop.x / bitmap.width) * 100)}%`,
                  top: `${String((activeCrop.y / bitmap.height) * 100)}%`,
                  width: `${String((activeCrop.width / bitmap.width) * 100)}%`,
                  height: `${String((activeCrop.height / bitmap.height) * 100)}%`,
                }}
              />
            )}
          </div>

          {edit.crop && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Crop: {Math.round(edit.crop.x)}, {Math.round(edit.crop.y)},{' '}
              {Math.round(edit.crop.width)}×{Math.round(edit.crop.height)}
              <button
                className="ml-2 cursor-pointer text-blue-600 underline hover:text-blue-500 dark:text-blue-400"
                onClick={() => {
                  setEdit((previous) => ({ ...previous, crop: null }));
                }}
                type="button"
              >
                Clear crop
              </button>
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              className="cursor-pointer rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white shadow-xs transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900"
              disabled={isBusy}
              onClick={() => {
                rotate(-1);
              }}
              type="button"
            >
              Rotate left
            </button>
            <button
              className="cursor-pointer rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white shadow-xs transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900"
              disabled={isBusy}
              onClick={() => {
                rotate(1);
              }}
              type="button"
            >
              Rotate right
            </button>
            <button
              className="cursor-pointer rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white shadow-xs transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900"
              disabled={isBusy}
              onClick={() => {
                setEdit((previous) => ({
                  ...previous,
                  flipHorizontal: !previous.flipHorizontal,
                }));
              }}
              type="button"
            >
              {edit.flipHorizontal ? 'Unflip horizontal' : 'Flip horizontal'}
            </button>
            <button
              className="cursor-pointer rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white shadow-xs transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900"
              disabled={isBusy}
              onClick={() => {
                setEdit((previous) => ({
                  ...previous,
                  flipVertical: !previous.flipVertical,
                }));
              }}
              type="button"
            >
              {edit.flipVertical ? 'Unflip vertical' : 'Flip vertical'}
            </button>
            <button
              className="cursor-pointer rounded-md bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-xs ring-1 ring-slate-300 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600"
              disabled={isBusy}
              onClick={() => {
                setEdit(getDefaultEdit());
              }}
              type="button"
            >
              Reset
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {FILTER_PRESETS.map((preset) => (
                <button
                  className="cursor-pointer rounded-md bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                  disabled={isBusy}
                  key={preset.label}
                  onClick={() => {
                    setEdit((previous) => ({
                      ...previous,
                      filters: { ...preset.filters },
                    }));
                  }}
                  type="button"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {(
              [
                ['brightness', 0, 200],
                ['contrast', 0, 200],
                ['saturate', 0, 200],
                ['grayscale', 0, 100],
                ['sepia', 0, 100],
              ] as const
            ).map(([key, min, max]) => (
              <label
                className="block text-sm font-medium text-slate-700 capitalize dark:text-slate-200"
                key={key}
              >
                {key}: {edit.filters[key]}
                <input
                  className="mt-1 block w-full"
                  disabled={isBusy}
                  max={max}
                  min={min}
                  onChange={(event) => {
                    updateFilter(key, Number(event.target.value));
                  }}
                  type="range"
                  value={edit.filters[key]}
                />
              </label>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Export format
              <select
                className="mt-1 block rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-xs focus:border-slate-500 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                disabled={isBusy}
                onChange={(event) => {
                  setEdit((previous) => ({
                    ...previous,
                    format: event.target.value as ImageEdit['format'],
                  }));
                }}
                value={edit.format}
              >
                <option value="jpeg">JPEG</option>
                <option value="webp">WebP</option>
                <option value="avif">AVIF</option>
                <option value="png">PNG</option>
              </select>
            </label>

            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Quality: {edit.quality}
              <input
                className="mt-1 block w-32"
                disabled={isBusy}
                max={100}
                min={1}
                onChange={(event) => {
                  setEdit((previous) => ({
                    ...previous,
                    quality: Number(event.target.value),
                  }));
                }}
                type="range"
                value={edit.quality}
              />
            </label>

            <button
              className="cursor-pointer rounded-md bg-slate-800 px-4 py-2 font-medium text-white shadow-xs transition-colors hover:bg-slate-700 focus:ring-2 focus:ring-slate-500 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-100"
              disabled={isBusy}
              onClick={() => {
                void handleExport();
              }}
              type="button"
            >
              {isBusy ? 'Exporting…' : 'Export'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p
          className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-200"
          role="alert"
        >
          {error}
        </p>
      )}

      {resultUrl && resultBlob && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Edited image</h3>
          <img
            alt="Edited preview"
            className="max-h-64 rounded-md object-contain"
            src={resultUrl}
          />
          <button
            className="w-full cursor-pointer rounded-md bg-green-700 px-4 py-2 font-medium text-white shadow-xs transition-colors hover:bg-green-600 focus:ring-2 focus:ring-green-500 focus:outline-hidden"
            onClick={handleDownload}
            type="button"
          >
            Download edited image
          </button>
        </div>
      )}
    </div>
  );
}
