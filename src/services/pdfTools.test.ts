import { PDFDocument } from 'pdf-lib';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

import {
  compressPdf,
  docxToText,
  getPdfPageCount,
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
} from './pdfTools';

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: {},
}));

const mockedGetDocument = vi.mocked(getDocument);

const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=';
const JPEG_1X1_BASE64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AvwH/2Q==';

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function makePdfFile(pageCount: number, name = 'doc.pdf'): Promise<File> {
  const doc = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    doc.addPage([200, 200]);
  }
  const bytes = await doc.save();
  return new File([bytes as BlobPart], name, { type: 'application/pdf' });
}

async function countPages(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPageCount();
}

describe('pdfTools (pdf-lib, jsPDF, docx, mammoth)', () => {
  it('merges PDFs into one document', async () => {
    const merged = await mergePdfs([
      await makePdfFile(2, 'a.pdf'),
      await makePdfFile(3, 'b.pdf'),
    ]);
    expect(await countPages(merged)).toBe(5);
  });

  it('merges zero PDFs into a valid empty document', async () => {
    const merged = await mergePdfs([]);
    expect(merged).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(merged.slice(0, 5))).toBe('%PDF-');
  });

  it('splits a PDF by page ranges', async () => {
    const parts = await splitPdf(await makePdfFile(3), [
      { start: 1, end: 2 },
      { start: 3, end: 3 },
    ]);
    expect(parts).toHaveLength(2);
    expect(await countPages(parts[0])).toBe(2);
    expect(await countPages(parts[1])).toBe(1);
  });

  it('rejects invalid page ranges when splitting', async () => {
    const file = await makePdfFile(2);
    await expect(splitPdf(file, [{ start: 0, end: 1 }])).rejects.toThrow(
      'Invalid page range 0-1',
    );
    await expect(splitPdf(file, [{ start: 2, end: 3 }])).rejects.toThrow(
      'Invalid page range 2-3',
    );
    await expect(splitPdf(file, [{ start: 2, end: 1 }])).rejects.toThrow(
      'Invalid page range 2-1',
    );
  });

  it('reorders PDF pages', async () => {
    const reordered = await reorderPdf(await makePdfFile(3), [2, 0, 1]);
    expect(await countPages(reordered)).toBe(3);
  });

  it('rejects out-of-range page indices when reordering', async () => {
    const file = await makePdfFile(2);
    await expect(reorderPdf(file, [0, 5])).rejects.toThrow(
      'Page index 5 is out of range',
    );
    await expect(reorderPdf(file, [-1])).rejects.toThrow(
      'Page index -1 is out of range',
    );
  });

  it('builds a PDF from PNG and JPEG images', async () => {
    const png = new File([base64ToBytes(PNG_1X1_BASE64) as BlobPart], 'a.png', {
      type: 'image/png',
    });
    const jpeg = new File(
      [base64ToBytes(JPEG_1X1_BASE64) as BlobPart],
      'b.jpg',
      {
        type: 'image/jpeg',
      },
    );
    const pdf = await imagesToPdf([png, jpeg]);
    expect(await countPages(pdf)).toBe(2);
  });

  it('rejects unsupported image types for PDF', async () => {
    const gif = new File(['x'], 'a.gif', { type: 'image/gif' });
    await expect(imagesToPdf([gif])).rejects.toThrow(
      'Unsupported image type for PDF: image/gif',
    );
  });

  it('names the file when an unsupported image has no MIME type', async () => {
    const unknown = new File(['x'], 'a.xyz');
    await expect(imagesToPdf([unknown])).rejects.toThrow(
      'Unsupported image type for PDF: a.xyz',
    );
  });

  it('re-saves a PDF structurally (compress)', async () => {
    const file = await makePdfFile(1);
    const compressed = await compressPdf(file);
    expect(compressed).toBeInstanceOf(Uint8Array);
    expect(compressed.length).toBeGreaterThan(0);
    expect(await countPages(compressed)).toBe(1);
  });

  it('converts text to a PDF', async () => {
    const pdf = await textToPdf('Hello convertY\nSecond line');
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
  });

  it('paginates long text across PDF pages', async () => {
    const longText = Array.from(
      { length: 100 },
      (_, index) => `Line ${String(index + 1)}`,
    ).join('\n');
    const pdf = await textToPdf(longText);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
    expect(await countPages(pdf)).toBeGreaterThan(1);
  });

  it('parses page ranges and page orders', () => {
    expect(parsePageRanges('1-2, 3-3')).toEqual([
      { start: 1, end: 2 },
      { start: 3, end: 3 },
    ]);
    expect(parsePageRanges('2')).toEqual([{ start: 2, end: 2 }]);
    expect(parsePageRanges(' 1 - 2 , 4 ')).toEqual([
      { start: 1, end: 2 },
      { start: 4, end: 4 },
    ]);
    expect(parsePageOrder('3, 1, 2')).toEqual([2, 0, 1]);
  });

  it('rejects invalid page ranges and orders', () => {
    expect(() => parsePageRanges('')).toThrow('Enter at least one page range');
    expect(() => parsePageRanges('abc')).toThrow('Invalid page range: "abc"');
    expect(() => parsePageRanges('0-2')).toThrow('Invalid page range: "0-2"');
    expect(() => parsePageRanges('3-2')).toThrow('Invalid page range: "3-2"');
    expect(() => parsePageRanges('1-2-3')).toThrow(
      'Invalid page range: "1-2-3"',
    );
    expect(() => parsePageRanges('1.5')).toThrow('Invalid page range: "1.5"');
    expect(() => parsePageOrder('')).toThrow('Enter a page order');
    expect(() => parsePageOrder('0, 2')).toThrow('Invalid page number: "0"');
    expect(() => parsePageOrder('x')).toThrow('Invalid page number: "x"');
  });

  it('round-trips text through DOCX and back', async () => {
    const bytes = await textToDocx('Hello convertY\nSecond line');
    const file = new File([bytes as BlobPart], 'doc.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const { text, html } = await docxToText(file);
    expect(text).toContain('Hello convertY');
    expect(text).toContain('Second line');
    expect(html).toContain('Hello convertY');
  });
});

