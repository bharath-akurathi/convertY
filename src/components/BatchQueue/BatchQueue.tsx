import { useBatchConverter } from '../../hooks/useBatchConverter';
import { getOutputFormats } from '../../utils/formats';
import { isLargeFile } from '../../utils/helpers';

export function BatchQueue() {
  const batch = useBatchConverter();

  const isRunning = batch.status === 'running';
  const doneCount = batch.items.filter((item) => item.status === 'done').length;

  function handleFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files ? Array.from(event.target.files) : [];

    if (files.length > 0) {
      batch.addFiles(files);
    }

    event.target.value = '';
  }

  return (
    <div className="space-y-5 border-t border-slate-200 pt-5 dark:border-slate-700">
      <header>
        <h2 className="tool-title">Batch conversion</h2>
        <p className="tool-summary">
          Add files to the queue, choose their formats, and download the results
          together.
        </p>
      </header>

      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
        Add files
        <input
          className="file-input"
          disabled={isRunning}
          multiple
          onChange={handleFilesSelected}
          type="file"
        />
      </label>

      {batch.items.some((item) => isLargeFile(item.file)) && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Large file: conversion may be slow or fail. Files over 100 MB are not
          recommended.
        </p>
      )}

      {batch.items.length > 0 && (
        <ul className="space-y-3">
          {batch.items.map((item) => (
            <li
              className="rounded-md border border-slate-200 p-3 dark:border-slate-700"
              key={item.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{item.file.name}</p>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {item.status}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="text-sm">
                  Output format
                  <select
                    aria-label={`Output format for ${item.file.name}`}
                    className="ml-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800"
                    disabled={isRunning || !item.category}
                    onChange={(event) => {
                      batch.setItemFormat(item.id, event.target.value);
                    }}
                    value={item.outputFormat}
                  >
                    {!item.category && <option value="">Unsupported</option>}
                    {item.category &&
                      getOutputFormats(item.category).map((format) => (
                        <option key={format.value} value={format.value}>
                          {format.label}
                        </option>
                      ))}
                  </select>
                </label>

                <button
                  className="cursor-pointer rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/30"
                  disabled={isRunning}
                  onClick={() => {
                    batch.removeItem(item.id);
                  }}
                  type="button"
                >
                  Remove
                </button>
              </div>

              {item.error && (
                <p
                  className="mt-2 text-sm text-red-600 dark:text-red-400"
                  role="alert"
                >
                  {item.error}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          className={
            isRunning
              ? 'cursor-pointer rounded-md bg-red-600 px-4 py-2 font-medium text-white shadow-xs transition-colors hover:bg-red-500 focus:ring-2 focus:ring-red-500 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50'
              : 'primary-action'
          }
          disabled={!isRunning && batch.items.length === 0}
          onClick={() => {
            if (isRunning) {
              batch.cancel();
            } else {
              void batch.runAll();
            }
          }}
          type="button"
        >
          {isRunning ? 'Cancel' : 'Convert all'}
        </button>

        <button
          className="cursor-pointer rounded-md bg-green-700 px-4 py-2 font-medium text-white shadow-xs transition-colors hover:bg-green-600 focus:ring-2 focus:ring-green-500 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isRunning || doneCount === 0}
          onClick={() => {
            void batch.downloadAll();
          }}
          type="button"
        >
          Download all (.zip)
        </button>

        <button
          className="cursor-pointer rounded-md bg-white px-4 py-2 font-medium text-slate-700 shadow-xs ring-1 ring-slate-300 transition-colors hover:bg-slate-100 focus:ring-2 focus:ring-slate-500 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600 dark:hover:bg-slate-700"
          disabled={isRunning || batch.items.length === 0}
          onClick={batch.clearAll}
          type="button"
        >
          Clear
        </button>
      </div>

      {batch.status === 'done' && (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Finished: {doneCount} of {batch.items.length} converted.
        </p>
      )}
    </div>
  );
}
