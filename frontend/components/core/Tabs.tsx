'use client';

import { cn } from '@/lib/utils';

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number | string;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
}

export function Tabs({ tabs, activeTab, onChange }: TabsProps) {
  return (
    <div role="tablist" className="flex items-center gap-2 border-b border-[#E2E8F0] pb-4 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap border',
              isActive
                ? 'bg-[#06B6D4] border-[#06B6D4] text-white shadow-md shadow-cyan-500/20'
                : 'bg-transparent border-transparent text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9]'
            )}
          >
            {tab.icon && <span className="flex-shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className={cn('text-xs px-2 py-0.5 rounded-full font-mono flex items-center justify-center', isActive ? 'bg-white/20 text-white' : 'bg-[#ECFEFF] text-[#06B6D4]')}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface TabPanelProps {
  value: string;
  activeTab: string;
  children: React.ReactNode;
}

export function TabPanel({ value, activeTab, children }: TabPanelProps) {
  if (value !== activeTab) return null;
  return <div className="min-h-[400px]">{children}</div>;
}
