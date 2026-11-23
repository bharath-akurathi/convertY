import { Document, Packer, Paragraph, TextRun } from 'docx';
import { jsPDF } from 'jspdf';
import * as mammoth from 'mammoth';
import { PDFDocument } from 'pdf-lib';
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export interface PageRange {
  start: number;
  end: number;
}

export interface DocxText {
  html: string;
  text: string;
}

export function parsePageRanges(input: string): PageRange[] {
  const tokens = input
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    throw new Error('Enter at least one page range, for example "1-2, 3-3".');
  }

  return tokens.map((token) => {
    const parts = token.split('-').map((part) => part.trim());

    if (parts.length === 1) {
      const page = Number(parts[0]);

      if (!Number.isInteger(page) || page < 1) {
        throw new Error(`Invalid page range: "${token}"`);
      }

      return { start: page, end: page };
    }

    if (parts.length !== 2) {
      throw new Error(`Invalid page range: "${token}"`);
    }

    const start = Number(parts[0]);
    const end = Number(parts[1]);

    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 1 ||
      end < start
    ) {
      throw new Error(`Invalid page range: "${token}"`);
    }

    return { start, end };
  });
}

export function parsePageOrder(input: string): number[] {
  const tokens = input
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    throw new Error('Enter a page order, for example "3, 1, 2".');
  }

  return tokens.map((token) => {
    const page = Number(token);

    if (!Number.isInteger(page) || page < 1) {
      throw new Error(`Invalid page number: "${token}"`);
    }

    return page - 1;
  });
}

async function withPdf<T>(
  file: File,
  read: (pdf: PDFDocumentProxy) => T | Promise<T>,
): Promise<T> {
  GlobalWorkerOptions.workerSrc = workerUrl;
  const task = getDocument({ data: await file.arrayBuffer() });
  try {
    return await read(await task.promise);
  } finally {
    await task.destroy();
  }
}

export async function getPdfPageCount(file: File): Promise<number> {
  return withPdf(file, (pdf) => pdf.numPages);
}

export async function mergePdfs(files: File[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();

  for (const file of files) {
    const source = await PDFDocument.load(await file.arrayBuffer());
    const pages = await merged.copyPages(source, source.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
  }

  return merged.save();
}

export async function splitPdf(
  file: File,
  ranges: PageRange[],
): Promise<Uint8Array[]> {
  const source = await PDFDocument.load(await file.arrayBuffer());
  const pageCount = source.getPageCount();
  const outputs: Uint8Array[] = [];

  for (const range of ranges) {
    if (range.start < 1 || range.end > pageCount || range.start > range.end) {
      throw new Error(
        `Invalid page range ${String(range.start)}-${String(range.end)} for a ${String(pageCount)}-page PDF`,
      );
    }

    const doc = await PDFDocument.create();
    const indices = Array.from(
      { length: range.end - range.start + 1 },
      (_, index) => range.start - 1 + index,
    );
    const pages = await doc.copyPages(source, indices);
    for (const page of pages) {
      doc.addPage(page);
    }
    outputs.push(await doc.save());
  }

  return outputs;
}

export async function reorderPdf(
  file: File,
  order: number[],
): Promise<Uint8Array> {
  const source = await PDFDocument.load(await file.arrayBuffer());
  const pageCount = source.getPageCount();

  for (const index of order) {
    if (index < 0 || index >= pageCount) {
      throw new Error(
        `Page index ${String(index)} is out of range for a ${String(pageCount)}-page PDF`,
      );
    }
  }

  const doc = await PDFDocument.create();
  const pages = await doc.copyPages(source, order);
  for (const page of pages) {
    doc.addPage(page);
  }

  return doc.save();
}

export async function imagesToPdf(files: File[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();

  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const image =
      file.type === 'image/jpeg' || file.type === 'image/jpg'
        ? await doc.embedJpg(bytes)
        : file.type === 'image/png'
          ? await doc.embedPng(bytes)
          : null;

    if (!image) {
      throw new Error(
        `Unsupported image type for PDF: ${file.type || file.name}. Use JPEG or PNG.`,
      );
    }

    const scale = Math.min(1, 595 / image.width, 842 / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    const page = doc.addPage([width, height]);
    page.drawImage(image, { x: 0, y: 0, width, height });
  }

  return doc.save();
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to render PDF page to image'));
      }
    }, type);
  });
}

export async function pdfToImages(
  file: File,
  format: 'jpeg' | 'png' = 'png',
  scale = 2,
): Promise<Blob[]> {
  return withPdf(file, async (pdf) => {
    const images: Blob[] = [];
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');

      if (!context) {
        throw new Error('Canvas 2D context is not available');
      }

      await page.render({ canvas, canvasContext: context, viewport }).promise;
      images.push(await canvasToBlob(canvas, mimeType));
    }

    return images;
  });
}

export async function pdfToText(file: File): Promise<string> {
  return withPdf(file, async (pdf) => {
    const parts: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ');
      parts.push(text);
    }

    return parts.join('\n');
  });
}

export async function compressPdf(file: File): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await file.arrayBuffer());
  return doc.save({ useObjectStreams: true });
}

export function textToPdf(text: string): Promise<Uint8Array> {
  const doc = new jsPDF();
  const lines = doc.splitTextToSize(text, 180) as string[];
  const lineHeight = 7;
  let y = 10;

  for (const line of lines) {
    if (y > 280) {
      doc.addPage();
      y = 10;
    }
    doc.text(line, 10, y);
    y += lineHeight;
  }

  return Promise.resolve(new Uint8Array(doc.output('arraybuffer')));
}

export async function docxToText(file: File): Promise<DocxText> {
  const arrayBuffer = await file.arrayBuffer();
  // Mammoth's browser build reads `arrayBuffer`; its Node build (resolved
  // by Vitest) reads `buffer`. Passing both keeps the real code path working
  // in the app and under test.
  const input = {
    arrayBuffer,
    buffer: new Uint8Array(arrayBuffer),
  } as unknown as Parameters<typeof mammoth.extractRawText>[0];
  const { value: text } = await mammoth.extractRawText(input);
  const { value: html } = await mammoth.convertToHtml(input);
  return { text, html };
}

export async function textToDocx(text: string): Promise<Uint8Array> {
  const paragraphs = text
    .split('\n')
    .map((line) => new Paragraph({ children: [new TextRun(line)] }));
  const doc = new Document({ sections: [{ children: paragraphs }] });
  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}
