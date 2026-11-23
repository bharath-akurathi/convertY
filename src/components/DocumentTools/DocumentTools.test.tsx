import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  compressPdf,
  docxToText,
  imagesToPdf,
  mergePdfs,
  pdfToImages,
  pdfToText,
  reorderPdf,
  splitPdf,
  textToDocx,
  textToPdf,
} from '../../services/pdfTools';
import { downloadBlob } from '../../utils/download';
import { DocumentTools } from './DocumentTools';

vi.mock('../../services/pdfTools', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../services/pdfTools')>();
  return {
    ...original,
    mergePdfs: vi.fn(),
    splitPdf: vi.fn(),
    reorderPdf: vi.fn(),
    imagesToPdf: vi.fn(),
    pdfToImages: vi.fn(),
    pdfToText: vi.fn(),
    compressPdf: vi.fn(),
    textToPdf: vi.fn(),
    docxToText: vi.fn(),
    textToDocx: vi.fn(),
  };
});

vi.mock('../../utils/download', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../utils/download')>();
  return {
    ...original,
    downloadBlob: vi.fn(),
  };
});

const mockedMergePdfs = vi.mocked(mergePdfs);
const mockedSplitPdf = vi.mocked(splitPdf);
const mockedReorderPdf = vi.mocked(reorderPdf);
const mockedImagesToPdf = vi.mocked(imagesToPdf);
const mockedPdfToImages = vi.mocked(pdfToImages);
const mockedPdfToText = vi.mocked(pdfToText);
const mockedCompressPdf = vi.mocked(compressPdf);
const mockedTextToPdf = vi.mocked(textToPdf);
const mockedDocxToText = vi.mocked(docxToText);
const mockedTextToDocx = vi.mocked(textToDocx);
const mockedDownloadBlob = vi.mocked(downloadBlob);

function pdfFile(name = 'doc.pdf'): File {
  return new File(['pdf'], name, { type: 'application/pdf' });
}

async function uploadFiles(
  user: ReturnType<typeof userEvent.setup>,
  files: File[],
) {
  const input = screen.getByLabelText(/select.*file/i);
  await user.upload(input, files);
}

async function selectOperation(
  user: ReturnType<typeof userEvent.setup>,
  value: string,
) {
  await user.selectOptions(screen.getByLabelText(/operation/i), value);
}

async function run(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^run$/i }));
}

