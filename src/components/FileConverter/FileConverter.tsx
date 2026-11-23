import {
  AudioLines,
  ChevronDown,
  Clapperboard,
  FileCheck2,
  FlaskConical,
  Image as ImageIcon,
  Layers2,
  SlidersHorizontal,
} from 'lucide-react';
import { useState } from 'react';

import { useConverter } from '../../hooks/useConverter';
import { formatBytes } from '../../utils/download';
import { getOutputFormats } from '../../utils/formats';
import { BatchQueue } from '../BatchQueue';
import { ConversionProgress } from '../ConversionProgress';
import { FileDropzone } from '../FileDropzone';
import { FormatSelector } from '../FormatSelector';
import { OptionsPanel } from '../OptionsPanel';

const FORMAT_GROUPS = [
  {
    category: 'image',
    label: 'Image outputs',
    icon: ImageIcon,
    color: 'bg-[#e7eedc] text-[#446444] dark:bg-[#334835] dark:text-[#c2dcb5]',
  },
  {
    category: 'video',
    label: 'Video outputs',
    icon: Clapperboard,
    color: 'bg-[#f3e4d9] text-[#80513b] dark:bg-[#4d382e] dark:text-[#efc2a7]',
  },
  {
    category: 'audio',
    label: 'Audio outputs',
    icon: AudioLines,
    color: 'bg-[#eae4f1] text-[#695681] dark:bg-[#41384f] dark:text-[#d4c4e6]',
  },
] as const;

