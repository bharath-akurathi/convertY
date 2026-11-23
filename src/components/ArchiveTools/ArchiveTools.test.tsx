import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ZipEntry } from '../../services/archiveTools';
import {
  createZip,
  downloadZipEntry,
  extractZip,
} from '../../services/archiveTools';
import { downloadBlob } from '../../utils/download';
import { ArchiveTools } from './ArchiveTools';

vi.mock('../../services/archiveTools', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../services/archiveTools')>();
  return {
    ...original,
    createZip: vi.fn(),
    extractZip: vi.fn(),
    downloadZipEntry: vi.fn(),
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

const mockedCreateZip = vi.mocked(createZip);
const mockedExtractZip = vi.mocked(extractZip);
const mockedDownloadZipEntry = vi.mocked(downloadZipEntry);
const mockedDownloadBlob = vi.mocked(downloadBlob);

describe('ArchiveTools', () => {
  beforeEach(() => {
    mockedCreateZip.mockResolvedValue(
      new Blob(['zip'], { type: 'application/zip' }),
    );
    const entries: ZipEntry[] = [
      { name: 'a.txt', size: 3, data: new Uint8Array([97, 98, 99]) },
      { name: 'b.txt', size: 3, data: new Uint8Array([100, 101, 102]) },
    ];
    mockedExtractZip.mockResolvedValue(entries);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function uploadFiles(
    user: ReturnType<typeof userEvent.setup>,
    files: File[],
  ) {
    const input = screen.getByLabelText(/select.*file/i);
    await user.upload(input, files);
  }

  it('ignores an empty file selection', () => {
    render(<ArchiveTools />);

    const input = screen.getByLabelText(/select.*file/i);
    fireEvent.change(input, { target: { files: null } });
    expect(screen.getByRole('button', { name: /create zip/i })).toBeDisabled();
  });

  it('states the ZIP-only scope', () => {
    render(<ArchiveTools />);

    expect(screen.getByText(/zip only/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create zip/i })).toBeDisabled();
  });

  it('creates a ZIP from multiple files and downloads it', async () => {
    const user = userEvent.setup();
    render(<ArchiveTools />);

    await uploadFiles(user, [
      new File(['a'], 'a.txt', { type: 'text/plain' }),
      new File(['b'], 'b.txt', { type: 'text/plain' }),
    ]);

    await user.click(screen.getByRole('button', { name: /create zip/i }));

    await waitFor(() => {
      expect(mockedCreateZip).toHaveBeenCalledTimes(1);
    });
    expect(mockedDownloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      'archive.zip',
    );
  });

  it('reports an archive containing only directory entries as empty', async () => {
    const user = userEvent.setup();
    mockedExtractZip.mockResolvedValueOnce([
      { name: 'folder/', size: 0, data: new Uint8Array() },
    ]);
    render(<ArchiveTools />);
    await user.click(screen.getByRole('radio', { name: 'Extract ZIP' }));
    await uploadFiles(user, [new File([], 'empty.zip')]);
    await user.click(screen.getByRole('button', { name: 'Extract ZIP' }));
    expect(
      await screen.findByText('This archive contains no files.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /download/i })).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Create ZIP' }));
    expect(screen.queryByText('This archive contains no files.')).toBeNull();
  });

  it('extracts a ZIP and lists its contents with per-file downloads', async () => {
    const user = userEvent.setup();
    render(<ArchiveTools />);

    await user.click(screen.getByLabelText(/extract zip/i));
    await uploadFiles(user, [
      new File(['zip'], 'archive.zip', { type: 'application/zip' }),
    ]);

    await user.click(screen.getByRole('button', { name: /extract zip/i }));

    await waitFor(() => {
      expect(mockedExtractZip).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText(/contents of archive.zip/i)).toBeInTheDocument();
    expect(screen.getByText(/a.txt \(3 B\)/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /download a.txt/i }));
    expect(mockedDownloadZipEntry).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'a.txt' }),
    );
  });

  it('switches back to create mode and clears the selection', async () => {
    const user = userEvent.setup();
    render(<ArchiveTools />);

    await user.click(screen.getByLabelText(/extract zip/i));
    await uploadFiles(user, [
      new File(['zip'], 'archive.zip', { type: 'application/zip' }),
    ]);
    expect(screen.getByText(/archive.zip/i)).toBeInTheDocument();

    await user.click(screen.getByLabelText(/^create zip$/i));
    expect(screen.queryByText(/archive.zip/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create zip/i })).toBeDisabled();
  });

  it('shows an error when extraction fails', async () => {
    const user = userEvent.setup();
    mockedExtractZip.mockRejectedValueOnce(new Error('Not a ZIP file'));
    render(<ArchiveTools />);

    await user.click(screen.getByLabelText(/extract zip/i));
    await uploadFiles(user, [
      new File(['x'], 'bad.zip', { type: 'application/zip' }),
    ]);
    await user.click(screen.getByRole('button', { name: /extract zip/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Not a ZIP file');
    });
  });

  it('shows a generic error for non-Error failures', async () => {
    const user = userEvent.setup();
    mockedCreateZip.mockRejectedValueOnce('boom');
    render(<ArchiveTools />);

    await uploadFiles(user, [new File(['a'], 'a.txt')]);
    await user.click(screen.getByRole('button', { name: /create zip/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Archive operation failed',
      );
    });
  });

  it('warns about large files', async () => {
    const user = userEvent.setup();
    render(<ArchiveTools />);

    const big = new File(['x'], 'big.bin');
    Object.defineProperty(big, 'size', { value: 150 * 1024 * 1024 });
    await uploadFiles(user, [big]);

    expect(screen.getByText(/large file/i)).toBeInTheDocument();
  });
});
