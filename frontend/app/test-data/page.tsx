'use client';

import { useState } from 'react';
import { AppShell, PageContainer, SplitPane, Panel } from '@/components/layout';
import { SectionHeader, Button, Label, Input } from '@/components/core';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { Database, Download, Copy, Check, Table, Hash, FileJson, Loader2 } from 'lucide-react';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

export default function TestDataPage() {
  const [dataType, setDataType] = useState('');
  const [recordCount, setRecordCount] = useState('10');
  const [fields, setFields] = useState('');
  const [outputFormat, setOutputFormat] = useState('json');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleGenerate = async () => {
    if (!dataType.trim() || !recordCount) return;

    setIsGenerating(true);
    setTimeout(() => {
      setResult({
        dataType,
        count: parseInt(recordCount),
        fields: fields ? fields.split(',').map((f: string) => f.trim()) : ['id', 'name', 'email', 'phone', 'status'],
        data: [
          { id: 1, name: 'John Doe', email: 'john.doe@example.com', phone: '+1-555-0101', status: 'active' },
          { id: 2, name: 'Jane Smith', email: 'jane.smith@example.com', phone: '+1-555-0102', status: 'active' },
          { id: 3, name: 'Bob Johnson', email: 'bob.j@example.com', phone: '+1-555-0103', status: 'inactive' },
          { id: 4, name: 'Alice Brown', email: 'alice.b@example.com', phone: '+1-555-0104', status: 'active' },
          { id: 5, name: 'Charlie Wilson', email: 'charlie.w@example.com', phone: '+1-555-0105', status: 'pending' },
        ].slice(0, parseInt(recordCount)),
      });
      setIsGenerating(false);
    }, 2000);
  };

  const handleCopy = () => {
    if (!result) return;
    const json = JSON.stringify(result.data, null, 2);
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!result) return;
    const json = JSON.stringify(result.data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-data-${result.dataType}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell>
      <PageContainer>
        <div className="space-y-8">
          <SectionHeader
            title="Test Data Generator"
            description="Generate realistic test data for your QA scenarios"
          />

          <SplitPane stickyLeft={true}>
            {/* Input Panel */}
            <Panel padding="default">
              <div className="space-y-5">
                <div>
                  <Label required>Data Type</Label>
                  <CustomSelect
                    options={[
                      { value: 'users', label: 'User Records' },
                      { value: 'products', label: 'Product Catalog' },
                      { value: 'orders', label: 'Order History' },
                      { value: 'addresses', label: 'Address Data' },
                      { value: 'custom', label: 'Custom Schema' },
                    ]}
                    value={dataType}
                    onChange={(v) => setDataType(v)}
                    placeholder="Select data type..."
                    accentColor="#06B6D4"
                    height={44}
                  />
                </div>

                <div>
                  <Label required>Number of Records</Label>
                  <Input
                    type="number"
                    value={recordCount}
                    onChange={(e) => setRecordCount(e.target.value)}
                    placeholder="10"
                    min="1"
                    max="1000"
                  />
                </div>

                <details
                  open={showOptions}
                  onToggle={(e) => setShowOptions((e.target as HTMLDetailsElement).open)}
                  className="group"
                >
                  <summary className="text-xs cursor-pointer transition-colors list-none flex items-center gap-2 select-none" style={{ color: 'var(--text-tertiary)' }}>
                    {showOptions ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    Advanced Options
                  </summary>
                  <div className="mt-4 space-y-4 pl-6">
                    <div>
                      <Label>Custom Fields (comma-separated)</Label>
                      <Input
                        value={fields}
                        onChange={(e) => setFields(e.target.value)}
                        placeholder="id, name, email, phone, address"
                      />
                    </div>
                    <div>
                      <Label>Output Format</Label>
                      <CustomSelect
                        options={[
                          { value: 'json', label: 'JSON' },
                          { value: 'csv', label: 'CSV' },
                          { value: 'sql', label: 'SQL' },
                        ]}
                        value={outputFormat}
                        onChange={(v) => setOutputFormat(v)}
                        accentColor="#06B6D4"
                        height={44}
                      />
                    </div>
                  </div>
                </details>

                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || !dataType.trim()}
                  className="w-full"
                  isLoading={isGenerating}
                  leftIcon={<Sparkles className="w-5 h-5" />}
                >
                  Generate Test Data
                </Button>
              </div>
            </Panel>

            {/* Output Panel */}
            <div className="min-h-[500px]">
              {isGenerating ? (
                <DataLoadingState />
              ) : result ? (
                <DataResultsView
                  result={result}
                  onCopy={handleCopy}
                  onDownload={handleDownload}
                  copied={copied}
                />
              ) : (
                <DataEmptyState />
              )}
            </div>
          </SplitPane>
        </div>
      </PageContainer>
    </AppShell>
  );
}

