import { useState } from 'react';

import {
  compressPdf,
  docxToText,
  imagesToPdf,
  mergePdfs,
  parsePageOrder,
  parsePageRanges,
  pdfToImages,
  pdfToText,
  reorderPdf,
  splitPdf,
  textToDocx,
  textToPdf,
} from '../../services/pdfTools';
import { downloadBlob } from '../../utils/download';
import { isLargeFile } from '../../utils/helpers';

type Operation =
  | 'merge'
  | 'split'
  | 'reorder'
  | 'images-to-pdf'
  | 'pdf-to-images'
  | 'pdf-to-text'
  | 'compress-pdf'
  | 'text-to-pdf'
  | 'docx-to-text'
  | 'text-to-docx';

interface ToolResult {
  blob: Blob;
  name: string;
}

const OPERATION_DESCRIPTIONS: Record<Operation, string> = {
  merge: 'Merge PDFs — combine multiple PDF files into one PDF.',
  split:
    'Split PDF — extract page ranges into separate PDFs. Pages are 1-based, for example "1-2, 3-5".',
  reorder:
    'Reorder PDF — list the new page order, for example "3, 1, 2". Pages are 1-based.',
  'images-to-pdf':
    'Images to PDF — combine JPEG or PNG images into a single PDF.',
  'pdf-to-images': 'PDF to images — render each PDF page to an image.',
  'pdf-to-text': 'PDF to text — extract the text of every page.',
  'compress-pdf':
    'Compress PDF (structural only) — re-saves the PDF with object streams. This only shrinks structure and metadata; it does not recompress embedded images.',
  'text-to-pdf': 'Text to PDF — convert a .txt, .md, or .html file into a PDF.',
  'docx-to-text':
    'DOCX to text — extract text and HTML from a Word document. Full-fidelity DOCX to PDF conversion is out of scope.',
  'text-to-docx':
    'Text to DOCX — convert a .txt or .md file into a Word document.',
};

const MULTI_FILE_OPERATIONS: Operation[] = ['merge', 'images-to-pdf'];

function getBaseName(filename: string): string {
  return filename.replace(/\.[^.]*$/, '') || 'document';
}

