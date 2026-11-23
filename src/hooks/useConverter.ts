import { useEffect, useRef, useState } from 'react';

import { convertFile } from '../services/fileConverter';
import type { ConversionOptions } from '../types/converter';
import type { Category } from '../utils/constants';
import { getCategory, getDefaultOutputFormat } from '../utils/formats';
import {
  changeExtension,
  createFileUrl,
  getDefaultOptions,
  getMediaDimensions,
  getOutputFilename,
  isLargeFile,
  revokeFileUrl,
  sanitizeFilename,
} from '../utils/helpers';
import { useFFmpeg } from './useFFmpeg';

export type ConverterStatus =
  'idle' | 'loading' | 'converting' | 'done' | 'error';

export interface UseConverterResult {
  file: File | null;
  category: Category | null;
  outputFormat: string;
  outputFilename: string;
  options: ConversionOptions;
  status: ConverterStatus;
  progress: number;
  error: string | null;
  inputUrl: string | null;
  outputUrl: string | null;
  isLargeFile: boolean;
  setFile: (file: File | null) => void;
  setOutputFormat: (format: string) => void;
  setOutputFilename: (filename: string) => void;
  updateOptions: <T extends Category>(
    category: T,
    patch: Partial<ConversionOptions[T]>,
  ) => void;
  convert: () => Promise<void>;
  cancel: () => void;
  download: () => void;
}

