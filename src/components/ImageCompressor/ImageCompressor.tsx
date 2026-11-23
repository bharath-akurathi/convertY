import { useEffect, useRef, useState } from 'react';

import type {
  CompressedImage,
  CompressorFormat,
} from '../../services/imageCompressor';
import {
  compressImage,
  compressToTargetSize,
  getCompressorExtension,
} from '../../services/imageCompressor';
import { downloadBlob, formatBytes } from '../../utils/download';
import { createFileUrl, isLargeFile, revokeFileUrl } from '../../utils/helpers';
import { FileDropzone } from '../FileDropzone';

type CompressMode = 'quality' | 'target';

type CompressResult = CompressedImage & {
  targetMet?: boolean;
  targetKb?: number;
};

export function ImageCompressor() {
  const [file, setFile] = useState<File | null>(null);
  const [inputUrl, setInputUrl] = useState<string | null>(null);
  const [format, setFormat] = useState<CompressorFormat>('webp');
  const [quality, setQuality] = useState(80);
  const [mode, setMode] = useState<CompressMode>('quality');
  const [targetKb, setTargetKb] = useState(500);
  const [result, setResult] = useState<CompressResult | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);

  // Release preview URLs when the component unmounts so repeated use does
  // not leak blob URLs.
  useEffect(() => {
    return () => {
      revokeFileUrl(inputUrlRef.current);
      inputUrlRef.current = null;
      revokeFileUrl(resultUrlRef.current);
    };
  }, []);

  function handleFileSelect(selected: File) {
    revokeFileUrl(inputUrlRef.current);
    revokeFileUrl(resultUrlRef.current);
    const url = createFileUrl(selected);
    inputUrlRef.current = url;
    resultUrlRef.current = null;
    setFile(selected);
    setInputUrl(url);
    setResult(null);
    setResultUrl(null);
    setError(null);
  }

  async function handleCompress() {
    /* v8 ignore next 3 */
    if (!file) {
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      const compressed =
        mode === 'target'
          ? {
              ...(await compressToTargetSize(file, format, targetKb * 1024)),
              targetKb,
            }
          : await compressImage(file, { format, quality });
      if (!inputUrlRef.current) return;
      revokeFileUrl(resultUrlRef.current);
      const url = createFileUrl(compressed.blob);
      resultUrlRef.current = url;
      setResult(compressed);
      setResultUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compression failed');
    } finally {
      setIsBusy(false);
    }
  }

  function handleDownload() {
    /* v8 ignore next 3 */
    if (!result || !file) {
      return;
    }

    const base = file.name.replace(/\.[^.]*$/, '') || 'image';
    downloadBlob(
      result.blob,
      `${base}.${getCompressorExtension(result.format)}`,
    );
  }

  const savedPercent =
    file && result
      ? Math.max(0, Math.round((1 - result.blob.size / file.size) * 100))
      : 0;

  return (
    <div className="tool-surface">
      <header>
        <h2 className="tool-title">Image compressor</h2>
        <p className="tool-summary">
          Reduce image size by choosing a quality level or a target file size.
        </p>
      </header>

      <FileDropzone
        compact={Boolean(file)}
        hint="Choose an image from your device"
        disabled={isBusy}
        onFileSelect={handleFileSelect}
      />

      {file && (
        <div>
          <p className="font-medium">{file.name}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Original size: {formatBytes(file.size)}
          </p>
          {isLargeFile(file) && (
            <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
              Large file: compression may be slow or fail.
            </p>
          )}
        </div>
      )}

      {file && (
        <div className="space-y-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Output format
            <select
              className="field-control"
              disabled={isBusy}
              onChange={(event) => {
                setFormat(event.target.value as CompressorFormat);
              }}
              value={format}
            >
              <option value="jpeg">JPEG</option>
              <option value="webp">WebP</option>
              <option value="avif">AVIF</option>
              <option value="png">PNG</option>
            </select>
          </label>

          {format === 'avif' && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              AVIF encoding is slow, especially on large images. Prefer WebP for
              a faster result.
            </p>
          )}

          <fieldset>
            <legend className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Compression mode
            </legend>
            <div className="mt-2 flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={mode === 'quality'}
                  disabled={isBusy}
                  name="compress-mode"
                  onChange={() => {
                    setMode('quality');
                  }}
                  type="radio"
                  value="quality"
                />
                Quality
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={mode === 'target'}
                  disabled={isBusy}
                  name="compress-mode"
                  onChange={() => {
                    setMode('target');
                  }}
                  type="radio"
                  value="target"
                />
                Target size
              </label>
            </div>
          </fieldset>

          {mode === 'quality' ? (
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Quality: {quality}
              <input
                className="mt-1 block w-full"
                disabled={isBusy}
                max={100}
                min={1}
                onChange={(event) => {
                  setQuality(Number(event.target.value));
                }}
                type="range"
                value={quality}
              />
            </label>
          ) : (
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              Target size (KB)
              <input
                className="field-control"
                disabled={isBusy}
                min={1}
                onChange={(event) => {
                  setTargetKb(Number(event.target.value));
                }}
                type="number"
                value={targetKb}
              />
            </label>
          )}

          <button
            className="primary-action w-full"
            disabled={isBusy || (mode === 'target' && targetKb < 1)}
            onClick={() => {
              void handleCompress();
            }}
            type="button"
          >
            {isBusy ? 'Compressing…' : 'Compress'}
          </button>
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

      {result && file && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Result</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {formatBytes(file.size)} → {formatBytes(result.blob.size)} (
            {savedPercent}% smaller, {result.width}×{result.height}
            {result.targetKb !== undefined
              ? `, quality ${String(result.quality)}`
              : ''}
            )
          </p>

          {result.targetMet === false && (
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
              Could not reach {result.targetKb} KB. The smallest result was{' '}
              {formatBytes(result.blob.size)}. Try a larger target or a
              different format.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {inputUrl && (
              <div>
                <p className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-400">
                  Original
                </p>
                <img
                  alt="Original preview"
                  className="max-h-64 rounded-md object-contain"
                  src={inputUrl}
                />
              </div>
            )}
            {resultUrl && (
              <div>
                <p className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-400">
                  Compressed
                </p>
                <img
                  alt="Compressed preview"
                  className="max-h-64 rounded-md object-contain"
                  src={resultUrl}
                />
              </div>
            )}
          </div>

          <button
            className="w-full cursor-pointer rounded-md bg-green-700 px-4 py-2 font-medium text-white shadow-xs transition-colors hover:bg-green-600 focus:ring-2 focus:ring-green-500 focus:outline-hidden"
            onClick={handleDownload}
            type="button"
          >
            Download compressed image
          </button>
        </div>
      )}
    </div>
  );
}
