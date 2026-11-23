import {
  ArrowRightLeft,
  CodeXml,
  Crop,
  FileText,
  FolderArchive,
  LockKeyhole,
  Shrink,
} from 'lucide-react';
import { useState } from 'react';

import { ArchiveTools } from '../ArchiveTools';
import { DocumentTools } from '../DocumentTools';
import { FileConverter } from '../FileConverter';
import { ImageCompressor } from '../ImageCompressor';
import { ImageEditor } from '../ImageEditor';
import type { ToolTab } from '../ToolTabs';
import { ToolTabs } from '../ToolTabs';
import { FileArtwork } from './FileArtwork';

const TABS: ToolTab[] = [
  { id: 'convert', label: 'Convert', icon: ArrowRightLeft },
  { id: 'compress', label: 'Compress', icon: Shrink },
  { id: 'edit', label: 'Edit', icon: Crop },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'archives', label: 'Archives', icon: FolderArchive },
];

export function App() {
  const [activeTab, setActiveTab] = useState('convert');

  return (
    <div className="bg-studio min-h-screen font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <a
        href="#tool-panel"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-20 focus:rounded-lg focus:bg-white focus:p-3 focus:text-slate-900"
      >
        Skip to tool
      </a>
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="workspace-width flex h-16 items-center justify-between">
          <a
            className="inline-flex items-center gap-2.5 rounded-lg text-[1.45rem] font-extrabold tracking-[-0.075em]"
            href={import.meta.env.BASE_URL}
            aria-label="convertY home"
          >
            <img
              src={`${import.meta.env.BASE_URL}logo.svg`}
              alt=""
              width={35}
              height={35}
            />
            <span>
              convert<span className="text-pine-700 dark:text-pine-300">Y</span>
            </span>
          </a>
          <div className="flex items-center gap-5 text-sm font-semibold">
            <span className="hidden items-center gap-2 text-slate-600 sm:flex dark:text-slate-300">
              <LockKeyhole
                aria-hidden="true"
                size={15}
                className="text-pine-700 dark:text-pine-300"
              />{' '}
              On-device processing
            </span>
            <a
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              href="https://github.com/bharath-akurathi/convertY"
            >
              <CodeXml aria-hidden="true" size={17} />
              GitHub
            </a>
          </div>
        </div>
      </header>
      <main className="workspace-width">
        <div className="flex items-center justify-between gap-4 py-9 sm:py-5 lg:py-7">
          <div className="min-w-0">
            <h1 className="font-display text-[clamp(2.55rem,11.6vw,2.9rem)] leading-[1.03] tracking-[-0.055em] sm:text-[clamp(3.1rem,6vw,4.85rem)]">
              File{' '}
              <em className="text-pine-700 dark:text-pine-300">workbench.</em>
            </h1>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg dark:text-slate-300">
              Convert, compress, and edit files in your browser.
            </p>
          </div>
          <FileArtwork />
        </div>
        <ToolTabs activeTab={activeTab} onChange={setActiveTab} tabs={TABS} />
        <div
          role="tabpanel"
          aria-labelledby={`tool-tab-${activeTab}`}
          id="tool-panel"
          tabIndex={0}
          className="mt-5 min-w-0 rounded-2xl sm:mt-6"
        >
          {activeTab === 'convert' && <FileConverter />}
          {activeTab === 'compress' && <ImageCompressor />}
          {activeTab === 'edit' && <ImageEditor />}
          {activeTab === 'documents' && <DocumentTools />}
          {activeTab === 'archives' && <ArchiveTools />}
        </div>
      </main>
      <footer className="workspace-width mt-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-200 py-5 text-xs leading-relaxed text-slate-600 sm:mt-10 dark:border-slate-700 dark:text-slate-400">
        <span className="flex items-center gap-2">
          <LockKeyhole size={14} aria-hidden="true" />
          Files never leave your device.
        </span>
        <span>
          Built on{' '}
          <a
            className="hover:text-pine-700 dark:hover:text-pine-300 underline decoration-slate-300 underline-offset-4"
            href="https://github.com/remarkablemark/file-converter"
          >
            remarkablemark/file-converter
          </a>{' '}
          (MIT).
        </span>
      </footer>
    </div>
  );
}
