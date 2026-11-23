import { useRef, useState } from 'react';

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
  downloadAll: () => Promise<void>;
  clearAll: () => void;
}

export function useBatchConverter(): UseBatchConverterResult {
  const ffmpeg = useFFmpeg();
  const nextIdRef = useRef(0);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [status, setStatus] = useState<BatchStatus>('idle');

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
        return {
          ...item,
          outputFormat: format,
          outputFilename: `${base}.${format}`,
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
    if (items.length === 0) {
      return;
    }

    setStatus('running');

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
        updateItem(item.id, {
          status: 'done',
          outputBlob: result.blob,
          outputFilename: result.filename,
        });
      } catch (err) {
        updateItem(item.id, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Conversion failed',
        });
      }
    }

    setStatus('done');
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
    downloadAll,
    clearAll,
  };
}
