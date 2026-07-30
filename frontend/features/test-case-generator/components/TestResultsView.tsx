'use client';

/**
 * TestResultsView — post-generation results.
 *
 * Layout:
 * 1. Header (total cases + project/module + nav actions)
 * 2. Save-to-repository section (manual save)
 * 3. Coverage dashboard (KPI cards + type distribution + coverage notes)
 * 4. Search + filters + export (of the visible set)
 * 5. Type tabs — All + one per type present (driven by summary.typeDistribution)
 * 6. 12-column results table (AdvancedTestCaseTable)
 * 7. Pagination
 * 8. Details drawer
 */

import { useState, useMemo, useEffect } from 'react';
import {
  AlertTriangle, Search, Download, FileText, Copy, Check,
  ChevronLeft, ChevronRight, Database, ExternalLink,
  Save, Loader2, RotateCcw, FolderPlus, CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/core';
import { CoverageDashboard } from './CoverageDashboard';
import { AdvancedTestCaseTable } from './AdvancedTestCaseTable';
import { TestCaseDrawer } from './TestCaseDrawer';
import { exportTestCasesToExcel } from '@/lib/exportToExcel';
import {
  TestGenerationResponse, TestCase, TabId,
  SortConfig, SortField, FilterState, RepositorySaveResult,
} from '../types';
import type { SaveStatus } from '../hooks/useTestGenerator';
import {
  flattenTestCases, getCasesByCategory, filterTestCases,
  sortTestCases, paginateTestCases, getUniqueModules,
  exportToCSV, exportToMarkdown, downloadFile, typeLabel, testTypeOrderIndex,
} from '../utils/testCaseUtils';
import Link from 'next/link';
import { perf } from '../utils/perf';

interface TestResultsViewProps {
  result: TestGenerationResponse;
  onExportExcel?: () => void;
  onBackToInput: () => void;
  onReset: () => void;
  onSave: () => void;
  saveStatus: SaveStatus;
  saveResult: RepositorySaveResult | null;
  saveError: string | null;
}

const PAGE_SIZE = 25;
const PRIORITY_OPTIONS = ['Critical', 'High', 'Medium', 'Low'];

export function TestResultsView({
  result, onBackToInput, onReset, onSave, saveStatus, saveResult, saveError,
}: TestResultsViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>('functional');
  const [currentPage, setCurrentPage] = useState(1);
  const [drawerCase, setDrawerCase] = useState<TestCase | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const [search, setSearch] = useState('');
  const [selectedPriorities, setSelectedPriorities] = useState<Set<string>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ field: 'id', direction: 'asc' });

  const allCases = useMemo(() => flattenTestCases(result.testCases), [result.testCases]);
  const uniqueModules = useMemo(() => getUniqueModules(allCases), [allCases]);

  // Dynamic tabs: one per type present in the distribution, sorted in CANONICAL order so Functional
  // is the FIRST tab (functional-first strategy). "All Test Cases" is appended at the end as a
  // convenience overview so it never displaces Functional from the first position.
  const tabs = useMemo(() => {
    const dist = result.summary.typeDistribution ?? {};
    const typeTabs = Object.entries(dist)
      .filter(([, n]) => n > 0)
      .sort((a, b) => testTypeOrderIndex(a[0]) - testTypeOrderIndex(b[0]))
      .map(([type, count]) => ({ id: type as TabId, label: typeLabel(type), count }));
    return [...typeTabs, { id: 'all' as TabId, label: 'All Test Cases', count: allCases.length }];
  }, [result.summary.typeDistribution, allCases.length]);

  // If the default Functional tab has no cases, fall back to the first available tab.
  useEffect(() => {
    const dist = result.summary.typeDistribution ?? {};
    if ((dist.functional ?? 0) === 0 && activeTab === 'functional') {
      const firstWithType = Object.entries(dist).find(([, n]) => n > 0);
      if (firstWithType) setActiveTab(firstWithType[0] as TabId);
      else setActiveTab('all');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.summary.typeDistribution]);

  // Phase 1 perf: capture the results-table render time once the view mounts. The hook
  // logs the rest of the client journey (click / API wait / first paint) separately.
  useEffect(() => {
    perf.mark('table-mounted');
    const tableRenderTime = perf.between('results-set', 'table-mounted');
    // eslint-disable-next-line no-console
    console.info('[perf] table render', { tableRenderMs: tableRenderTime });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categoryCases = useMemo(() => {
    if (activeTab === 'all') return allCases;
    return getCasesByCategory(result.testCases, activeTab);
  }, [result.testCases, activeTab, allCases]);

  const filter: FilterState = { search, priorities: selectedPriorities, types: selectedTypes, modules: selectedModules };

  const processedCases = useMemo(() => sortTestCases(filterTestCases(categoryCases, filter), sortConfig),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categoryCases, search, selectedPriorities, selectedTypes, selectedModules, sortConfig]);

  const totalPages = Math.ceil(processedCases.length / PAGE_SIZE);
  const paginatedCases = paginateTestCases(processedCases, currentPage, PAGE_SIZE);

  const handleSort = (field: SortField) =>
    setSortConfig((prev) => ({ field, direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc' }));

  const toggleSet = (set: Set<string>, value: string): Set<string> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const handleTabChange = (tab: TabId) => { setActiveTab(tab); setCurrentPage(1); };

  const visibleForExport = processedCases.length > 0 ? processedCases : allCases;
  const moduleName = result.module || 'TestCases';

  const handleExportExcel = () => exportTestCasesToExcel(visibleForExport, undefined, moduleName);
  const handleExportCSV = () => downloadFile(exportToCSV(visibleForExport), `${moduleName}_TestCases.csv`, 'text/csv');
  const handleExportMarkdown = () => downloadFile(exportToMarkdown(visibleForExport), `${moduleName}_TestCases.md`, 'text/markdown');
  const handleCopyAll = async () => {
    const text = visibleForExport
      .map((tc) => `${tc.id}: ${tc.name || tc.scenario} [${tc.priority}]\n  Steps: ${(tc.steps || []).join('; ')}\n  Expected: ${tc.expectedResult}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      /* clipboard unavailable (insecure context / permission denied) — no false "copied" */
    }
  };

  const hasActiveFilters = !!(search || selectedPriorities.size || selectedTypes.size || selectedModules.size);
  const clearFilters = () => {
    setSearch(''); setSelectedPriorities(new Set()); setSelectedTypes(new Set()); setSelectedModules(new Set()); setCurrentPage(1);
  };
  const typeOptions = Array.from(new Set(allCases.map((tc) => tc.type))).sort();

  return (
    <div className="w-full flex flex-col" style={{ gap: '20px' }}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[#0F172A] tracking-tight">
            {result.summary.totalCases} Test Cases Generated
          </h2>
          <div className="flex items-center gap-3 mt-1.5 text-sm text-[#64748B]">
            <span>Project: <strong>{result.repository?.projectName || 'N/A'}</strong></span>
            <span className="text-[#94A3B8]">·</span>
            <span>Module: <strong>{result.repository?.module || result.module || 'N/A'}</strong></span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onBackToInput} leftIcon={<ChevronLeft className="w-4 h-4" />}>Edit Input</Button>
          <Button variant="secondary" size="sm" onClick={onReset}>New Generation</Button>
        </div>
      </div>

      {/* Save section */}
      {saveStatus === 'saved' && saveResult ? (
        <div className="rounded-xl p-5" style={{ background: 'linear-gradient(135deg,#F0FDF4 0%,#ECFEFF 100%)', border: '1px solid #BBF7D0' }}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[#22C55E] flex-shrink-0">
                <CheckCircle2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#166534]">Saved {saveResult.savedCount} test case{saveResult.savedCount !== 1 ? 's' : ''} to repository</h3>
                <div className="flex items-center gap-4 mt-1.5 flex-wrap text-xs text-[#15803D]">
                  <span className="flex items-center gap-1.5"><Database className="w-3.5 h-3.5" />Project: <strong>{saveResult.projectName}</strong></span>
                  <span className="flex items-center gap-1.5"><FolderPlus className="w-3.5 h-3.5" />Module: <strong>{saveResult.module}</strong></span>
                  {saveResult.duplicatesSkipped > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E]">{saveResult.duplicatesSkipped} duplicate{saveResult.duplicatesSkipped !== 1 ? 's' : ''} skipped</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Link href="/test-management" prefetch={false}><Button variant="primary" size="sm" leftIcon={<ExternalLink className="w-3.5 h-3.5" />}>View in Test Management</Button></Link>
              <Button variant="secondary" size="sm" onClick={handleExportExcel} leftIcon={<Download className="w-3.5 h-3.5" />}>Export Excel</Button>
            </div>
          </div>
        </div>
      ) : saveStatus === 'error' ? (
        <div className="rounded-xl p-5 bg-[#FEF2F2] border border-[#FECACA]">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[#EF4444] flex-shrink-0"><AlertTriangle className="w-5 h-5 text-white" /></div>
              <div><h3 className="text-sm font-semibold text-[#991B1B]">Failed to save test cases</h3><p className="text-xs mt-1 text-[#B91C1C]">{saveError || 'An unexpected error occurred.'}</p></div>
            </div>
            <Button variant="primary" size="sm" onClick={onSave} leftIcon={<RotateCcw className="w-3.5 h-3.5" />}>Retry Save</Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl p-5 flex items-center justify-between gap-4 flex-wrap bg-white border border-[#E2E8F0]">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[#ECFEFF] flex-shrink-0"><Database className="w-5 h-5 text-[#06B6D4]" /></div>
            <div>
              <h3 className="text-sm font-semibold text-[#0F172A]">Review complete — ready to save</h3>
              <p className="text-xs mt-0.5 text-[#64748B]">{result.summary.totalCases} test case{result.summary.totalCases !== 1 ? 's' : ''} → <strong>{result.repository?.projectName || 'project'}</strong> / <strong>{result.repository?.module || result.module || 'module'}</strong></p>
            </div>
          </div>
          <Button variant="primary" size="md" onClick={onSave} disabled={saveStatus === 'saving'} leftIcon={saveStatus === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}>
            {saveStatus === 'saving' ? 'Saving...' : 'Save to Repository'}
          </Button>
        </div>
      )}

      {/* Coverage dashboard */}
      <CoverageDashboard result={result} />

      {/* Search + filters + export */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
          <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} placeholder="Search test cases..."
            className="w-full h-10 pl-10 pr-4 rounded-xl text-sm bg-white border-2 border-[#E2E8F0] text-[#0F172A] focus:outline-none focus:border-[#06B6D4]" />
        </div>
        <Button variant="secondary" size="sm" onClick={() => setShowFilters(!showFilters)} leftIcon={<AlertTriangle className="w-4 h-4" />}>
          Filters {hasActiveFilters && `(${selectedPriorities.size + selectedTypes.size + selectedModules.size})`}
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleExportExcel} leftIcon={<Download className="w-4 h-4" />}>Excel</Button>
          <Button variant="secondary" size="sm" onClick={handleExportCSV} leftIcon={<FileText className="w-4 h-4" />}>CSV</Button>
          <Button variant="secondary" size="sm" onClick={handleExportMarkdown} leftIcon={<FileText className="w-4 h-4" />}>MD</Button>
          <Button variant="secondary" size="sm" onClick={handleCopyAll} leftIcon={copiedAll ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}>{copiedAll ? 'Copied' : 'Copy'}</Button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="rounded-xl p-5 flex flex-wrap gap-6 bg-[#F8FAFC] border border-[#E2E8F0]">
          <FilterGroup title="Priority">
            {PRIORITY_OPTIONS.map((p) => <FilterCheckbox key={p} label={p} checked={selectedPriorities.has(p)} onChange={() => { setSelectedPriorities(toggleSet(selectedPriorities, p)); setCurrentPage(1); }} />)}
          </FilterGroup>
          <FilterGroup title="Type">
            {typeOptions.map((t) => <FilterCheckbox key={t} label={typeLabel(t)} checked={selectedTypes.has(t)} onChange={() => { setSelectedTypes(toggleSet(selectedTypes, t)); setCurrentPage(1); }} />)}
          </FilterGroup>
          {uniqueModules.length > 1 && (
            <FilterGroup title="Module">
              {uniqueModules.map((m) => <FilterCheckbox key={m} label={m} checked={selectedModules.has(m)} onChange={() => { setSelectedModules(toggleSet(selectedModules, m)); setCurrentPage(1); }} />)}
            </FilterGroup>
          )}
          {hasActiveFilters && <button onClick={clearFilters} className="text-xs flex items-center gap-1 self-end pb-1 text-[#06B6D4]">Clear all</button>}
        </div>
      )}

      {/* Sort hint (click table headers is not supported in AdvancedTable yet — provide a quick sort) */}
      <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
        <span>Sort by:</span>
        {(['priority', 'type', 'name', 'id'] as SortField[]).map((f) => (
          <button key={f} onClick={() => handleSort(f)} className={`px-2 py-0.5 rounded-md font-medium ${sortConfig.field === f ? 'bg-[#ECFEFF] text-[#0E7490]' : 'text-[#64748B] hover:bg-[#F1F5F9]'}`}>
            {f}{sortConfig.field === f ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
          </button>
        ))}
      </div>

      {/* Type tabs */}
      <div className="flex items-center border-b border-[#E2E8F0] overflow-x-auto">
        <div className="flex gap-6 flex-wrap">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => handleTabChange(tab.id)} className="text-sm relative pb-3 whitespace-nowrap transition-colors"
              style={{ color: activeTab === tab.id ? '#06B6D4' : '#64748B', fontWeight: activeTab === tab.id ? 600 : 500 }}>
              {tab.label}
              <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-[#ECFEFF] text-[#0E7490]">{tab.count}</span>
              {activeTab === tab.id && <span className="absolute bottom-[-1px] left-0 right-0 h-0.5 rounded-full bg-[#06B6D4]" />}
            </button>
          ))}
        </div>
      </div>

      {/* Results table */}
      <AdvancedTestCaseTable testCases={paginatedCases} onRowClick={setDrawerCase} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#94A3B8]">
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, processedCases.length)} of {processedCases.length}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#E2E8F0] text-[#475569] disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm text-[#475569]">{currentPage} / {totalPages}</span>
            <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#E2E8F0] text-[#475569] disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      <TestCaseDrawer testCase={drawerCase} onClose={() => setDrawerCase(null)} />
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h5 className="text-xs font-semibold uppercase tracking-wider mb-2 text-[#94A3B8]">{title}</h5>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function FilterCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-sm text-[#475569]">
      <input type="checkbox" checked={checked} onChange={onChange} className="w-4 h-4 rounded" />
      <span>{label}</span>
    </label>
  );
}
