export interface ToolTab {
  id: string;
  label: string;
}

export interface ToolTabsProps {
  tabs: ToolTab[];
  activeTab: string;
  onChange: (id: string) => void;
}

export function ToolTabs({ tabs, activeTab, onChange }: ToolTabsProps) {
  return (
    <nav aria-label="Tools" className="flex flex-wrap justify-center gap-2">
      <div className="flex flex-wrap justify-center gap-2" role="tablist">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;

          return (
            <button
              aria-selected={isActive}
              className={
                isActive
                  ? 'cursor-pointer rounded-md bg-slate-800 px-4 py-2 font-medium text-white shadow-xs transition-colors hover:bg-slate-700 focus:ring-2 focus:ring-slate-500 focus:outline-hidden dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-100'
                  : 'cursor-pointer rounded-md bg-white px-4 py-2 font-medium text-slate-700 shadow-xs transition-colors hover:bg-slate-100 focus:ring-2 focus:ring-slate-500 focus:outline-hidden dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
              }
              key={tab.id}
              onClick={() => {
                onChange(tab.id);
              }}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