describe('pdfTools (pdfjs-dist)', () => {
  function mockPdfDocument() {
    const page = {
      getViewport: () => ({ width: 100, height: 200 }),
      render: () => ({ promise: Promise.resolve() }),
      getTextContent: () =>
        Promise.resolve({
          items: [{ str: 'Hello' }, { str: 'world' }, {}],
        }),
    };
    return {
      numPages: 2,
      getPage: vi.fn(() => Promise.resolve(page)),
    };
  }

  beforeEach(() => {
    mockedGetDocument.mockReturnValue({
      promise: Promise.resolve(mockPdfDocument()),
    } as unknown as ReturnType<typeof getDocument>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sets the worker source and returns the page count', async () => {
    const file = await makePdfFile(2);
    expect(await getPdfPageCount(file)).toBe(2);
    expect(GlobalWorkerOptions.workerSrc).toBeTruthy();
    expect(mockedGetDocument).toHaveBeenCalled();
  });

  it('extracts text from every page', async () => {
    const file = await makePdfFile(2);
    const text = await pdfToText(file);
    expect(text).toBe('Hello world \nHello world ');
  });

  it('renders every page to an image blob', async () => {
    const toBlob = vi.fn((callback: (blob: Blob | null) => void) => {
      callback(new Blob(['img'], { type: 'image/png' }));
    });
    const createElement = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        if (tag !== 'canvas') {
          return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
        }
        return {
          width: 0,
          height: 0,
          getContext: () => ({ fillRect: () => undefined }),
          toBlob,
        } as unknown as HTMLCanvasElement;
      });

    try {
      const file = await makePdfFile(2);
      const images = await pdfToImages(file, 'png', 1);
      expect(images).toHaveLength(2);
      expect(images[0].type).toBe('image/png');
    } finally {
      createElement.mockRestore();
    }
  });

  it('renders JPEG pages when requested', async () => {
    const createElement = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        if (tag !== 'canvas') {
          return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
        }
        return {
          width: 0,
          height: 0,
          getContext: () => ({}),
          toBlob: (callback: (blob: Blob | null) => void) => {
            callback(new Blob(['img'], { type: 'image/jpeg' }));
          },
        } as unknown as HTMLCanvasElement;
      });

    try {
      const file = await makePdfFile(1);
      const images = await pdfToImages(file, 'jpeg');
      expect(images).toHaveLength(2);
      expect(images[0].type).toBe('image/jpeg');
    } finally {
      createElement.mockRestore();
    }
  });

  it('throws when the canvas 2D context is unavailable', async () => {
    const createElement = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        if (tag !== 'canvas') {
          return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
        }
        return {
          width: 0,
          height: 0,
          getContext: () => null,
          toBlob: vi.fn(),
        } as unknown as HTMLCanvasElement;
      });

    try {
      const file = await makePdfFile(1);
      await expect(pdfToImages(file)).rejects.toThrow(
        'Canvas 2D context is not available',
      );
    } finally {
      createElement.mockRestore();
    }
  });

  it('throws when a page cannot be rendered to a blob', async () => {
    const createElement = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        if (tag !== 'canvas') {
          return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
        }
        return {
          width: 0,
          height: 0,
          getContext: () => ({}),
          toBlob: (callback: (blob: Blob | null) => void) => {
            callback(null);
          },
        } as unknown as HTMLCanvasElement;
      });

    try {
      const file = await makePdfFile(1);
      await expect(pdfToImages(file)).rejects.toThrow(
        'Failed to render PDF page to image',
      );
    } finally {
      createElement.mockRestore();
    }
  });
});