/* ─── Loading State ─── */
function DataLoadingState() {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl min-h-[550px] flex flex-col items-center justify-center text-center p-8">
      <Loader2 className="w-10 h-10 text-[#06B6D4] animate-spin mb-4" />
      <p className="text-base font-semibold text-[#0F172A] mb-1.5">
        Generating test data...
      </p>
      <p className="text-sm text-[#64748B]">
        Creating realistic records
      </p>
    </div>
  );
}

/* ─── Empty State ─── */
function DataEmptyState() {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl min-h-[550px]">
      <EmptyState
        icon={Database}
        title="No Data Generated Yet"
        description="Select a data type and generate realistic test data for your scenarios"
      />
    </div>
  );
}

/* ─── Results View ─── */
function DataResultsView({ result, onCopy, onDownload, copied }: {
  result: any;
  onCopy: () => void;
  onDownload: () => void;
  copied: boolean;
}) {
  return (
    <div
      className="w-full flex flex-col animate-fade-in"
      style={{
        background: 'var(--background-primary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--spacing-8)',
        gap: 'var(--spacing-6)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-display-lg font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>
            Generated Data
          </h2>
          <p className="text-body-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {result.data.length} records • {result.fields.length} fields
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onCopy}
            leftIcon={copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          >
            {copied ? 'Copied!' : 'Copy JSON'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onDownload}
            leftIcon={<Download className="w-4 h-4" />}
          >
            Download
          </Button>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-3 gap-4">
        <DataMetricCard icon={<Table className="w-4 h-4" />} label="RECORDS" value={result.data.length} color="emerald" />
        <DataMetricCard icon={<Hash className="w-4 h-4" />} label="FIELDS" value={result.fields.length} color="blue" />
        <DataMetricCard icon={<FileJson className="w-4 h-4" />} label="FORMAT" value="JSON" color="purple" />
      </div>

      {/* Data Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--border-subtle)' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--background-tertiary)' }}>
                {result.fields.map((field: string) => (
                  <th
                    key={field}
                    className="text-ui-xs uppercase tracking-wider font-semibold text-left px-4 py-3"
                    style={{
                      color: 'var(--text-muted)',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    {field}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.data.map((row: any, idx: number) => (
                <tr
                  key={idx}
                  className="animate-slide-in transition-colors"
                  style={{
                    animationDelay: `${idx * 50}ms`,
                    borderBottom: idx < result.data.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--background-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {result.fields.map((field: string) => (
                    <td
                      key={field}
                      className="text-body-sm px-4 py-3"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {field === 'status' ? (
                        <StatusBadge status={row[field]} />
                      ) : field === 'id' ? (
                        <span className="text-ui-xs font-mono px-2 py-1 rounded-md" style={{ background: 'var(--background-tertiary)', color: 'var(--text-muted)' }}>
                          {row[field]}
                        </span>
                      ) : (
                        row[field] ?? '—'
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Raw JSON Preview */}
      <div>
        <h4
          className="text-ui-sm font-semibold uppercase tracking-wider mb-3 flex items-center gap-2"
          style={{ color: 'var(--text-muted)' }}
        >
          <FileJson className="w-4 h-4" />
          Raw JSON
        </h4>
        <div
          className="rounded-xl overflow-auto"
          style={{
            background: 'var(--background-secondary)',
            border: '1px solid var(--border-subtle)',
            padding: 'var(--spacing-4)',
            maxHeight: '300px',
          }}
        >
          <pre
            className="text-ui-sm"
            style={{
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
              whiteSpace: 'pre-wrap',
              lineHeight: '1.7',
            }}
          >
            {JSON.stringify(result.data, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

/* ─── Metric Card ─── */
function DataMetricCard({ icon, label, value, color }: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: 'emerald' | 'blue' | 'purple';
}) {
  const colors = {
    emerald: { bg: 'bg-[#D1FAE5]', icon: 'text-[#10B981]', border: 'border-[#A7F3D0]' },
    blue: { bg: 'bg-[#EEF2FF]', icon: 'text-[#3B82F6]', border: 'border-[#BFDBFE]' },
    purple: { bg: 'bg-[#EDE9FE]', icon: 'text-[#8B5CF6]', border: 'border-[#DDD6FE]' },
  };

  const c = colors[color];

  return (
    <div className="metric-card">
      <div className={`flex items-center gap-3 mb-3 p-2 rounded-lg ${c.bg} ${c.border} border`}>
        <div className={c.icon}>{icon}</div>
        <div className="text-ui-xs uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </div>
      </div>
      <div className="text-display-lg" style={{ color: 'var(--text-primary)' }}>
        {value}
      </div>
    </div>
  );
}

/* ─── Status Badge ─── */
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { color: string; bg: string }> = {
    active: { color: 'var(--color-success)', bg: 'var(--color-success-light)' },
    inactive: { color: 'var(--text-muted)', bg: 'var(--background-tertiary)' },
    pending: { color: 'var(--color-warning)', bg: 'var(--color-warning-light)' },
  };

  const style = config[status] || config.inactive;

  return (
    <span
      className="text-ui-xs font-semibold px-2 py-1 rounded-md capitalize"
      style={{ background: style.bg, color: style.color }}
    >
      {status}
    </span>
  );
}
