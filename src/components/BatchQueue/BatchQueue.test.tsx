import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { BatchItem } from '../../hooks/useBatchConverter';
import { useBatchConverter } from '../../hooks/useBatchConverter';
import { BatchQueue } from './BatchQueue';

vi.mock('../../hooks/useBatchConverter');

const mockedUseBatchConverter = vi.mocked(useBatchConverter);

function createItem(overrides: Partial<BatchItem> = {}): BatchItem {
  return {
    id: 'batch-1',
    file: new File([], 'photo.png', { type: 'image/png' }),
    category: 'image',
    outputFormat: 'png',
    outputFilename: 'photo.png',
    status: 'queued',
    error: null,
    outputBlob: null,
    ...overrides,
  };
}

function createBatch(
  overrides: Partial<ReturnType<typeof useBatchConverter>> = {},
): ReturnType<typeof useBatchConverter> {
  return {
    items: [],
    status: 'idle',
    addFiles: vi.fn(),
    removeItem: vi.fn(),
    setItemFormat: vi.fn(),
    runAll: vi.fn(() => Promise.resolve()),
    cancel: vi.fn(),
    downloadAll: vi.fn(() => Promise.resolve()),
    clearAll: vi.fn(),
    ...overrides,
  };
}

describe('BatchQueue', () => {
  beforeEach(() => {
    mockedUseBatchConverter.mockReturnValue(createBatch());
  });

  it('renders the file input and disabled actions with an empty queue', () => {
    render(<BatchQueue />);

    expect(screen.getByLabelText(/add files/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /convert all/i })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /download all/i }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: /clear/i })).toBeDisabled();
  });

  it('ignores an empty file selection', async () => {
    const user = userEvent.setup();
    const addFiles = vi.fn();
    mockedUseBatchConverter.mockReturnValue(createBatch({ addFiles }));

    render(<BatchQueue />);

    const input = screen.getByLabelText(/add files/i);
    const emptyInput = document.createElement('input');
    emptyInput.type = 'file';
    fireEvent.change(input, { target: { files: emptyInput.files } });
    expect(addFiles).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { files: null } });
    expect(addFiles).not.toHaveBeenCalled();

    await user.upload(input, []);
    expect(addFiles).not.toHaveBeenCalled();
  });

  it('adds files from the file input', async () => {
    const user = userEvent.setup();
    const addFiles = vi.fn();
    mockedUseBatchConverter.mockReturnValue(createBatch({ addFiles }));

    render(<BatchQueue />);

    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText(/add files/i), [file]);

    expect(addFiles).toHaveBeenCalledWith([file]);
  });

  it('lists queued files with a format select and remove button', async () => {
    const user = userEvent.setup();
    const setItemFormat = vi.fn();
    const removeItem = vi.fn();
    mockedUseBatchConverter.mockReturnValue(
      createBatch({
        items: [
          createItem(),
          createItem({
            id: 'batch-2',
            file: new File([], 'data.csv'),
            category: null,
            outputFormat: '',
            outputFilename: 'data',
            status: 'error',
            error: 'Unsupported file type.',
          }),
        ],
        setItemFormat,
        removeItem,
      }),
    );

    render(<BatchQueue />);

    expect(screen.getByText('photo.png')).toBeInTheDocument();
    expect(screen.getByText('data.csv')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unsupported file type.',
    );
    expect(screen.getByLabelText(/output format for data.csv/i)).toBeDisabled();

    await user.selectOptions(
      screen.getByLabelText(/output format for photo.png/i),
      'webp',
    );
    expect(setItemFormat).toHaveBeenCalledWith('batch-1', 'webp');

    await user.click(screen.getAllByRole('button', { name: /remove/i })[0]);
    expect(removeItem).toHaveBeenCalledWith('batch-1');
  });

  it('warns about large files in the queue', () => {
    const big = new File([], 'big.mp4', { type: 'video/mp4' });
    Object.defineProperty(big, 'size', { value: 200 * 1024 * 1024 });
    mockedUseBatchConverter.mockReturnValue(
      createBatch({
        items: [
          createItem({ file: big, category: 'video', outputFormat: 'mp4' }),
        ],
      }),
    );

    render(<BatchQueue />);

    expect(screen.getByText(/large file/i)).toBeInTheDocument();
  });

  it('runs all conversions and shows the finished summary', async () => {
    const user = userEvent.setup();
    const runAll = vi.fn(() => Promise.resolve());
    mockedUseBatchConverter.mockReturnValue(
      createBatch({
        items: [createItem({ status: 'done' })],
        status: 'done',
        runAll,
      }),
    );

    render(<BatchQueue />);

    expect(screen.getByText(/finished: 1 of 1 converted/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /convert all/i }));
    expect(runAll).toHaveBeenCalled();
  });

  it('downloads all finished files as a ZIP', async () => {
    const user = userEvent.setup();
    const downloadAll = vi.fn(() => Promise.resolve());
    mockedUseBatchConverter.mockReturnValue(
      createBatch({
        items: [createItem({ status: 'done' })],
        downloadAll,
      }),
    );

    render(<BatchQueue />);

    const button = screen.getByRole('button', { name: /download all/i });
    expect(button).toBeEnabled();
    await user.click(button);
    expect(downloadAll).toHaveBeenCalled();
  });

  it('disables controls while a batch is running', () => {
    mockedUseBatchConverter.mockReturnValue(
      createBatch({
        items: [createItem({ status: 'converting' })],
        status: 'running',
      }),
    );

    render(<BatchQueue />);

    expect(screen.getByLabelText(/add files/i)).toBeDisabled();
    // The run button becomes an enabled Cancel button while running.
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeEnabled();
    expect(
      screen.getByLabelText(/output format for photo.png/i),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: /remove/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /clear/i })).toBeDisabled();
  });

  it('cancels a running batch', async () => {
    const user = userEvent.setup();
    const cancel = vi.fn();
    mockedUseBatchConverter.mockReturnValue(
      createBatch({
        items: [createItem({ status: 'converting' })],
        status: 'running',
        cancel,
      }),
    );

    render(<BatchQueue />);

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(cancel).toHaveBeenCalled();
  });

  it('clears the queue', async () => {
    const user = userEvent.setup();
    const clearAll = vi.fn();
    mockedUseBatchConverter.mockReturnValue(
      createBatch({ items: [createItem()], clearAll }),
    );

    render(<BatchQueue />);

    await user.click(screen.getByRole('button', { name: /clear/i }));
    expect(clearAll).toHaveBeenCalled();
  });
});
