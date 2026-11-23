import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { convertFile } from '../services/fileConverter';
import { downloadBlob } from '../utils/download';
import { useBatchConverter } from './useBatchConverter';
import { useFFmpeg } from './useFFmpeg';

vi.mock('./useFFmpeg');
vi.mock('../services/fileConverter');
vi.mock('../utils/download');

const mockedConvertFile = vi.mocked(convertFile);
const mockedDownloadBlob = vi.mocked(downloadBlob);

function TestComponent() {
  const batch = useBatchConverter();

  return (
    <div>
      <span aria-label="Batch status">{batch.status}</span>
      <span aria-label="Item count">{batch.items.length}</span>
      {batch.items.map((item) => (
        <div key={item.id}>
          <span aria-label={`Name ${item.id}`}>{item.file.name}</span>
          <span aria-label={`Status ${item.id}`}>{item.status}</span>
          <span aria-label={`Format ${item.id}`}>{item.outputFormat}</span>
          <span aria-label={`Filename ${item.id}`}>{item.outputFilename}</span>
          <span aria-label={`Error ${item.id}`}>
            {item.error ?? 'no-error'}
          </span>
          <button
            onClick={() => {
              batch.setItemFormat(item.id, 'webp');
            }}
            type="button"
          >
            Set webp {item.id}
          </button>
          <button
            onClick={() => {
              batch.removeItem(item.id);
            }}
            type="button"
          >
            Remove {item.id}
          </button>
        </div>
      ))}
      <button
        onClick={() => {
          batch.addFiles([new File([], '.png', { type: 'image/png' })]);
        }}
        type="button"
      >
        Add dotfile
      </button>
      <button
        onClick={() => {
          batch.addFiles([
            new File([], 'photo.png', { type: 'image/png' }),
            new File([], 'song.mp3', { type: 'audio/mpeg' }),
            new File([], 'data.csv'),
          ]);
        }}
        type="button"
      >
        Add files
      </button>
      <button
        onClick={() => {
          void batch.runAll();
        }}
        type="button"
      >
        Run all
      </button>
      <button onClick={batch.cancel} type="button">
        Cancel
      </button>
      <button
        onClick={() => {
          void batch.downloadAll();
        }}
        type="button"
      >
        Download all
      </button>
      <button onClick={batch.clearAll} type="button">
        Clear all
      </button>
    </div>
  );
}

