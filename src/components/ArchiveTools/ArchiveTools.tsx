import { useState } from 'react';

import type { ZipEntry } from '../../services/archiveTools';
import {
  createZip,
  downloadZipEntry,
  extractZip,
} from '../../services/archiveTools';
import { downloadBlob, formatBytes } from '../../utils/download';
import { isLargeFile } from '../../utils/helpers';

type ArchiveMode = 'create' | 'extract';

export function ArchiveTools() {
  const [mode, setMode] = useState<ArchiveMode>('create');
  const [files, setFiles] = useState<File[]>([]);
  const [entries, setEntries] = useState<ZipEntry[]>([]);
  const [zipName, setZipName] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files ? Array.from(event.target.files) : [];
    setFiles(selected);
    setEntries([]);
    setZipName(null);
    setError(null);
    event.target.value = '';
  }

  async function handleRun() {
    /* v8 ignore next 3 */
    if (files.length === 0) {
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      if (mode === 'create') {
        const zip = await createZip(files);
        downloadBlob(zip, 'archive.zip');
      } else {
        const extracted = await extractZip(files[0]);
        setEntries(extracted);
        setZipName(files[0].name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Archive operation failed');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="space-y-6 rounded-lg bg-white p-6 shadow-xs dark:bg-slate-800">
      <h2 className="text-xl font-semibold">Archives</h2>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Create and extract ZIP archives entirely in your browser. ZIP only —
        7z/TAR/RAR conversion is out of scope.
      </p>

      <fieldset>
        <legend className="text-sm font-medium text-slate-700 dark:text-slate-200">
          Mode
        </legend>
        <div className="mt-2 flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              checked={mode === 'create'}
              disabled={isBusy}
              name="archive-mode"
              onChange={() => {
                setMode('create');
                setFiles([]);
                setEntries([]);
                setError(null);
              }}
              type="radio"
              value="create"
            />
            Create ZIP
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              checked={mode === 'extract'}
              disabled={isBusy}
              name="archive-mode"
              onChange={() => {
                setMode('extract');
                setFiles([]);
                setEntries([]);
                setError(null);
              }}
              type="radio"
              value="extract"
            />
            Extract ZIP
          </label>
        </div>
      </fieldset>

      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
        {mode === 'create' ? 'Select files to zip' : 'Select a ZIP file'}
        <input
          className="mt-1 block w-full text-sm text-slate-700 file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-slate-800 file:px-4 file:py-2 file:font-medium file:text-white hover:file:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-200 dark:file:bg-slate-200 dark:file:text-slate-900"
          disabled={isBusy}
          multiple={mode === 'create'}
          onChange={handleFilesSelected}
          type="file"
        />
      </label>

      {files.length > 0 && (
        <ul className="list-inside list-disc text-sm text-slate-600 dark:text-slate-400">
          {files.map((file) => (
            <li key={file.name}>
              {file.name} ({formatBytes(file.size)})
            </li>
          ))}
        </ul>
      )}

      {files.some((file) => isLargeFile(file)) && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Large file: this operation may be slow or fail.
        </p>
      )}

      <button
        className="w-full cursor-pointer rounded-md bg-slate-800 px-4 py-2 font-medium text-white shadow-xs transition-colors hover:bg-slate-700 focus:ring-2 focus:ring-slate-500 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-100"
        disabled={isBusy || files.length === 0}
        onClick={() => {
          void handleRun();
        }}
        type="button"
      >
        {isBusy ? 'Working…' : mode === 'create' ? 'Create ZIP' : 'Extract ZIP'}
      </button>

      {error && (
        <p
          className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-200"
          role="alert"
        >
          {error}
        </p>
      )}

      {entries.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Contents of {zipName}</h3>
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 p-3 dark:border-slate-700"
                key={entry.name}
              >
                <span className="text-sm font-medium">
                  {entry.name} ({formatBytes(entry.size)})
                </span>
                <button
                  className="cursor-pointer rounded-md bg-green-700 px-3 py-1 text-sm font-medium text-white shadow-xs transition-colors hover:bg-green-600 focus:ring-2 focus:ring-green-500 focus:outline-hidden"
                  onClick={() => {
                    downloadZipEntry(entry);
                  }}
                  type="button"
                >
                  Download {entry.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
