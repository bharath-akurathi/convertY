import type { LucideIcon } from 'lucide-react';

export interface ToolTab {
  id: string;
  label: string;
  icon: LucideIcon;
}

export interface ToolTabsProps {
  tabs: ToolTab[];
  activeTab: string;
  onChange: (id: string) => void;
}

export function ToolTabs({ tabs, activeTab, onChange }: ToolTabsProps) {
  function handleKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = (index + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        next = (index + tabs.length - 1) % tabs.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const id = tabs[next].id;
    document.getElementById(`tool-tab-${id}`)?.focus();
    onChange(id);
  }

  return (
    <nav aria-label="Tools">
      <div
        className="bg-slate-150 grid grid-cols-[repeat(5,auto)] gap-0.5 rounded-2xl border border-slate-200 p-1 min-[390px]:grid-cols-5 sm:gap-1 sm:p-1.5 dark:border-slate-700 dark:bg-slate-900"
        role="tablist"
        aria-label="File tools"
      >
        {tabs.map(({ id, label, icon: Icon }, index) => {
          const isActive = id === activeTab;
          return (
            <button
              id={`tool-tab-${id}`}
              aria-controls="tool-panel"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              className="aria-selected:bg-pine-800 dark:aria-selected:bg-pine-200 dark:aria-selected:text-pine-950 flex min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-2.5 text-xs font-bold text-slate-600 transition-colors hover:bg-white/70 hover:text-slate-900 aria-selected:text-white aria-selected:shadow-sm sm:flex-row sm:gap-2 sm:py-3 sm:text-sm dark:text-slate-300 dark:hover:bg-slate-800"
              key={id}
              onClick={() => {
                onChange(id);
              }}
              onKeyDown={(event: React.KeyboardEvent<HTMLButtonElement>) => {
                handleKeyDown(event, index);
              }}
              role="tab"
              type="button"
            >
              <Icon
                aria-hidden="true"
                className="size-4 sm:size-[18px]"
                strokeWidth={1.8}
              />
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
