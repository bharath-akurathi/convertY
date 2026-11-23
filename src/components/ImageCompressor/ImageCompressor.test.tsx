import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
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
    mockedCompressToTargetSize.mockResolvedValue({
      ...createResult({ quality: 55 }),
      targetMet: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dropzone and no controls before a file is selected', () => {
    render(<ImageCompressor />);

    expect(
      screen.getByRole('button', { name: /choose file/i }),
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

  it('disables compression for an empty or negative size target', async () => {
    const user = userEvent.setup();
    render(<ImageCompressor />);
    await selectFile(user);
    await user.click(screen.getByLabelText(/target size$/i));
    const target = screen.getByLabelText(/target size \(kb\)/i);
    await user.clear(target);
    expect(screen.getByRole('button', { name: 'Compress' })).toBeDisabled();
    fireEvent.change(target, { target: { value: '-4' } });
    expect(screen.getByRole('button', { name: 'Compress' })).toBeDisabled();
  });

  it('does not allocate a preview when compression finishes after unmount', async () => {
    const user = userEvent.setup();
    let finish!: (result: CompressedImage) => void;
    mockedCompressImage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { unmount } = render(<ImageCompressor />);
    await selectFile(user);
    await user.click(screen.getByRole('button', { name: 'Compress' }));
    unmount();
    const create = vi.spyOn(URL, 'createObjectURL');
    create.mockClear();
    await act(async () => {
      finish(createResult());
      await Promise.resolve();
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('warns when the target size could not be reached', async () => {
    const user = userEvent.setup();
    mockedCompressToTargetSize.mockResolvedValueOnce({
      ...createResult({ quality: 1 }),
      targetMet: false,
    });
    render(<ImageCompressor />);

    await selectFile(user);

    await user.click(screen.getByLabelText(/target size$/i));
    await user.clear(screen.getByLabelText(/target size \(kb\)/i));
    await user.type(screen.getByLabelText(/target size \(kb\)/i), '10');

    await user.click(screen.getByRole('button', { name: /^compress$/i }));

    await waitFor(() => {
      expect(screen.getByText(/could not reach 10 kb/i)).toBeInTheDocument();
    });
  });

  it('revokes preview URLs when files are replaced and on unmount', async () => {
    const user = userEvent.setup();
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {
      // jsdom revoke is a no-op for these assertions
    });
    const { unmount } = render(<ImageCompressor />);

    await selectFile(user);
    await user.click(screen.getByRole('button', { name: /^compress$/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /download compressed image/i }),
      ).toBeInTheDocument();
    });

    // Selecting a new file releases the previous input and result URLs.
    const callsBeforeReplace = revoke.mock.calls.length;
    await selectFile(user);
    expect(revoke.mock.calls.length).toBeGreaterThan(callsBeforeReplace);

    // Unmounting releases the current URLs.
    const callsBeforeUnmount = revoke.mock.calls.length;
    unmount();
    expect(revoke.mock.calls.length).toBeGreaterThan(callsBeforeUnmount);

    revoke.mockRestore();
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