export function useConverter(): UseConverterResult {
  const ffmpeg = useFFmpeg();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [outputFormat, setOutputFormat] = useState('');
  const [outputFilename, setOutputFilename] = useState('output.bin');
  const [options, setOptions] = useState(() => getDefaultOptions());
  const [inputUrl, setInputUrl] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<ConverterStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  // Bumped whenever the input file changes or an operation is cancelled,
  // so a conversion that finishes afterwards can tell it is stale and
  // discard its result instead of showing it for the new file.
  const operationIdRef = useRef(0);
  // Mirrors of the live object URLs, so the unmount cleanup can revoke
  // whatever is still outstanding.
  const inputUrlRef = useRef<string | null>(null);
  const outputUrlRef = useRef<string | null>(null);

  useEffect(() => {
    inputUrlRef.current = inputUrl;
  }, [inputUrl]);

  useEffect(() => {
    outputUrlRef.current = outputUrl;
  }, [outputUrl]);

  useEffect(() => {
    return () => {
      if (inputUrlRef.current) {
        revokeFileUrl(inputUrlRef.current);
      }

      if (outputUrlRef.current) {
        revokeFileUrl(outputUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (
      !selectedFile ||
      !category ||
      (category !== 'image' && category !== 'video')
    ) {
      return;
    }

    const file = selectedFile;
    const categoryKey = category;
    let active = true;

    async function loadDimensions() {
      const dimensions = await getMediaDimensions(file);
      /* v8 ignore next 3 */
      if (!active || !dimensions) {
        return;
      }

      setOptions((previous) => ({
        ...previous,
        [categoryKey]: {
          ...previous[categoryKey],
          height: dimensions.height,
          width: dimensions.width,
          originalHeight: dimensions.height,
          originalWidth: dimensions.width,
        },
      }));
    }

    void loadDimensions();

    return () => {
      active = false;
    };
  }, [category, selectedFile]);

  function clearErrors() {
    setError(null);
    ffmpeg.resetError();
  }

  function setFile(newFile: File | null) {
    // A new file invalidates any conversion already in progress, so its
    // late result cannot surface for the new selection.
    operationIdRef.current += 1;

    if (status === 'loading' || status === 'converting') {
      ffmpeg.cancel();
    }

    clearErrors();

    if (inputUrl) {
      revokeFileUrl(inputUrl);
    }

    setInputUrl(null);

    setOutputUrl((previousUrl) => {
      if (previousUrl) {
        revokeFileUrl(previousUrl);
      }
      return null;
    });

    if (!newFile) {
      setSelectedFile(null);
      setCategory(null);
      setOutputFormat('');
      setOutputFilename('output.bin');
      setOptions(getDefaultOptions());
      setStatus('idle');
      return;
    }

    setSelectedFile(newFile);
    const detectedCategory = getCategory(newFile);
    setCategory(detectedCategory);

    if (!detectedCategory) {
      setError(
        'Unsupported file type. Please choose an image, video, or audio file.',
      );
      setStatus('error');
      setOutputFormat('');
      setOutputFilename(getOutputFilename(newFile.name, 'bin'));
      setOptions(getDefaultOptions());
      setInputUrl(createFileUrl(newFile));
      return;
    }

    const format = getDefaultOutputFormat(detectedCategory);
    setOutputFormat(format);
    setOutputFilename(getOutputFilename(newFile.name, format));
    setOptions(getDefaultOptions());
    setStatus('idle');
    setInputUrl(createFileUrl(newFile));
  }

  function updateOutputFormat(format: string) {
    setOutputFormat(format);
    setOutputFilename((previous) => changeExtension(previous, format));

    // A completed result belongs to the previous format. Drop it so the
    // old file cannot be downloaded under the new format's extension.
    if (status === 'done') {
      revokeFileUrl(outputUrl);
      setOutputUrl(null);
      setStatus('idle');
    }
  }

  function updateOutputFilename(filename: string) {
    setOutputFilename(filename);
  }

  function updateOptions<T extends Category>(
    optionCategory: T,
    patch: Partial<ConversionOptions[T]>,
  ) {
    setOptions((previous) => ({
      ...previous,
      [optionCategory]: { ...previous[optionCategory], ...patch },
    }));
  }

  function cancel() {
    ffmpeg.cancel();
  }

  async function convert() {
    if (!selectedFile || !category || !outputFormat) {
      setError('Please select a file and output format');
      setStatus('error');
      return;
    }

    operationIdRef.current += 1;
    const operationId = operationIdRef.current;

    setError(null);
    ffmpeg.resetError();

    setOutputUrl((previousUrl) => {
      if (previousUrl) {
        revokeFileUrl(previousUrl);
      }
      return null;
    });

    try {
      if (!ffmpeg.loaded) {
        setStatus('loading');
      }
      await ffmpeg.load();

      /* v8 ignore start */
      if (operationIdRef.current !== operationId) {
        // The file changed or the operation was cancelled while loading;
        // discard this result instead of showing it for the new file.
        return;
      }
      /* v8 ignore stop */

      setStatus('converting');

      const { blob } = await convertFile(
        ffmpeg,
        selectedFile,
        outputFormat,
        category,
        options,
        outputFilename,
      );

      if (operationIdRef.current !== operationId) {
        // The file changed while converting; discard the stale result.
        return;
      }

      setOutputUrl(createFileUrl(blob));
      setStatus('done');
    } catch (err) {
      if (operationIdRef.current !== operationId) {
        // Superseded by a newer file or a cancellation; leave the new
        // operation's state alone.
        return;
      }

      if (err instanceof Error && err.message === 'Conversion cancelled') {
        setStatus('idle');
        setError(null);
        return;
      }

      setStatus('error');
      /* v8 ignore start */
      setError(err instanceof Error ? err.message : 'Conversion failed');
      /* v8 ignore stop */
    }
  }

  function download() {
    if (!outputUrl) {
      return;
    }

    const anchor = document.createElement('a');
    anchor.href = outputUrl;
    anchor.download =
      sanitizeFilename(outputFilename) || `output.${outputFormat}`;
    anchor.click();
  }

  return {
    file: selectedFile,
    category,
    outputFormat,
    outputFilename,
    options,
    status,
    progress: ffmpeg.progress,
    error: error ?? ffmpeg.error,
    inputUrl,
    outputUrl,
    isLargeFile: selectedFile ? isLargeFile(selectedFile) : false,
    setFile,
    setOutputFormat: updateOutputFormat,
    setOutputFilename: updateOutputFilename,
    updateOptions,
    convert,
    cancel,
    download,
  };
}