export function DocumentTools() {
  const [operation, setOperation] = useState<Operation>('merge');
  const [files, setFiles] = useState<File[]>([]);
  const [rangeText, setRangeText] = useState('1-1');
  const [orderText, setOrderText] = useState('1');
  const [imageFormat, setImageFormat] = useState<'jpeg' | 'png'>('png');
  const [results, setResults] = useState<ToolResult[]>([]);
  const [textResult, setTextResult] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowsMultiple = MULTI_FILE_OPERATIONS.includes(operation);

  function handleFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files ? Array.from(event.target.files) : [];
    setFiles(selected);
    setResults([]);
    setTextResult(null);
    setError(null);
    event.target.value = '';
  }

  async function runOperation() {
    /* v8 ignore next 3 */
    if (files.length === 0) {
      return;
    }

    setIsBusy(true);
    setError(null);
    setResults([]);
    setTextResult(null);

    try {
      const first = files[0];
      const base = getBaseName(first.name);

      switch (operation) {
        case 'merge': {
          const bytes = await mergePdfs(files);
          setResults([
            {
              name: 'merged.pdf',
              blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
            },
          ]);
          break;
        }
        case 'split': {
          const ranges = parsePageRanges(rangeText);
          const parts = await splitPdf(first, ranges);
          setResults(
            parts.map((bytes, index) => ({
              name: `${base}-part-${String(index + 1)}.pdf`,
              blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
            })),
          );
          break;
        }
        case 'reorder': {
          const order = parsePageOrder(orderText);
          const bytes = await reorderPdf(first, order);
          setResults([
            {
              name: `${base}-reordered.pdf`,
              blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
            },
          ]);
          break;
        }
        case 'images-to-pdf': {
          const bytes = await imagesToPdf(files);
          setResults([
            {
              name: `${base}.pdf`,
              blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
            },
          ]);
          break;
        }
        case 'pdf-to-images': {
          const images = await pdfToImages(first, imageFormat);
          setResults(
            images.map((blob, index) => ({
              name: `${base}-page-${String(index + 1)}.${imageFormat === 'jpeg' ? 'jpg' : 'png'}`,
              blob,
            })),
          );
          break;
        }
        case 'pdf-to-text': {
          const text = await pdfToText(first);
          setTextResult(text);
          setResults([
            {
              name: `${base}.txt`,
              blob: new Blob([text], { type: 'text/plain' }),
            },
          ]);
          break;
        }
        case 'compress-pdf': {
          const bytes = await compressPdf(first);
          setResults([
            {
              name: `${base}-compressed.pdf`,
              blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
            },
          ]);
          break;
        }
        case 'text-to-pdf': {
          const text = await first.text();
          const bytes = await textToPdf(text);
          setResults([
            {
              name: `${base}.pdf`,
              blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
            },
          ]);
          break;
        }
        case 'docx-to-text': {
          const { text, html } = await docxToText(first);
          setTextResult(text);
          setResults([
            {
              name: `${base}.txt`,
              blob: new Blob([text], { type: 'text/plain' }),
            },
            {
              name: `${base}.html`,
              blob: new Blob([html], { type: 'text/html' }),
            },
          ]);
          break;
        }
        case 'text-to-docx': {
          const text = await first.text();
          const bytes = await textToDocx(text);
          setResults([
            {
              name: `${base}.docx`,
              blob: new Blob([bytes as BlobPart], {
                type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              }),
            },
          ]);
          break;
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Document operation failed',
      );
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="space-y-6 rounded-lg bg-white p-6 shadow-xs dark:bg-slate-800">
      <h2 className="text-xl font-semibold">Document tools</h2>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Work with PDFs, text, and Word documents entirely in your browser.
      </p>

      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
        Operation
        <select
          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-xs focus:border-slate-500 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          disabled={isBusy}
          onChange={(event) => {
            setOperation(event.target.value as Operation);
            setFiles([]);
            setResults([]);
            setTextResult(null);
            setError(null);
          }}
          value={operation}
        >
          <option value="merge">Merge PDFs</option>
          <option value="split">Split PDF</option>
          <option value="reorder">Reorder PDF pages</option>
          <option value="images-to-pdf">Images to PDF</option>
          <option value="pdf-to-images">PDF to images</option>
          <option value="pdf-to-text">PDF to text</option>
          <option value="compress-pdf">Compress PDF (structural only)</option>
          <option value="text-to-pdf">Text to PDF</option>
          <option value="docx-to-text">DOCX to text</option>
          <option value="text-to-docx">Text to DOCX</option>
        </select>
      </label>

      <p className="text-sm text-slate-600 dark:text-slate-400">
        {OPERATION_DESCRIPTIONS[operation]}
      </p>

      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
        {allowsMultiple ? 'Select files' : 'Select a file'}
        <input
          className="mt-1 block w-full text-sm text-slate-700 file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-slate-800 file:px-4 file:py-2 file:font-medium file:text-white hover:file:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-200 dark:file:bg-slate-200 dark:file:text-slate-900"
          disabled={isBusy}
          multiple={allowsMultiple}
          onChange={handleFilesSelected}
          type="file"
        />
      </label>

      {files.length > 0 && (
        <ul className="list-inside list-disc text-sm text-slate-600 dark:text-slate-400">
          {files.map((file) => (
            <li key={file.name}>{file.name}</li>
          ))}
        </ul>
      )}

      {files.some((file) => isLargeFile(file)) && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Large file: this operation may be slow or fail.
        </p>
      )}

      {operation === 'split' && (
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Page ranges
          <input
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-xs focus:border-slate-500 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            disabled={isBusy}
            onChange={(event) => {
              setRangeText(event.target.value);
            }}
            type="text"
            value={rangeText}
          />
        </label>
      )}

      {operation === 'reorder' && (
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          New page order
          <input
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-xs focus:border-slate-500 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            disabled={isBusy}
            onChange={(event) => {
              setOrderText(event.target.value);
            }}
            type="text"
            value={orderText}
          />
        </label>
      )}

      {operation === 'pdf-to-images' && (
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
          Image format
          <select
            className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-xs focus:border-slate-500 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            disabled={isBusy}
            onChange={(event) => {
              setImageFormat(event.target.value as 'jpeg' | 'png');
            }}
            value={imageFormat}
          >
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
          </select>
        </label>
      )}

      <button
        className="w-full cursor-pointer rounded-md bg-slate-800 px-4 py-2 font-medium text-white shadow-xs transition-colors hover:bg-slate-700 focus:ring-2 focus:ring-slate-500 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-100"
        disabled={isBusy || files.length === 0}
        onClick={() => {
          void runOperation();
        }}
        type="button"
      >
        {isBusy ? 'Working…' : 'Run'}
      </button>

      {error && (
        <p
          className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-200"
          role="alert"
        >
          {error}
        </p>
      )}

      {textResult !== null && (
        <div>
          <h3 className="text-lg font-semibold">Extracted text</h3>
          <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-slate-100 p-3 text-sm whitespace-pre-wrap dark:bg-slate-700">
            {textResult}
          </pre>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Results</h3>
          <ul className="space-y-2">
            {results.map((result) => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 p-3 dark:border-slate-700"
                key={result.name}
              >
                <span className="text-sm font-medium">{result.name}</span>
                <button
                  className="cursor-pointer rounded-md bg-green-700 px-3 py-1 text-sm font-medium text-white shadow-xs transition-colors hover:bg-green-600 focus:ring-2 focus:ring-green-500 focus:outline-hidden"
                  onClick={() => {
                    downloadBlob(result.blob, result.name);
                  }}
                  type="button"
                >
                  Download {result.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
