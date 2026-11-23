import { useEffect, useRef, useState } from 'react';

import { createZip } from '../services/archiveTools';
import { convertFile } from '../services/fileConverter';
import type { Category } from '../utils/constants';
import { downloadBlob } from '../utils/download';
import { getCategory, getDefaultOutputFormat } from '../utils/formats';
import { getDefaultOptions } from '../utils/helpers';
import { useFFmpeg } from './useFFmpeg';

export type BatchItemStatus = 'queued' | 'converting' | 'done' | 'error';

export interface BatchItem {
  id: string;
  file: File;
  category: Category | null;
  outputFormat: string;
  outputFilename: string;
  status: BatchItemStatus;
  error: string | null;
  outputBlob: Blob | null;
}

export type BatchStatus = 'idle' | 'running' | 'done';

export interface UseBatchConverterResult {
  items: BatchItem[];
  status: BatchStatus;
  addFiles: (files: File[]) => void;
  removeItem: (id: string) => void;
  setItemFormat: (id: string, format: string) => void;
  runAll: () => Promise<void>;
  cancel: () => void;
  downloadAll: () => Promise<void>;
  clearAll: () => void;
}

export function useBatchConverter(): UseBatchConverterResult {
  const ffmpeg = useFFmpeg();
  const nextIdRef = useRef(0);
  // Synchronous guard so a second runAll cannot start while one is in
  // flight (state updates alone cannot prevent the re-entry).
  const runningRef = useRef(false);
  // Bumped by cancel/clearAll so the active loop can tell it was stopped
  // and quit instead of recording results for a discarded batch.
  const batchGenerationRef = useRef(0);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [status, setStatus] = useState<BatchStatus>('idle');

  useEffect(() => {
    return () => {
      batchGenerationRef.current += 1;
    };
  }, []);

  function addFiles(files: File[]): void {
    const newItems: BatchItem[] = files.map((file) => {
      const category = getCategory(file);
      const outputFormat = category ? getDefaultOutputFormat(category) : '';
      const base = file.name.replace(/\.[^.]*$/, '') || 'output';
      nextIdRef.current += 1;

      return {
        id: `batch-${String(nextIdRef.current)}`,
        file,
        category,
        outputFormat,
        outputFilename: outputFormat ? `${base}.${outputFormat}` : base,
        status: 'queued',
        error: null,
        outputBlob: null,
      };
    });

    setItems((previous) => [...previous, ...newItems]);
  }

  function removeItem(id: string): void {
    setItems((previous) => previous.filter((item) => item.id !== id));
  }

  function setItemFormat(id: string, format: string): void {
    setItems((previous) =>
      previous.map((item) => {
        if (item.id !== id) {
          return item;
        }

        const base = item.outputFilename.replace(/\.[^.]*$/, '');
        // A completed result belongs to the previous format; drop it so
        // the old file cannot be downloaded under the new extension.
        const wasDone = item.status === 'done';
        return {
          ...item,
          outputFormat: format,
          outputFilename: `${base}.${format}`,
          status: wasDone ? 'queued' : item.status,
          outputBlob: wasDone ? null : item.outputBlob,
        };
      }),
    );
  }

  function updateItem(id: string, patch: Partial<BatchItem>): void {
    setItems((previous) =>
      previous.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  async function runAll(): Promise<void> {
    if (items.length === 0 || runningRef.current) {
      return;
    }

    runningRef.current = true;
    batchGenerationRef.current += 1;
    const generation = batchGenerationRef.current;
    setStatus('running');

    try {
      for (const item of items) {
        if (item.status === 'done') {
          continue;
        }

        if (!item.category || !item.outputFormat) {
          updateItem(item.id, {
            status: 'error',
            error:
              'Unsupported file type. Please choose an image, video, or audio file.',
          });
          continue;
        }

        updateItem(item.id, { status: 'converting', error: null });

        try {
          const result = await convertFile(
            ffmpeg,
            item.file,
            item.outputFormat,
            item.category,
            getDefaultOptions(),
            item.outputFilename,
          );

          if (batchGenerationRef.current !== generation) {
            // Cancelled while this item was converting; stop without
            // recording a result for it.
            break;
          }

          updateItem(item.id, {
            status: 'done',
            outputBlob: result.blob,
            outputFilename: result.filename,
          });
        } catch (err) {
          if (batchGenerationRef.current !== generation) {
            // Cancelled; stop the loop without marking the item failed.
            break;
          }

          updateItem(item.id, {
            status: 'error',
            error: err instanceof Error ? err.message : 'Conversion failed',
          });
        }
      }
    } finally {
      runningRef.current = false;

      if (batchGenerationRef.current === generation) {
        setStatus('done');
      } else {
        // The batch was cancelled or cleared; return in-flight items to
        // the queue so they can be run again.
        setItems((previous) =>
          previous.map((item) =>
            item.status === 'converting'
              ? { ...item, status: 'queued', error: null }
              : item,
          ),
        );
        setStatus('idle');
      }
    }
  }

  function cancel(): void {
    batchGenerationRef.current += 1;
    ffmpeg.cancel();
  }

  async function downloadAll(): Promise<void> {
    const done = items.filter(
      (item) => item.status === 'done' && item.outputBlob,
    );

    if (done.length === 0) {
      return;
    }

    const files = done.map(
      (item) =>
        new File([item.outputBlob as BlobPart], item.outputFilename, {
          type: item.outputBlob?.type,
        }),
    );
    const zip = await createZip(files);
    downloadBlob(zip, 'converted.zip');
  }

  function clearAll(): void {
    // Stop the active loop (if any) before dropping the queue, so a
    // late result cannot reappear after the clear.
    batchGenerationRef.current += 1;
    ffmpeg.cancel();
    setItems([]);
    setStatus('idle');
  }

  return {
    items,
    status,
    addFiles,
    removeItem,
    setItemFormat,
    runAll,
    cancel,
    downloadAll,
    clearAll,
  };
}