export function FileConverter() {
  const converter = useConverter();
  const [downloaded, setDownloaded] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);

  const isBusy =
    converter.status === 'loading' || converter.status === 'converting';

  async function handleSampleFile() {
    setSampleError(null);

    try {
      const response = await fetch(`${import.meta.env.BASE_URL}sample.png`);

      if (!response.ok) {
        throw new Error('Sample file could not be loaded');
      }

      const blob = await response.blob();
      converter.setFile(new File([blob], 'sample.png', { type: 'image/png' }));
    } catch {
      setSampleError(
        'Could not load the sample file. Please upload your own file instead.',
      );
    }
  }

  function handleDownload() {
    converter.download();
    setDownloaded(true);
    window.setTimeout(() => {
      setDownloaded(false);
    }, 2000);
  }

  function renderPreview(
    url: string | null,
    label: string,
    category = converter.category,
  ) {
    /* v8 ignore next 3 */
    if (!url) {
      return null;
    }

    /* v8 ignore next 3 */
    if (!category) {
      return null;
    }

    if (category === 'image') {
      return (
        <img
          alt={label}
          className="max-h-64 rounded-md object-contain"
          src={url}
        />
      );
    }

    if (category === 'video') {
      return (
        <video
          className="max-h-64 w-full rounded-md"
          controls
          preload="metadata"
          src={url}
        />
      );
    }

    return <audio className="w-full" controls preload="metadata" src={url} />;
  }

  return (
    <div className="space-y-4">
      <div className="tool-surface">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1">
          <h2 className="tool-title">File converter</h2>
          <p className="tool-summary col-span-2 row-start-2">
            Choose an output format and adjust the settings for your file.
          </p>
          <label className="relative col-start-2 row-start-1 flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold sm:px-3 sm:text-sm dark:border-slate-600 dark:bg-slate-800">
            <Layers2
              aria-hidden="true"
              size={15}
              className="hidden text-slate-600 sm:block dark:text-slate-300"
            />
            <span>
              Batch
              <span className="sr-only min-[380px]:not-sr-only">{' mode'}</span>
            </span>
            <input
              className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              aria-label="Batch mode"
              checked={batchMode}
              disabled={isBusy}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                setBatchMode(event.target.checked);
              }}
              type="checkbox"
            />
            <span
              aria-hidden="true"
              className="peer-checked:bg-pine-700 peer-focus-visible:outline-pine-600 dark:peer-checked:bg-pine-600 relative h-4.5 w-8 rounded-full bg-slate-300 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-disabled:opacity-50 after:absolute after:top-0.5 after:left-0.5 after:size-3.5 after:rounded-full after:bg-white after:shadow-xs after:transition-transform peer-checked:after:translate-x-3.5 dark:bg-slate-600"
            />
          </label>
        </div>
        {batchMode ? (
          <BatchQueue />
        ) : (
          <>
            {converter.file ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="bg-pine-100 text-pine-800 dark:text-pine-200 flex size-10 shrink-0 items-center justify-center rounded-xl dark:bg-slate-700">
                    <FileCheck2 size={19} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold [overflow-wrap:anywhere]">
                      {converter.file.name}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {formatBytes(converter.file.size)}
                    </p>
                  </div>
                </div>
                <FileDropzone
                  disabled={isBusy}
                  compact
                  onFileSelect={converter.setFile}
                />
                {converter.isLargeFile && (
                  <p className="basis-full text-sm text-amber-700 dark:text-amber-400">
                    Large file: conversion may be slow or fail.
                  </p>
                )}
              </div>
            ) : (
              <>
                <FileDropzone
                  disabled={isBusy}
                  onFileSelect={converter.setFile}
                />
                <div className="flex flex-wrap items-center justify-center gap-x-2 text-sm text-slate-600 dark:text-slate-300">
                  No file handy?
                  <button
                    className="text-pine-700 decoration-pine-300 dark:text-pine-300 inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md font-bold underline-offset-4 hover:underline disabled:opacity-50"
                    disabled={isBusy}
                    onClick={() => {
                      void handleSampleFile();
                    }}
                    type="button"
                  >
                    <FlaskConical size={16} aria-hidden="true" />
                    Try a sample image
                  </button>
                </div>
              </>
            )}
            {sampleError && (
              <p
                className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-200"
                role="alert"
              >
                {sampleError}
              </p>
            )}

            <ConversionProgress
              error={converter.error}
              progress={converter.progress}
              status={converter.status}
            />

            {converter.category && (
              <section className="grid gap-5 border-t border-slate-200 pt-5 lg:grid-cols-[1.1fr_1fr] dark:border-slate-700">
                <div className="min-w-0 space-y-5 rounded-xl bg-slate-50 p-4 sm:p-5 dark:bg-slate-800">
                  <h2 className="text-xl font-semibold">Output settings</h2>

                  <FormatSelector
                    category={converter.category}
                    disabled={isBusy}
                    onChange={converter.setOutputFormat}
                    value={converter.outputFormat}
                  />

                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Output filename
                    <input
                      className="field-control"
                      disabled={isBusy}
                      onChange={(event) => {
                        converter.setOutputFilename(event.target.value);
                      }}
                      type="text"
                      value={converter.outputFilename}
                    />
                  </label>

                  <details className="group rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-600 dark:bg-slate-900">
                    <summary className="flex min-h-6 cursor-pointer list-none items-center gap-2 rounded text-sm font-bold [&::-webkit-details-marker]:hidden">
                      <SlidersHorizontal size={16} aria-hidden="true" />
                      Advanced options
                      <ChevronDown
                        aria-hidden="true"
                        size={16}
                        className="ml-auto group-open:rotate-180"
                      />
                    </summary>
                    <div className="mt-4">
                      <OptionsPanel
                        category={converter.category}
                        disabled={isBusy}
                        onChange={converter.updateOptions}
                        options={converter.options}
                        outputFormat={converter.outputFormat}
                      />
                    </div>
                  </details>

                  <button
                    className={
                      isBusy
                        ? 'w-full cursor-pointer rounded-md bg-red-600 px-4 py-2 font-medium text-white shadow-xs transition-colors hover:bg-red-500 focus:ring-2 focus:ring-red-500 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50'
                        : 'primary-action w-full'
                    }
                    disabled={!isBusy && !converter.outputFormat}
                    onClick={() => {
                      if (isBusy) {
                        converter.cancel();
                      } else {
                        void converter.convert();
                      }
                    }}
                    type="button"
                  >
                    {isBusy ? 'Cancel' : 'Convert'}
                  </button>
                </div>

                <div className="min-w-0 space-y-5 rounded-xl bg-slate-50 p-4 sm:p-5 dark:bg-slate-800">
                  <h2 className="text-xl font-semibold">Preview</h2>

                  {converter.inputUrl && (
                    <div>
                      <p className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-400">
                        Original
                      </p>
                      {renderPreview(converter.inputUrl, 'Original preview')}
                    </div>
                  )}

                  {converter.outputUrl && (
                    <div>
                      <p className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-400">
                        Converted
                      </p>
                      {renderPreview(
                        converter.outputUrl,
                        'Converted preview',
                        converter.outputFormat === 'gif'
                          ? 'image'
                          : converter.category,
                      )}
                    </div>
                  )}

                  {converter.status === 'done' && converter.outputUrl && (
                    <button
                      className="w-full cursor-pointer rounded-md bg-green-700 px-4 py-2 font-medium text-white shadow-xs transition-colors hover:bg-green-600 focus:ring-2 focus:ring-green-500 focus:outline-hidden"
                      onClick={handleDownload}
                      type="button"
                    >
                      {downloaded ? 'Downloaded ✓' : 'Download'}
                    </button>
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </div>
      {!converter.file && !batchMode && (
        <div
          className="grid gap-3 sm:grid-cols-3"
          aria-label="Supported output formats"
        >
          {FORMAT_GROUPS.map(({ category, label, icon: Icon, color }) => (
            <div
              key={category}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white/75 px-4 py-3.5 dark:border-slate-700 dark:bg-slate-900"
            >
              <span
                className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${color}`}
              >
                <Icon size={20} aria-hidden="true" strokeWidth={1.7} />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-bold">{label}</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  {getOutputFormats(category)
                    .map((format) => format.label)
                    .join(' · ')}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
