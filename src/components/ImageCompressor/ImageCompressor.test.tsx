import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { CompressedImage } from '../../services/imageCompressor';
import {
  compressImage,
  compressToTargetSize,
} from '../../services/imageCompressor';
import { downloadBlob } from '../../utils/download';
import { ImageCompressor } from './ImageCompressor';

vi.mock('../../services/imageCompressor', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../services/imageCompressor')>();
  return {
    ...original,
    compressImage: vi.fn(),
    compressToTargetSize: vi.fn(),
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

const mockedCompressImage = vi.mocked(compressImage);
const mockedCompressToTargetSize = vi.mocked(compressToTargetSize);
const mockedDownloadBlob = vi.mocked(downloadBlob);

function createResult(
  overrides: Partial<CompressedImage> = {},
): CompressedImage {
  return {
    blob: new Blob(['x'.repeat(500)], { type: 'image/webp' }),
    width: 800,
    height: 600,
    format: 'webp',
    quality: 80,
    ...overrides,
  };
}

function getFileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]');

  if (!(input instanceof HTMLInputElement)) {
    throw new Error('File input not found');
  }

  return input;
}

async function selectFile(user: ReturnType<typeof userEvent.setup>) {
  const file = new File(['x'.repeat(1000)], 'photo.png', {
    type: 'image/png',
  });
  const input = getFileInput();
  await user.upload(input, [file]);
  return file;
}

describe('ImageCompressor', () => {
  beforeEach(() => {
    mockedCompressImage.mockResolvedValue(createResult());
    mockedCompressToTargetSize.mockResolvedValue(createResult({ quality: 55 }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dropzone and no controls before a file is selected', () => {
    render(<ImageCompressor />);

    expect(
      screen.getByRole('button', { name: /upload file/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/output format/i)).not.toBeInTheDocument();
  });

  it('compresses with the quality slider and shows before/after sizes', async () => {
    const user = userEvent.setup();
    render(<ImageCompressor />);

    await selectFile(user);

    expect(screen.getByText(/original size: 1000 B/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^compress$/i }));

    await waitFor(() => {
      expect(mockedCompressImage).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'photo.png' }),
        { format: 'webp', quality: 80 },
      );
    });

    expect(screen.getByText(/1000 B → 500 B/i)).toBeInTheDocument();
    expect(screen.getByText(/50% smaller/i)).toBeInTheDocument();
    expect(screen.getByAltText(/compressed preview/i)).toBeInTheDocument();
  });

  it('changes format and quality from the controls', async () => {
    const user = userEvent.setup();
    render(<ImageCompressor />);

    await selectFile(user);

    await user.selectOptions(screen.getByLabelText(/output format/i), 'avif');
    expect(screen.getByText(/avif encoding is slow/i)).toBeInTheDocument();

    const slider = screen.getByLabelText(/quality:/i);
    fireEvent.change(slider, { target: { value: '60' } });

    await user.click(screen.getByRole('button', { name: /^compress$/i }));

    await waitFor(() => {
      expect(mockedCompressImage).toHaveBeenCalledWith(expect.any(File), {
        format: 'avif',
        quality: 60,
      });
    });
  });

  it('compresses to a target size in target-size mode', async () => {
    const user = userEvent.setup();
    render(<ImageCompressor />);

    await selectFile(user);

    await user.click(screen.getByLabelText(/target size$/i));
    await user.clear(screen.getByLabelText(/target size \(kb\)/i));
    await user.type(screen.getByLabelText(/target size \(kb\)/i), '250');

    await user.click(screen.getByRole('button', { name: /^compress$/i }));

    await waitFor(() => {
      expect(mockedCompressToTargetSize).toHaveBeenCalledWith(
        expect.any(File),
        'webp',
        250 * 1024,
      );
    });

    expect(screen.getByText(/quality 55/i)).toBeInTheDocument();

    await user.click(screen.getByLabelText(/^quality$/i));
    expect(screen.getByLabelText(/quality:/i)).toBeInTheDocument();
  });

  it('shows a generic error for non-Error failures', async () => {
    const user = userEvent.setup();
    mockedCompressImage.mockRejectedValueOnce('boom');
    render(<ImageCompressor />);

    await selectFile(user);
    await user.click(screen.getByRole('button', { name: /^compress$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Compression failed');
    });
  });

  it('falls back to a default base name for dotfiles on download', async () => {
    const user = userEvent.setup();
    render(<ImageCompressor />);

    const file = new File(['x'.repeat(1000)], '.png', { type: 'image/png' });
    const input = getFileInput();
    await user.upload(input, [file]);

    await user.click(screen.getByRole('button', { name: /^compress$/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /download compressed image/i }),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole('button', { name: /download compressed image/i }),
    );
    expect(mockedDownloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      'image.webp',
    );
  });

  it('shows an error when compression fails', async () => {
    const user = userEvent.setup();
    mockedCompressImage.mockRejectedValueOnce(new Error('Encode failed'));
    render(<ImageCompressor />);

    await selectFile(user);
    await user.click(screen.getByRole('button', { name: /^compress$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Encode failed');
    });
  });

  it('downloads the compressed image', async () => {
    const user = userEvent.setup();
    render(<ImageCompressor />);

    await selectFile(user);
    await user.click(screen.getByRole('button', { name: /^compress$/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /download compressed image/i }),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole('button', { name: /download compressed image/i }),
    );
    expect(mockedDownloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      'photo.webp',
    );
  });

  it('warns about large files', async () => {
    const user = userEvent.setup();
    render(<ImageCompressor />);

    const big = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 150 * 1024 * 1024 });
    const input = getFileInput();
    await user.upload(input, [big]);

    expect(screen.getByText(/large file/i)).toBeInTheDocument();
  });
});
