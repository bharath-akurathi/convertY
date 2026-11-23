import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { useEffect, useRef, useState } from 'react';

import {
  ALLOWED_CDN_PREFIX,
  FFMPEG_CORE_URL,
  FFMPEG_WASM_URL,
} from '../utils/constants';
import { getFileExtension } from '../utils/formats';

type FFmpegStatus = 'idle' | 'loading' | 'converting' | 'error';

export interface UseFFmpegResult {
  loaded: boolean;
  loading: boolean;
  converting: boolean;
  progress: number;
  error: string | null;
  load: () => Promise<void>;
  convert: (
    inputFile: File,
    outputName: string,
    args: string[],
  ) => Promise<Uint8Array>;
  cancel: () => void;
  resetError: () => void;
}

export function useFFmpeg(): UseFFmpegResult {
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const loadErrorRef = useRef<string | null>(null);
  // Bumped on every cancel/unmount so in-flight load/convert steps can
  // notice they were cancelled instead of completing afterwards.
  const cancelGenerationRef = useRef(0);
  const [status, setStatus] = useState<FFmpegStatus>('idle');
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function resetError() {
    setError(null);
    loadErrorRef.current = null;
  }

  async function load() {
    if (ffmpegRef.current?.loaded) {
      return;
    }

    setStatus('loading');
    setError(null);
    setProgress(0);

    const generation = cancelGenerationRef.current;

    try {
      /* v8 ignore start */
      if (
        !FFMPEG_CORE_URL.startsWith(ALLOWED_CDN_PREFIX) ||
        !FFMPEG_WASM_URL.startsWith(ALLOWED_CDN_PREFIX)
      ) {
        throw new Error('Invalid FFmpeg CDN URL');
      }
      /* v8 ignore stop */

      const ffmpeg = new FFmpeg();
      // Store the instance before awaiting load so cancel() can terminate
      // it while loading is still in progress.
      ffmpegRef.current = ffmpeg;

      ffmpeg.on('log', ({ message }) => {
        // eslint-disable-next-line no-console
        console.log(message);
      });

      ffmpeg.on('progress', ({ progress: value }) => {
        setProgress(value);
      });

      await ffmpeg.load({
        coreURL: FFMPEG_CORE_URL,
        wasmURL: FFMPEG_WASM_URL,
      });

      if (cancelGenerationRef.current !== generation) {
        // Cancelled while loading; do not mark the (terminated) instance
        // as loaded.
        return;
      }

      loadErrorRef.current = null;
      setLoaded(true);
      setStatus('idle');
    } catch (err) {
      if (cancelGenerationRef.current !== generation) {
        // Cancelled; do not surface an error for the aborted load.
        return;
      }

      // Drop the failed instance so a retry starts from a fresh one.
      ffmpegRef.current?.terminate();
      ffmpegRef.current = null;

      // eslint-disable-next-line no-console
      console.error('FFmpeg load failed:', err);
      /* v8 ignore start */
      const message =
        err instanceof Error
          ? err.message
          : `Failed to load FFmpeg from CDN: ${String(err)}`;
      /* v8 ignore stop */
      setLoaded(false);
      setStatus('error');
      setError(message);
      loadErrorRef.current = message;
    } finally {
      setProgress(0);
    }
  }

  async function convert(
    inputFile: File,
    outputName: string,
    args: string[],
  ): Promise<Uint8Array> {
    const generation = cancelGenerationRef.current;

    if (!ffmpegRef.current?.loaded) {
      await load();
    }

    if (cancelGenerationRef.current !== generation) {
      throw new Error('Conversion cancelled');
    }

    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg?.loaded) {
      const message = loadErrorRef.current ?? 'FFmpeg is not loaded';
      setStatus('error');
      setError(message);
      throw new Error(message);
    }

    setStatus('converting');
    setError(null);

    const extension = getFileExtension(inputFile.name) || 'bin';
    const inputName = `input.${extension}`;

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(inputFile));

      if (cancelGenerationRef.current !== generation) {
        throw new Error('Conversion cancelled');
      }

      const exitCode = await ffmpeg.exec([...args, outputName]);

      if (exitCode !== 0) {
        throw new Error(`FFmpeg exited with code ${String(exitCode)}`);
      }

      if (cancelGenerationRef.current !== generation) {
        throw new Error('Conversion cancelled');
      }

      const data = await ffmpeg.readFile(outputName);

      if (!(data instanceof Uint8Array)) {
        throw new Error('Unexpected output data format');
      }

      setStatus('idle');
      return data;
    } catch (err) {
      if (cancelGenerationRef.current !== generation || !ffmpegRef.current) {
        setStatus('idle');
        setError(null);
        throw new Error('Conversion cancelled', { cause: err });
      }

      setStatus('error');
      /* v8 ignore start */
      const message = err instanceof Error ? err.message : 'Conversion failed';
      /* v8 ignore stop */
      setError(message);
      throw new Error(message, { cause: err });
    } finally {
      // Best-effort cleanup of temporary files in the FFmpeg virtual
      // filesystem so repeated conversions do not accumulate them.
      await ffmpeg.deleteFile(inputName).catch(() => undefined);
      await ffmpeg.deleteFile(outputName).catch(() => undefined);
    }
  }

  function cancel() {
    cancelGenerationRef.current += 1;
    ffmpegRef.current?.terminate();
    ffmpegRef.current = null;
    loadErrorRef.current = null;
    setLoaded(false);
    setStatus('idle');
    setProgress(0);
    setError(null);
  }

  useEffect(() => {
    return () => {
      cancelGenerationRef.current += 1;
      ffmpegRef.current?.terminate();
      ffmpegRef.current = null;
    };
  }, []);

  return {
    loaded,
    loading: status === 'loading',
    converting: status === 'converting',
    progress,
    error,
    load,
    convert,
    cancel,
    resetError,
  };
}