describe('useBatchConverter', () => {
  beforeEach(() => {
    vi.mocked(useFFmpeg).mockReturnValue({
      loaded: true,
      loading: false,
      converting: false,
      progress: 0,
      error: null,
      load: vi.fn(() => Promise.resolve()),
      convert: vi.fn(() => Promise.resolve(new Uint8Array([1]))),
      cancel: vi.fn(),
      resetError: vi.fn(),
    });

    mockedConvertFile.mockImplementation((_engine, file, format) =>
      Promise.resolve({
        blob: new Blob(['out'], { type: 'image/png' }),
        filename: file.name.replace(/\.[^.]*$/, `.${format}`),
      }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('stops before the next queued file when the batch tool unmounts', async () => {
    const user = userEvent.setup();
    let finish!: () => void;
    mockedConvertFile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => {
            resolve({ blob: new Blob(), filename: 'a.png' });
          };
        }),
    );
    const { unmount } = render(<TestComponent />);
    await user.click(screen.getByRole('button', { name: 'Add files' }));
    await user.click(screen.getByRole('button', { name: 'Run all' }));
    unmount();
    finish();
    await Promise.resolve();
    expect(mockedConvertFile).toHaveBeenCalledTimes(1);
  });

  it('adds files with default formats and queues them', async () => {
    const user = userEvent.setup();
    render(<TestComponent />);

    await user.click(screen.getByRole('button', { name: /add files/i }));

    expect(screen.getByLabelText('Item count')).toHaveTextContent('3');
    expect(screen.getByLabelText('Name batch-1')).toHaveTextContent(
      'photo.png',
    );
    expect(screen.getAllByLabelText(/Status batch-/)).toHaveLength(3);
    for (const status of screen.getAllByLabelText(/Status batch-/)) {
      expect(status).toHaveTextContent('queued');
    }
  });

  it('falls back to a default base name for dotfiles', async () => {
    const user = userEvent.setup();
    render(<TestComponent />);

    await user.click(screen.getByRole('button', { name: /add dotfile/i }));

    expect(screen.getByLabelText('Filename batch-1')).toHaveTextContent(
      'output.png',
    );
  });

  it('does nothing on run when the queue is empty', async () => {
    const user = userEvent.setup();
    render(<TestComponent />);

    await user.click(screen.getByRole('button', { name: /run all/i }));

    expect(mockedConvertFile).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Batch status')).toHaveTextContent('idle');
  });

  it('converts queued files sequentially and marks unsupported files as errors', async () => {
    const user = userEvent.setup();
    render(<TestComponent />);

    await user.click(screen.getByRole('button', { name: /add files/i }));
    await user.click(screen.getByRole('button', { name: /run all/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Batch status')).toHaveTextContent('done');
    });

    expect(mockedConvertFile).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Status batch-1')).toHaveTextContent('done');
    expect(screen.getByLabelText('Status batch-2')).toHaveTextContent('done');
    expect(screen.getByLabelText('Status batch-3')).toHaveTextContent('error');
    expect(screen.getByLabelText('Error batch-3')).toHaveTextContent(
      /unsupported file type/i,
    );
  });

  it('records a per-file error and continues with the next file', async () => {
    const user = userEvent.setup();
    mockedConvertFile.mockRejectedValueOnce(new Error('FFmpeg failed'));

    render(<TestComponent />);

    await user.click(screen.getByRole('button', { name: /add files/i }));
    await user.click(screen.getByRole('button', { name: /run all/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Batch status')).toHaveTextContent('done');
    });

    expect(mockedConvertFile).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Error batch-1')).toHaveTextContent(
      'FFmpeg failed',
    );
    expect(screen.getByLabelText('Status batch-2')).toHaveTextContent('done');
  });

  it('uses a generic message for non-Error failures', async () => {
    const user = userEvent.setup();
    mockedConvertFile.mockRejectedValueOnce('boom');

    render(<TestComponent />);

    await user.click(screen.getByRole('button', { name: /add files/i }));
    await user.click(screen.getByRole('button', { name: /run all/i }));

    await waitFor(() => {
      expect(screen.getByText('Conversion failed')).toBeInTheDocument();
    });
  });

  it('updates a file format and its filename', async () => {
    const user = userEvent.setup();
    render(<TestComponent />);

    await user.click(screen.getByRole('button', { name: /add files/i }));
    const buttons = screen.getAllByRole('button', { name: /set webp/i });
    await user.click(buttons[0]);

    expect(screen.getByLabelText('Format batch-1')).toHaveTextContent('webp');
    expect(screen.getByLabelText('Filename batch-1')).toHaveTextContent(
      'photo.webp',
    );
  });

  it('removes an item from the queue', async () => {
    const user = userEvent.setup();
    render(<TestComponent />);

    await user.click(screen.getByRole('button', { name: /add files/i }));
    await user.click(screen.getByRole('button', { name: /remove batch-1/i }));

    expect(screen.getByLabelText('Item count')).toHaveTextContent('2');
    expect(screen.queryByText('photo.png')).not.toBeInTheDocument();
  });

  it('downloads all finished files as a ZIP', async () => {
    const user = userEvent.setup();
    render(<TestComponent />);

    await user.click(screen.getByRole('button', { name: /add files/i }));
    await user.click(screen.getByRole('button', { name: /run all/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Batch status')).toHaveTextContent('done');
    });

    await user.click(screen.getByRole('button', { name: /download all/i }));

    await waitFor(() => {
      expect(mockedDownloadBlob).toHaveBeenCalledWith(
        expect.any(Blob),
        'converted.zip',
      );
    });
  });

  it('does nothing on download when nothing is finished', async () => {
    const user = userEvent.setup();
    render(<TestComponent />);

    await user.click(screen.getByRole('button', { name: /download all/i }));
    expect(mockedDownloadBlob).not.toHaveBeenCalled();
  });

  it('clears the queue', async () => {
    const user = userEvent.setup();
    render(<TestComponent />);

    await user.click(screen.getByRole('button', { name: /add files/i }));
    await user.click(screen.getByRole('button', { name: /clear all/i }));

    expect(screen.getByLabelText('Item count')).toHaveTextContent('0');
    expect(screen.getByLabelText('Batch status')).toHaveTextContent('idle');
  });

  it('skips files that are already done on a second run', async () => {
    const user = userEvent.setup();
    render(<TestComponent />);

    await user.click(screen.getByRole('button', { name: /add files/i }));
    await user.click(screen.getByRole('button', { name: /run all/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Batch status')).toHaveTextContent('done');
    });

    await user.click(screen.getByRole('button', { name: /run all/i }));

    await waitFor(() => {
      expect(mockedConvertFile).toHaveBeenCalledTimes(2);
    });
  });

  it('does not start a second run while one is already running', async () => {
    const user = userEvent.setup();
    let resolveConvert!: (value: { blob: Blob; filename: string }) => void;
    mockedConvertFile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveConvert = resolve;
        }),
    );

    render(<TestComponent />);

    await user.click(screen.getByRole('button', { name: /add files/i }));
    await user.click(screen.getByRole('button', { name: /run all/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Status batch-1')).toHaveTextContent(
        'converting',
      );
    });

    // A second run while the first is in flight must be ignored.
    await user.click(screen.getByRole('button', { name: /run all/i }));
    expect(mockedConvertFile).toHaveBeenCalledTimes(1);

    resolveConvert({
      blob: new Blob(['out'], { type: 'image/png' }),
      filename: 'photo.png',
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Batch status')).toHaveTextContent('done');
    });

    // Only the first run converted the files.
    expect(mockedConvertFile).toHaveBeenCalledTimes(2);
  });

  it('cancels a running batch and returns in-flight items to the queue', async () => {
    const user = userEvent.setup();
    let resolveConvert!: (value: { blob: Blob; filename: string }) => void;
    mockedConvertFile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveConvert = resolve;
        }),
    );

    render(<TestComponent />);

    await user.click(screen.getByRole('button', { name: /add files/i }));
    await user.click(screen.getByRole('button', { name: /run all/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Status batch-1')).toHaveTextContent(
        'converting',
      );
    });

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    // The in-flight conversion finishes, but the batch was cancelled, so
    // its result is discarded and the item goes back to the queue.
    resolveConvert({
      blob: new Blob(['out'], { type: 'image/png' }),
      filename: 'photo.png',
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Batch status')).toHaveTextContent('idle');
    });

    expect(screen.getByLabelText('Status batch-1')).toHaveTextContent('queued');
    expect(screen.getByLabelText('Error batch-1')).toHaveTextContent(
      'no-error',
    );
    // The second file was never started.
    expect(mockedConvertFile).toHaveBeenCalledTimes(1);
  });

  it('stops the loop when a conversion rejects after cancellation', async () => {
    const user = userEvent.setup();
    let rejectConvert!: (reason: Error) => void;
    mockedConvertFile.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectConvert = reject;
        }),
    );

    render(<TestComponent />);

    await user.click(screen.getByRole('button', { name: /add files/i }));
    await user.click(screen.getByRole('button', { name: /run all/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Status batch-1')).toHaveTextContent(
        'converting',
      );
    });

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    // The in-flight conversion fails because it was cancelled; the item
    // must not be marked as an error, and the next file must not start.
    rejectConvert(new Error('Conversion cancelled'));

    await waitFor(() => {
      expect(screen.getByLabelText('Batch status')).toHaveTextContent('idle');
    });

    expect(screen.getByLabelText('Status batch-1')).toHaveTextContent('queued');
    expect(screen.getByLabelText('Error batch-1')).toHaveTextContent(
      'no-error',
    );
    expect(mockedConvertFile).toHaveBeenCalledTimes(1);
  });

  it('stops the active loop when the queue is cleared', async () => {
    const user = userEvent.setup();
    let resolveConvert!: (value: { blob: Blob; filename: string }) => void;
    mockedConvertFile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveConvert = resolve;
        }),
    );

    render(<TestComponent />);

    await user.click(screen.getByRole('button', { name: /add files/i }));
    await user.click(screen.getByRole('button', { name: /run all/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Status batch-1')).toHaveTextContent(
        'converting',
      );
    });

    await user.click(screen.getByRole('button', { name: /clear all/i }));

    expect(screen.getByLabelText('Item count')).toHaveTextContent('0');

    // The in-flight conversion finishes, but the queue was cleared, so
    // nothing is recorded and the second file never starts.
    resolveConvert({
      blob: new Blob(['out'], { type: 'image/png' }),
      filename: 'photo.png',
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Batch status')).toHaveTextContent('idle');
    });

    expect(screen.getByLabelText('Item count')).toHaveTextContent('0');
    expect(mockedConvertFile).toHaveBeenCalledTimes(1);
  });

  it('invalidates a finished file when its format changes', async () => {
    const user = userEvent.setup();
    render(<TestComponent />);

    await user.click(screen.getByRole('button', { name: /add files/i }));
    await user.click(screen.getByRole('button', { name: /run all/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('Batch status')).toHaveTextContent('done');
    });

    expect(screen.getByLabelText('Status batch-1')).toHaveTextContent('done');

    const buttons = screen.getAllByRole('button', { name: /set webp/i });
    await user.click(buttons[0]);

    // The finished result belonged to the old format, so the file goes
    // back to the queue to be converted again.
    expect(screen.getByLabelText('Status batch-1')).toHaveTextContent('queued');
    expect(screen.getByLabelText('Format batch-1')).toHaveTextContent('webp');
    expect(screen.getByLabelText('Filename batch-1')).toHaveTextContent(
      'photo.webp',
    );
  });
});
