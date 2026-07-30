'use client';

import { useState } from 'react';
import { AppShell, PageContainer } from '@/components/layout';
import { Clock, ClipboardCheck, SearchCheck, Globe, Bug, Trash, Download } from 'lucide-react';
import { EmptyReports, EmptyState } from '@/components/states';

export default function HistoryPage() {
  const [filter, setFilter] = useState<'all' | 'test-cases' | 'gap-analysis' | 'api-tests' | 'bug-reports'>('all');
  const [hoveredItem, setHoveredItem] = useState<number | null>(null);

  // No mock data — generation history is empty until wired to the backend (Wave 2/3).
  const historyItems: Array<{
    id: number;
    type: 'test-cases' | 'gap-analysis' | 'api-tests' | 'bug-reports';
    title: string;
    description: string;
    timestamp: string;
    date: string;
  }> = [];

  const filteredItems = filter === 'all'
    ? historyItems
    : historyItems.filter(item => item.type === filter);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'test-cases': return ClipboardCheck;
      case 'gap-analysis': return SearchCheck;
      case 'api-tests': return Globe;
      case 'bug-reports': return Bug;
      default: return Clock;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'test-cases': return { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/15' };
      case 'gap-analysis': return { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/15' };
      case 'api-tests': return { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/15' };
      case 'bug-reports': return { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/15' };
      default: return { bg: 'bg-background-elevated/40', text: 'text-text-muted', border: 'border-border-default' };
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'test-cases': return 'Test Cases';
      case 'gap-analysis': return 'Gap Analysis';
      case 'api-tests': return 'API Tests';
      case 'bug-reports': return 'Bug Reports';
      default: return 'Other';
    }
  };

  return (
    <AppShell>
      <PageContainer>
        {/* ========== 1. HEADER & NAVIGATION SPACING ========== */}
        <div className="mb-12">
          {/* Clear vertical gap between title and subtitle */}
          <h1 className="text-[26px] font-semibold text-[#0F172A] mb-3">
            Generation History
          </h1>
          <p className="text-[15px] text-[#64748B]">
            View and manage your past AI generations
          </p>
        </div>

        <div className="mb-10">
          <div className="flex flex-wrap items-center gap-4">
            {[
              { id: 'all', label: 'All' },
              { id: 'test-cases', label: 'Test Cases' },
              { id: 'gap-analysis', label: 'Gap Analysis' },
              { id: 'api-tests', label: 'API Tests' },
              { id: 'bug-reports', label: 'Bug Reports' },
            ].map((tab) => {
              const isActive = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id as any)}
                  /* Elongated pill shape with generous padding */
                  className={`px-6 py-2.5 rounded-xl text-[14px] font-medium transition-all duration-200 border ${isActive
                      /* Active cyan tab styling */
                      ? 'bg-[#06B6D4] border-[#06B6D4] text-white shadow-md shadow-cyan-500/25'
                      : 'bg-transparent border-transparent text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9]'
                    }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E2E8F0]">
            <div className="p-12">
              {filter === 'all' ? (
                <EmptyReports />
              ) : (
                <EmptyState
                  icon={Clock}
                  title={`No ${getTypeLabel(filter)} found`}
                  description={`No generations found for the "${getTypeLabel(filter)}" filter. Try a different filter or generate new content.`}
                />
              )}
            </div>
          </div>
        ) : (
          /* Individual card containers with vertical gaps */
          <div className="space-y-5">
            {filteredItems.map((item) => {
              const Icon = getTypeIcon(item.type);
              const colors = getTypeColor(item.type);

              return (
                <div
                  key={item.id}
                  onMouseEnter={() => setHoveredItem(item.id)}
                  onMouseLeave={() => setHoveredItem(null)}
                  className={`group glass-panel rounded-xl transition-all duration-300 ${hoveredItem === item.id
                      ? 'border-primary/40 shadow-lg shadow-cyan-500/10 scale-[1.005]'
                      : 'border-border-default'
                    }`}
                  /* Increased internal padding for breathing room */
                  style={{ padding: '24px 20px' }}
                >
                  <div className="flex items-start gap-6">
                    {/* Icon - Aligned to grid with header text */}
                    <div className={`w-14 h-14 rounded-xl ${colors.bg} ${colors.border} border flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-7 h-7 ${colors.text}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pt-0.5">
                      {/* Title on its own line - tag moved below */}
                      <h3 className="text-[15px] font-semibold text-[#0F172A] mb-1">
                        {item.title}
                      </h3>

                      {/* Description - brighter grey for readability */}
                      <p className="text-[14px] text-[#64748B] mb-3 leading-relaxed">
                        {item.description}
                      </p>

                      {/* Metadata - tag positioned below title */}
                      <div className="flex items-center gap-4">
                        {/* Brighter timestamp text */}
                        <span className="text-[13px] text-[#94A3B8]">{item.timestamp}</span>
                        {/* Clean badge with proper spacing */}
                        <span className={`px-3 py-1 rounded-md ${colors.bg} ${colors.text} text-[13px] font-medium border ${colors.border}`}>
                          {getTypeLabel(item.type)}
                        </span>
                      </div>
                    </div>

                    {/* Actions - Show on Hover */}
                    <div className={`flex items-center gap-2 flex-shrink-0 transition-opacity duration-200 pt-1 ${hoveredItem === item.id ? 'opacity-100' : 'opacity-0'
                      }`}>
                      <button
                        className="p-2.5 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        className="p-2.5 rounded-lg text-[#64748B] hover:text-red-400 hover:bg-[#FEF2F2] transition-colors"
                        title="Delete"
                      >
                        <Trash className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PageContainer>
    </AppShell>
  );
}