describe('DocumentTools', () => {
  beforeEach(() => {
    mockedMergePdfs.mockResolvedValue(new Uint8Array([1]));
    mockedSplitPdf.mockResolvedValue([
      new Uint8Array([1]),
      new Uint8Array([2]),
    ]);
    mockedReorderPdf.mockResolvedValue(new Uint8Array([1]));
    mockedImagesToPdf.mockResolvedValue(new Uint8Array([1]));
    mockedPdfToImages.mockResolvedValue([
      new Blob(['p1'], { type: 'image/png' }),
      new Blob(['p2'], { type: 'image/png' }),
    ]);
    mockedPdfToText.mockResolvedValue('hello text');
    mockedCompressPdf.mockResolvedValue(new Uint8Array([1]));
    mockedTextToPdf.mockResolvedValue(new Uint8Array([1]));
    mockedDocxToText.mockResolvedValue({
      text: 'docx text',
      html: '<p>docx text</p>',
    });
    mockedTextToDocx.mockResolvedValue(new Uint8Array([1]));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('ignores an empty file selection', () => {
    render(<DocumentTools />);

    const input = screen.getByLabelText(/select.*file/i);
    fireEvent.change(input, { target: { files: null } });
    expect(screen.getByRole('button', { name: /^run$/i })).toBeDisabled();
  });

  it('renders PDF pages to PNG images by default', async () => {
    const user = userEvent.setup();
    render(<DocumentTools />);

    await selectOperation(user, 'pdf-to-images');
    await uploadFiles(user, [pdfFile()]);
    await run(user);

    await waitFor(() => {
      expect(mockedPdfToImages).toHaveBeenCalledWith(expect.any(File), 'png');
    });
    expect(screen.getByText('doc-page-1.png')).toBeInTheDocument();
  });

  it('falls back to a default base name for dotfiles', async () => {
    const user = userEvent.setup();
    render(<DocumentTools />);

    await selectOperation(user, 'pdf-to-text');
    await uploadFiles(user, [pdfFile('.pdf')]);
    await run(user);

    await waitFor(() => {
      expect(mockedPdfToText).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('document.txt')).toBeInTheDocument();
  });

  it('renders the operation select and a disabled run button', () => {
    render(<DocumentTools />);

    expect(screen.getByLabelText(/operation/i)).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Merge PDFs' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^run$/i })).toBeDisabled();
  });

  it('merges PDFs and offers the merged file for download', async () => {
    const user = userEvent.setup();
    render(<DocumentTools />);

    await uploadFiles(user, [pdfFile('a.pdf'), pdfFile('b.pdf')]);
    await run(user);

    await waitFor(() => {
      expect(mockedMergePdfs).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('merged.pdf')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /download merged.pdf/i }),
    );
    expect(mockedDownloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      'merged.pdf',
    );
  });

  it('splits a PDF by page ranges', async () => {
    const user = userEvent.setup();
    render(<DocumentTools />);

    await selectOperation(user, 'split');
    fireEvent.change(screen.getByLabelText(/page ranges/i), {
      target: { value: '1-2' },
    });
    await uploadFiles(user, [pdfFile()]);
    await run(user);

    await waitFor(() => {
      expect(mockedSplitPdf).toHaveBeenCalledWith(expect.any(File), [
        { start: 1, end: 2 },
      ]);
    });
    expect(screen.getByText('doc-part-1.pdf')).toBeInTheDocument();
    expect(screen.getByText('doc-part-2.pdf')).toBeInTheDocument();
  });

  it('reorders PDF pages', async () => {
    const user = userEvent.setup();
    render(<DocumentTools />);

    await selectOperation(user, 'reorder');
    fireEvent.change(screen.getByLabelText(/new page order/i), {
      target: { value: '2, 1' },
    });
    await uploadFiles(user, [pdfFile()]);
    await run(user);

    await waitFor(() => {
      expect(mockedReorderPdf).toHaveBeenCalledWith(expect.any(File), [1, 0]);
    });
    expect(screen.getByText('doc-reordered.pdf')).toBeInTheDocument();
  });

  it('builds a PDF from images', async () => {
    const user = userEvent.setup();
    render(<DocumentTools />);

    await selectOperation(user, 'images-to-pdf');
    await uploadFiles(user, [
      new File(['a'], 'a.png', { type: 'image/png' }),
      new File(['b'], 'b.png', { type: 'image/png' }),
    ]);
    await run(user);

    await waitFor(() => {
      expect(mockedImagesToPdf).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('a.pdf')).toBeInTheDocument();
  });

  it('renders PDF pages to JPEG images', async () => {
    const user = userEvent.setup();
    render(<DocumentTools />);

    await selectOperation(user, 'pdf-to-images');
    await user.selectOptions(screen.getByLabelText(/image format/i), 'jpeg');
    await uploadFiles(user, [pdfFile()]);
    await run(user);

    await waitFor(() => {
      expect(mockedPdfToImages).toHaveBeenCalledWith(expect.any(File), 'jpeg');
    });
    expect(screen.getByText('doc-page-1.jpg')).toBeInTheDocument();
    expect(screen.getByText('doc-page-2.jpg')).toBeInTheDocument();
  });

  it('extracts text from a PDF and shows it', async () => {
    const user = userEvent.setup();
    render(<DocumentTools />);

    await selectOperation(user, 'pdf-to-text');
    await uploadFiles(user, [pdfFile()]);
    await run(user);

    await waitFor(() => {
      expect(mockedPdfToText).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('hello text')).toBeInTheDocument();
    expect(screen.getByText('doc.txt')).toBeInTheDocument();
  });

  it('compresses a PDF structurally', async () => {
    const user = userEvent.setup();
    render(<DocumentTools />);

    await selectOperation(user, 'compress-pdf');
    expect(
      screen.getByText(/does not recompress embedded images/i),
    ).toBeInTheDocument();
    await uploadFiles(user, [pdfFile()]);
    await run(user);

    await waitFor(() => {
      expect(mockedCompressPdf).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('doc-compressed.pdf')).toBeInTheDocument();
  });

  it('converts a text file to PDF', async () => {
    const user = userEvent.setup();
    render(<DocumentTools />);

    await selectOperation(user, 'text-to-pdf');
    await uploadFiles(user, [
      new File(['hello'], 'notes.txt', { type: 'text/plain' }),
    ]);
    await run(user);

    await waitFor(() => {
      expect(mockedTextToPdf).toHaveBeenCalledWith('hello');
    });
    expect(screen.getByText('notes.pdf')).toBeInTheDocument();
  });

  it('extracts text and HTML from a DOCX file', async () => {
    const user = userEvent.setup();
    render(<DocumentTools />);

    await selectOperation(user, 'docx-to-text');
    await uploadFiles(user, [
      new File(['x'], 'doc.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    ]);
    await run(user);

    await waitFor(() => {
      expect(mockedDocxToText).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('docx text')).toBeInTheDocument();
    expect(screen.getByText('doc.txt')).toBeInTheDocument();
    expect(screen.getByText('doc.html')).toBeInTheDocument();
  });

  it('converts a text file to DOCX', async () => {
    const user = userEvent.setup();
    render(<DocumentTools />);

    await selectOperation(user, 'text-to-docx');
    await uploadFiles(user, [
      new File(['hello'], 'notes.txt', { type: 'text/plain' }),
    ]);
    await run(user);

    await waitFor(() => {
      expect(mockedTextToDocx).toHaveBeenCalledWith('hello');
    });
    expect(screen.getByText('notes.docx')).toBeInTheDocument();
  });

  it('shows an error when the operation fails', async () => {
    const user = userEvent.setup();
    mockedMergePdfs.mockRejectedValueOnce(new Error('Merge failed'));
    render(<DocumentTools />);

    await uploadFiles(user, [pdfFile(), pdfFile('b.pdf')]);
    await run(user);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Merge failed');
    });
  });

  it('shows a generic error for non-Error failures', async () => {
    const user = userEvent.setup();
    mockedMergePdfs.mockRejectedValueOnce('boom');
    render(<DocumentTools />);

    await uploadFiles(user, [pdfFile()]);
    await run(user);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Document operation failed',
      );
    });
  });

  it('warns about large files', async () => {
    const user = userEvent.setup();
    render(<DocumentTools />);

    const big = pdfFile('big.pdf');
    Object.defineProperty(big, 'size', { value: 150 * 1024 * 1024 });
    await uploadFiles(user, [big]);

    expect(screen.getByText(/large file/i)).toBeInTheDocument();
  });
});
