import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

function createFakeBitmap(): ImageBitmap {
  return { width: 800, height: 600, close: vi.fn() };
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
      screen.getByRole('button', { name: /upload file/i }),
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
    fireEvent.mouseDown(container, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(container, { clientX: 300, clientY: 250 });
    fireEvent.mouseUp(container);

    expect(screen.getByText(/crop: 100, 100, 200×150/i)).toBeInTheDocument();
  });

  it('ignores mouse moves and mouse ups without a drag', async () => {
    const user = userEvent.setup();
    render(<ImageEditor />);
    await selectFile(user);

    const container = previewContainer();
    fireEvent.mouseMove(container, { clientX: 300, clientY: 250 });
    fireEvent.mouseUp(container);

    expect(screen.queryByText(/crop:/i)).not.toBeInTheDocument();
  });

  it('does not set a crop for a click without dragging', async () => {
    const user = userEvent.setup();
    render(<ImageEditor />);
    await selectFile(user);

    const container = previewContainer();
    fireEvent.mouseDown(container, { clientX: 100, clientY: 100 });
    fireEvent.mouseUp(container);

    expect(screen.queryByText(/crop:/i)).not.toBeInTheDocument();
  });

  it('clears the crop', async () => {
    const user = userEvent.setup();
    render(<ImageEditor />);
    await selectFile(user);

    const container = previewContainer();
    fireEvent.mouseDown(container, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(container, { clientX: 300, clientY: 250 });
    fireEvent.mouseUp(container);

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
