import { FolderOpen, Upload } from 'lucide-react';
import { useRef, useState } from 'react';

export interface FileDropzoneProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
  compact?: boolean;
  hint?: string;
}

export function FileDropzone({
  onFileSelect,
  disabled = false,
  compact = false,
  hint = 'Images, video, and audio',
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  function handleClick() {
    inputRef.current?.click();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick();
    }
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];

    if (selectedFile) {
      onFileSelect(selectedFile);
    }

    event.target.value = '';
  }

  function handleDragEnter(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(true);
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!disabled && !dragActive) {
      setDragActive(true);
    }
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const files = event.dataTransfer.files;
    const droppedFile = files.length > 0 ? files[0] : null;

    if (!disabled && droppedFile) {
      onFileSelect(droppedFile);
    }
  }

  return (
    <div
      data-drag-active={dragActive}
      data-compact={compact}
      className="group hover:border-pine-600 hover:bg-pine-50 data-[drag-active=true]:border-pine-700 data-[drag-active=true]:bg-pine-100 dark:data-[drag-active=true]:bg-pine-950 relative isolate flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border border-dashed border-[#a2b6a0] bg-[#f6f9f1] px-4 py-6 text-center outline-offset-4 transition-colors aria-disabled:cursor-not-allowed aria-disabled:opacity-55 data-[compact=true]:min-h-11 data-[compact=true]:flex-row data-[compact=true]:flex-wrap data-[compact=true]:border-transparent data-[compact=true]:bg-transparent data-[compact=true]:p-0 dark:border-slate-600 dark:bg-[#202f24] dark:hover:bg-slate-800"
      onClick={disabled ? undefined : handleClick}
      onKeyDown={disabled ? undefined : handleKeyDown}
      onDragEnter={disabled ? undefined : handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={compact ? 'Choose another file' : 'Choose file'}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(#88a58245_1px,transparent_1px)] [mask-image:linear-gradient(110deg,black,transparent_45%,transparent_60%,black)] bg-size-[16px_16px] group-data-[compact=true]:hidden dark:opacity-55"
      />
      <span
        aria-hidden="true"
        className="border-pine-200 bg-pine-100 text-pine-800 dark:text-pine-200 flex size-12 items-center justify-center rounded-2xl border group-data-[compact=true]:hidden dark:border-slate-600 dark:bg-slate-700"
      >
        <Upload size={23} strokeWidth={1.7} />
      </span>
      <div className="group-data-[compact=true]:hidden">
        <p className="text-xl font-extrabold tracking-[-0.03em]">
          {dragActive ? 'Release to select your file' : 'Drop your file here'}
        </p>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {hint}
        </p>
      </div>
      <span className="primary-action mt-1 px-5 text-sm group-data-[compact=true]:mt-0">
        <FolderOpen aria-hidden="true" size={17} />
        {compact ? 'Choose another file' : 'Choose file'}
      </span>

      <input
        disabled={disabled}
        ref={inputRef}
        className="hidden"
        type="file"
        onChange={handleChange}
        aria-hidden
      />
    </div>
  );
}
