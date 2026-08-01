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
      case 'test-cases': return { bg: 'bg-[#EFF6FF]', text: 'text-[#3B82F6]', border: 'border-[#BFDBFE]' };
      case 'gap-analysis': return { bg: 'bg-[#FFFBEB]', text: 'text-[#F59E0B]', border: 'border-[#FDE68A]' };
      case 'api-tests': return { bg: 'bg-[#F5F3FF]', text: 'text-[#8B5CF6]', border: 'border-[#DDD6FE]' };
      case 'bug-reports': return { bg: 'bg-[#FEF2F2]', text: 'text-[#EF4444]', border: 'border-[#FECACA]' };
      default: return { bg: 'bg-[#F1F5F9]', text: 'text-[#64748B]', border: 'border-[#E2E8F0]' };
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
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight">Generation History</h1>
            <p className="text-sm text-[#64748B] mt-1">View and manage your past AI generations</p>
          </div>

          {/* Filter Tabs */}
          <div className="flex flex-wrap items-center gap-2">
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
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${isActive
                    ? 'bg-[#06B6D4] border-[#06B6D4] text-white shadow-sm'
                    : 'bg-white border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#0F172A]'
                    }`}
                >
                  {tab.label}
                </button>
              );
            })}
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
            <div className="space-y-4">
              {filteredItems.map((item) => {
                const Icon = getTypeIcon(item.type);
                const colors = getTypeColor(item.type);

                return (
                  <div
                    key={item.id}
                    onMouseEnter={() => setHoveredItem(item.id)}
                    onMouseLeave={() => setHoveredItem(null)}
                    className={`bg-white rounded-2xl border p-5 transition-all ${hoveredItem === item.id
                      ? 'border-[#06B6D4]/40 shadow-lg shadow-cyan-500/5'
                      : 'border-[#E2E8F0]'
                      }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-xl ${colors.bg} ${colors.border} border flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`w-6 h-6 ${colors.text}`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-[#0F172A] mb-1">
                          {item.title}
                        </h3>

                        <p className="text-sm text-[#64748B] mb-3 leading-relaxed">
                          {item.description}
                        </p>

                        <div className="flex items-center gap-3">
                          <span className="text-xs text-[#94A3B8]">{item.timestamp}</span>
                          <span className={`px-2.5 py-0.5 rounded-md ${colors.bg} ${colors.text} text-xs font-medium border ${colors.border}`}>
                            {getTypeLabel(item.type)}
                          </span>
                        </div>
                      </div>

                      <div className={`flex items-center gap-2 flex-shrink-0 transition-opacity ${hoveredItem === item.id ? 'opacity-100' : 'opacity-0'
                        }`}>
                        <button
                          className="p-2 rounded-lg text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors"
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          className="p-2 rounded-lg text-[#64748B] hover:text-[#EF4444] hover:bg-[#FEF2F2] transition-colors"
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
        </div>
      </PageContainer>
    </AppShell>
  );
}
