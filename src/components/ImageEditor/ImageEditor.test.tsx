import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { applyEdits } from '../../services/imageEditor';
import { downloadBlob } from '../../utils/download';
import { ImageEditor } from './ImageEditor';

vi.mock('../../services/imageEditor', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../services/imageEditor')>();
  return {
    ...original,
    applyEdits: vi.fn(),
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

const mockedApplyEdits = vi.mocked(applyEdits);
const mockedDownloadBlob = vi.mocked(downloadBlob);

function createFakeBitmap(width = 800, height = 600): ImageBitmap {
  return { width, height, close: vi.fn() };
}

describe('ImageEditor', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => Promise.resolve(createFakeBitmap())),
    );
    mockedApplyEdits.mockResolvedValue(
      new Blob(['edited'], { type: 'image/webp' }),
    );
    vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue(
      {
        left: 0,
        top: 0,
        width: 800,
        height: 600,
        right: 800,
        bottom: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function getFileInput(): HTMLInputElement {
    const input = document.querySelector('input[type="file"]');

    if (!(input instanceof HTMLInputElement)) {
      throw new Error('File input not found');
    }

    return input;
  }

  async function selectFile(user: ReturnType<typeof userEvent.setup>) {
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const input = getFileInput();
    await user.upload(input, [file]);

    await waitFor(() => {
      expect(screen.getByAltText(/image to edit/i)).toBeInTheDocument();
    });
  }

  function previewContainer(): HTMLElement {
    return screen.getByRole('img', {
      name: /drag to select a crop area/i,
    });
  }

  it('renders the dropzone and no editor before a file is selected', () => {
    render(<ImageEditor />);

    expect(
      screen.getByRole('button', { name: /choose file/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/rotate right/i)).not.toBeInTheDocument();
  });

  it('warns about large files', async () => {
    const user = userEvent.setup();
    render(<ImageEditor />);

    const big = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 150 * 1024 * 1024 });
    const input = getFileInput();
    await user.upload(input, [big]);

    await waitFor(() => {
      expect(screen.getByAltText(/image to edit/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/large file/i)).toBeInTheDocument();
  });

  it('falls back to a default base name for dotfiles on download', async () => {
    const user = userEvent.setup();
    render(<ImageEditor />);

    const file = new File(['x'], '.png', { type: 'image/png' });
    const input = getFileInput();
    await user.upload(input, [file]);

    await waitFor(() => {
      expect(screen.getByAltText(/image to edit/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /^export$/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /download edited image/i }),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole('button', { name: /download edited image/i }),
    );
    expect(mockedDownloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      'image-edited.jpg',
    );
  });

  it('shows an error when the image cannot be read', async () => {
    const user = userEvent.setup();
    vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error('bad image'));
    render(<ImageEditor />);

    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const input = getFileInput();
    await user.upload(input, [file]);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Could not read this image file.',
      );
    });
  });

  it('draws a crop rectangle by dragging on the preview', async () => {
    const user = userEvent.setup();
    render(<ImageEditor />);
    await selectFile(user);

    const container = previewContainer();
    fireEvent.pointerDown(container, {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(container, {
      pointerId: 1,
      clientX: 300,
      clientY: 250,
    });
    fireEvent.pointerUp(container, { pointerId: 1 });

    expect(screen.getByText(/crop: 100, 100, 200×150/i)).toBeInTheDocument();
  });

  it('captures the pointer when starting a crop drag', async () => {
    const user = userEvent.setup();
    render(<ImageEditor />);
    await selectFile(user);

    const container = previewContainer();
    const setPointerCapture = vi.fn();
    container.setPointerCapture = setPointerCapture;

    fireEvent.pointerDown(container, {
      pointerId: 7,
      clientX: 100,
      clientY: 100,
    });

    expect(setPointerCapture).toHaveBeenCalledWith(7);
  });

  it('cancels a crop drag on pointer cancel', async () => {
    const user = userEvent.setup();
    render(<ImageEditor />);
    await selectFile(user);

    const container = previewContainer();
    fireEvent.pointerDown(container, {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(container, {
      pointerId: 1,
      clientX: 300,
      clientY: 250,
    });
    fireEvent.pointerCancel(container, { pointerId: 1 });

    expect(screen.queryByText(/crop:/i)).not.toBeInTheDocument();
  });

  it('ignores pointer moves and pointer ups without a drag', async () => {
    const user = userEvent.setup();
    render(<ImageEditor />);
    await selectFile(user);

    const container = previewContainer();
    fireEvent.pointerMove(container, {
      pointerId: 1,
      clientX: 300,
      clientY: 250,
    });
    fireEvent.pointerUp(container, { pointerId: 1 });

    expect(screen.queryByText(/crop:/i)).not.toBeInTheDocument();
  });

  it('does not set a crop for a click without dragging', async () => {
    const user = userEvent.setup();
    render(<ImageEditor />);
    await selectFile(user);

    const container = previewContainer();
    fireEvent.pointerDown(container, {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerUp(container, { pointerId: 1 });

    expect(screen.queryByText(/crop:/i)).not.toBeInTheDocument();
  });

  it('clears the crop', async () => {
    const user = userEvent.setup();
    render(<ImageEditor />);
    await selectFile(user);

    const container = previewContainer();
    fireEvent.pointerDown(container, {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(container, {
      pointerId: 1,
      clientX: 300,
      clientY: 250,
    });
    fireEvent.pointerUp(container, { pointerId: 1 });

    await user.click(screen.getByRole('button', { name: /clear crop/i }));
    expect(screen.queryByText(/crop:/i)).not.toBeInTheDocument();
  });

  it('rotates, flips, and resets', async () => {
    const user = userEvent.setup();
    render(<ImageEditor />);
    await selectFile(user);

    await user.click(screen.getByRole('button', { name: /rotate right/i }));
    await user.click(screen.getByRole('button', { name: /rotate right/i }));
    await user.click(screen.getByRole('button', { name: /rotate left/i }));
    await user.click(screen.getByRole('button', { name: /flip horizontal/i }));
    expect(
      screen.getByRole('button', { name: /unflip horizontal/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /flip vertical/i }));
    expect(
      screen.getByRole('button', { name: /unflip vertical/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /reset/i }));
    expect(
      screen.getByRole('button', { name: /flip horizontal/i }),
    ).toBeInTheDocument();
  });

  it('applies filter presets and sliders', async () => {
    const user = userEvent.setup();
    render(<ImageEditor />);
    await selectFile(user);

    await user.click(screen.getByRole('button', { name: 'Grayscale' }));
    expect(screen.getByLabelText(/grayscale:/i)).toHaveValue('100');

    await user.click(screen.getByRole('button', { name: 'Sepia' }));
    expect(screen.getByLabelText(/sepia:/i)).toHaveValue('100');

    await user.click(screen.getByRole('button', { name: 'Vivid' }));
    expect(screen.getByLabelText(/saturate:/i)).toHaveValue('150');

    await user.click(screen.getByRole('button', { name: 'Normal' }));
    expect(screen.getByLabelText(/grayscale:/i)).toHaveValue('0');

    fireEvent.change(screen.getByLabelText(/brightness:/i), {
      target: { value: '120' },
    });
    expect(screen.getByLabelText(/brightness:/i)).toHaveValue('120');
  });

  it('exports the edited image and downloads it', async () => {
    const user = userEvent.setup();
    render(<ImageEditor />);
    await selectFile(user);

    await user.selectOptions(screen.getByLabelText(/export format/i), 'webp');
    fireEvent.change(screen.getByLabelText(/quality:/i), {
      target: { value: '70' },
    });

    await user.click(screen.getByRole('button', { name: /^export$/i }));

    await waitFor(() => {
      expect(mockedApplyEdits).toHaveBeenCalledWith(
        expect.objectContaining({ width: 800, height: 600 }),
        expect.objectContaining({ format: 'webp', quality: 70 }),
      );
    });

    expect(screen.getByAltText(/edited preview/i)).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: /download edited image/i }),
    );
    expect(mockedDownloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      'photo-edited.webp',
    );
  });

  it('downloads with the format used at export, not the current selector', async () => {
    const user = userEvent.setup();
    render(<ImageEditor />);
    await selectFile(user);

    // Default export format is JPEG.
    await user.click(screen.getByRole('button', { name: /^export$/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /download edited image/i }),
      ).toBeInTheDocument();
    });

    // Change the selector after exporting; the download must still be JPEG.
    await user.selectOptions(screen.getByLabelText(/export format/i), 'png');
    await user.click(
      screen.getByRole('button', { name: /download edited image/i }),
    );
    expect(mockedDownloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      'photo-edited.jpg',
    );
  });

  it('clears the previous bitmap before decoding a replacement and releases a late decode', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ImageEditor />);
    await selectFile(user);
    let finish!: (bitmap: ImageBitmap) => void;
    vi.mocked(createImageBitmap).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await user.upload(
      getFileInput(),
      new File(['b'], 'next.png', { type: 'image/png' }),
    );
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
    unmount();
    const close = vi.fn();
    const late: ImageBitmap = { width: 800, height: 600, close };
    await act(async () => {
      finish(late);
      await Promise.resolve();
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('ignores a stale image decode when a newer file was selected', async () => {
    const user = userEvent.setup();
    let resolveFirstDecode!: (bitmap: ImageBitmap) => void;
    const firstDecode = new Promise<ImageBitmap>((resolve) => {
      resolveFirstDecode = resolve;
    });
    vi.mocked(createImageBitmap)
      .mockImplementationOnce(() => firstDecode)
      .mockImplementationOnce(() =>
        Promise.resolve(createFakeBitmap(400, 300)),
      );

    render(<ImageEditor />);

    const input = getFileInput();
    const first = new File(['x'], 'first.png', { type: 'image/png' });
    await user.upload(input, [first]);

    const second = new File(['y'], 'second.png', { type: 'image/png' });
    await user.upload(input, [second]);

    await waitFor(() => {
      expect(screen.getByAltText(/image to edit/i)).toBeInTheDocument();
    });

    // The first decode finishes late; it must not replace the second image.
    resolveFirstDecode(createFakeBitmap(800, 600));
    await waitFor(() => {
      expect(screen.getByText('second.png')).toBeInTheDocument();
    });

    // Crop math uses the second (400x300) bitmap, not the stale 800x600 one.
    const container = previewContainer();
    fireEvent.pointerDown(container, {
      pointerId: 1,
      clientX: 100,
      clientY: 100,
    });
    fireEvent.pointerMove(container, {
      pointerId: 1,
      clientX: 300,
      clientY: 250,
    });
    fireEvent.pointerUp(container, { pointerId: 1 });

    expect(screen.getByText(/crop: 50, 50, 100×75/i)).toBeInTheDocument();
  });

  it('ignores a stale image decode error when a newer file was selected', async () => {
    const user = userEvent.setup();
    let rejectFirstDecode!: (reason: Error) => void;
    const firstDecode = new Promise<ImageBitmap>((_resolve, reject) => {
      rejectFirstDecode = reject;
    });
    vi.mocked(createImageBitmap)
      .mockImplementationOnce(() => firstDecode)
      .mockImplementationOnce(() =>
        Promise.resolve(createFakeBitmap(400, 300)),
      );

    render(<ImageEditor />);

    const input = getFileInput();
    const first = new File(['x'], 'first.png', { type: 'image/png' });
    await user.upload(input, [first]);

    const second = new File(['y'], 'second.png', { type: 'image/png' });
    await user.upload(input, [second]);

    await waitFor(() => {
      expect(screen.getByAltText(/image to edit/i)).toBeInTheDocument();
    });

    // The first decode fails late; the error must be ignored (no alert).
    rejectFirstDecode(new Error('bad image'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('second.png')).toBeInTheDocument();
  });

  it('releases preview URLs and the bitmap on unmount', async () => {
    const user = userEvent.setup();
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {
      // jsdom revoke is a no-op for these assertions
    });
    const { unmount } = render(<ImageEditor />);
    await selectFile(user);

    await user.click(screen.getByRole('button', { name: /^export$/i }));
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /download edited image/i }),
      ).toBeInTheDocument();
    });

    const callsBeforeUnmount = revoke.mock.calls.length;
    unmount();
    expect(revoke.mock.calls.length).toBeGreaterThan(callsBeforeUnmount);

    revoke.mockRestore();
  });

  it('does not allocate a preview for an export that finishes after unmount', async () => {
    const user = userEvent.setup();
    let finish!: (blob: Blob) => void;
    mockedApplyEdits.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { unmount } = render(<ImageEditor />);
    await selectFile(user);
    await user.click(screen.getByRole('button', { name: 'Export' }));
    unmount();
    const create = vi.spyOn(URL, 'createObjectURL');
    create.mockClear();
    await act(async () => {
      finish(new Blob());
      await Promise.resolve();
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('shows an error when export fails', async () => {
    const user = userEvent.setup();
    mockedApplyEdits.mockRejectedValueOnce(new Error('Export boom'));
    render(<ImageEditor />);
    await selectFile(user);

    await user.click(screen.getByRole('button', { name: /^export$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Export boom');
    });
  });

  it('shows a generic error for non-Error export failures', async () => {
    const user = userEvent.setup();
    mockedApplyEdits.mockRejectedValueOnce('boom');
    render(<ImageEditor />);
    await selectFile(user);

    await user.click(screen.getByRole('button', { name: /^export$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Export failed');
    });
  });
});
