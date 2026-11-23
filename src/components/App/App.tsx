import { useState } from 'react';

import { ArchiveTools } from '../ArchiveTools';
import { DocumentTools } from '../DocumentTools';
import { FileConverter } from '../FileConverter';
import { ImageCompressor } from '../ImageCompressor';
import { ImageEditor } from '../ImageEditor';
import type { ToolTab } from '../ToolTabs';
import { ToolTabs } from '../ToolTabs';

const TABS: ToolTab[] = [
  { id: 'convert', label: 'Convert' },
  { id: 'compress', label: 'Compress' },
  { id: 'edit', label: 'Edit' },
  { id: 'documents', label: 'Documents' },
  { id: 'archives', label: 'Archives' },
];

export function App() {
  const [activeTab, setActiveTab] = useState('convert');

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900 sm:p-8 dark:bg-slate-900 dark:text-slate-100">
      <div className="mx-auto max-w-(--breakpoint-2xl) space-y-8">
        <header className="text-center">
          <h1 className="text-3xl font-bold sm:text-4xl">convertY</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Convert, compress and edit files entirely in your browser. Files
            never leave your device.
          </p>
        </header>

        <ToolTabs activeTab={activeTab} onChange={setActiveTab} tabs={TABS} />

        {activeTab === 'convert' && <FileConverter />}
        {activeTab === 'compress' && <ImageCompressor />}
        {activeTab === 'edit' && <ImageEditor />}
        {activeTab === 'documents' && <DocumentTools />}
        {activeTab === 'archives' && <ArchiveTools />}

        <footer className="text-center text-sm text-slate-500 dark:text-slate-400">
          100% client-side — no uploads. Archives: ZIP only. Built on
          remarkablemark/file-converter (MIT).
        </footer>
      </div>
    </main>
  );
}
