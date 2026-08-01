'use client';

import { useState } from 'react';
import { AppShell, PageContainer, SplitPane, Panel } from '@/components/layout';
import { SectionHeader, Button, Label, Input, TextArea } from '@/components/core';
import { SearchCheck, AlertTriangle, CheckCircle, FileText, Shield, HelpCircle, Copy, Check, Loader2 } from 'lucide-react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

export default function GapAnalysisPage() {
  const [requirement, setRequirement] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleAnalyze = async () => {
    if (!requirement.trim()) return;

    setIsAnalyzing(true);
    setTimeout(() => {
      setResult({
        summary: {
          totalGaps: 8,
          critical: 3,
          high: 3,
          medium: 2,
        },
        gaps: {
          missingValidations: [
            'No validation for maximum password length',
            'Missing email format verification',
            'No special character requirement specified',
          ],
          missingPermissions: [
            'Admin role permissions not defined',
            'User deletion permission unclear',
            'Role modification access levels undefined',
          ],
          missingEdgeCases: [
            'Concurrent user creation handling',
            'Duplicate username detection',
            'Password reset token expiration',
          ],
          missingAuditLogs: [
            'User creation audit trail',
            'Password change logging',
            'Failed login attempt tracking',
          ],
          openQuestions: [
            'Should usernames be case-sensitive?',
            'What is the account lockout policy?',
            'Are there password history requirements?',
          ],
        },
      });
      setIsAnalyzing(false);
    }, 2000);
  };

  const handleCopyAll = () => {
    if (!result) return;
    const text = Object.entries(result.gaps)
      .map(([key, items]: [string, any]) => {
        const title = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s: string) => s.toUpperCase());
        return `## ${title}\n${items.map((item: string, i: number) => `${i + 1}. ${item}`).join('\n')}`;
      })
      .join('\n\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AppShell>
      <PageContainer>
        <div className="space-y-6">
          <SectionHeader
            title="Requirement Gap Analyzer"
            description="Identify missing requirements, validations, and potential risks"
          />

          <SplitPane stickyLeft={true}>
            {/* Input Panel */}
            <Panel padding="default">
              <div className="space-y-5">
                <details
                  open={showOptional}
                  onToggle={(e) => setShowOptional((e.target as HTMLDetailsElement).open)}
                  className="group"
                >
                  <summary className="text-xs cursor-pointer transition-colors list-none flex items-center gap-2 select-none" style={{ color: 'var(--text-tertiary)' }}>
                    {showOptional ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    PRD Metadata (optional)
                  </summary>
                  <div className="mt-4 space-y-3 pl-6">
                    <Input type="text" placeholder="Document ID" />
                    <Input type="text" placeholder="Version" />
                    <Input type="text" placeholder="Author" />
                  </div>
                </details>

                <div>
                  <Label required>Requirement Text</Label>
                  <TextArea
                    value={requirement}
                    onChange={(e) => setRequirement(e.target.value)}
                    rows={10}
                    placeholder="Paste your PRD, user story, or requirement text here..."
                  />
                </div>

                <Button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || !requirement.trim()}
                  className="w-full"
                  isLoading={isAnalyzing}
                  leftIcon={<SearchCheck className="w-5 h-5" />}
                >
                  Analyze Gaps
                </Button>
              </div>
            </Panel>

            {/* Output Panel */}
            <div className="min-h-[500px]">
              {isAnalyzing ? (
                <GapLoadingState />
              ) : result ? (
                <GapResultsView result={result} onCopy={handleCopyAll} copied={copied} />
              ) : (
                <GapEmptyState />
              )}
            </div>
          </SplitPane>
        </div>
      </PageContainer>
    </AppShell>
  );
}

/* ─── Loading State ─── */
function GapLoadingState() {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl min-h-[550px] flex flex-col items-center justify-center text-center p-8">
      <Loader2 className="w-10 h-10 text-[#06B6D4] animate-spin mb-4" />
      <p className="text-base font-semibold text-[#0F172A] mb-1.5">
        Analyzing requirements...
      </p>
      <p className="text-sm text-[#64748B]">
        Identifying gaps, missing validations, and risks
      </p>
    </div>
  );
}

/* ─── Empty State ─── */
function GapEmptyState() {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl min-h-[550px]">
      <EmptyState
        icon={SearchCheck}
        title="No Analysis Yet"
        description="Paste your requirement and let AI identify gaps, risks, and missing validations"
      />
    </div>
  );
}

/* ─── Results View ─── */
function GapResultsView({ result, onCopy, copied }: { result: any; onCopy: () => void; copied: boolean }) {
  const gapCategories = [
    {
      key: 'missingValidations',
      title: 'Missing Validations',
      icon: CheckCircle,
      iconColor: 'var(--color-info)',
      iconBg: 'var(--color-info-light)',
      severity: 'medium' as const,
      borderColor: 'var(--color-info)',
    },
    {
      key: 'missingPermissions',
      title: 'Missing Permissions',
      icon: Shield,
      iconColor: 'var(--color-error)',
      iconBg: 'var(--color-error-light)',
      severity: 'high' as const,
      borderColor: 'var(--color-error)',
    },
    {
      key: 'missingEdgeCases',
      title: 'Missing Edge Cases',
      icon: AlertTriangle,
      iconColor: 'var(--color-warning)',
      iconBg: 'var(--color-warning-light)',
      severity: 'medium' as const,
      borderColor: 'var(--color-warning)',
    },
    {
      key: 'missingAuditLogs',
      title: 'Missing Audit Logs',
      icon: FileText,
      iconColor: 'var(--color-success)',
      iconBg: 'var(--color-success-light)',
      severity: 'low' as const,
      borderColor: 'var(--color-success)',
    },
    {
      key: 'openQuestions',
      title: 'Open Questions',
      icon: HelpCircle,
      iconColor: 'var(--color-purple)',
      iconBg: '#EDE9FE',
      severity: 'info' as const,
      borderColor: 'var(--color-purple)',
    },
  ];

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
      <div className="flex items-center justify-between">
        <h2 className="text-display-lg font-semibold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.025em' }}>
          Gap Analysis Results
        </h2>
        <Button
          variant="secondary"
          size="sm"
          onClick={onCopy}
          leftIcon={copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          className="flex-shrink-0"
        >
          {copied ? 'Copied!' : 'Copy All'}
        </Button>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <GapMetricCard label="TOTAL GAPS" value={result.summary.totalGaps} color="amber" icon={<SearchCheck className="w-4 h-4" />} />
        <GapMetricCard label="CRITICAL" value={result.summary.critical} color="purple" icon={<AlertTriangle className="w-4 h-4" />} />
        <GapMetricCard label="HIGH" value={result.summary.high} color="blue" icon={<Shield className="w-4 h-4" />} />
        <GapMetricCard label="MEDIUM" value={result.summary.medium} color="emerald" icon={<FileText className="w-4 h-4" />} />
      </div>

      {/* Gap Categories */}
      <div className="space-y-4">
        {gapCategories.map((cat, catIdx) => {
          const items = result.gaps[cat.key] || [];
          if (items.length === 0) return null;
          return (
            <GapCategoryCard
              key={cat.key}
              title={cat.title}
              icon={cat.icon}
              iconColor={cat.iconColor}
              iconBg={cat.iconBg}
              borderColor={cat.borderColor}
              severity={cat.severity}
              items={items}
              index={catIdx}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ─── Metric Card ─── */
function GapMetricCard({ label, value, color, icon }: {
  label: string;
  value: number;
  color: 'amber' | 'purple' | 'blue' | 'emerald';
  icon: React.ReactNode;
}) {
  const colors = {
    amber: { bg: 'bg-[#FEF3C7]', icon: 'text-[#F59E0B]', border: 'border-[#FDE68A]' },
    purple: { bg: 'bg-[#EDE9FE]', icon: 'text-[#8B5CF6]', border: 'border-[#DDD6FE]' },
    blue: { bg: 'bg-[#EEF2FF]', icon: 'text-[#3B82F6]', border: 'border-[#BFDBFE]' },
    emerald: { bg: 'bg-[#D1FAE5]', icon: 'text-[#10B981]', border: 'border-[#A7F3D0]' },
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

/* ─── Gap Category Card ─── */
function GapCategoryCard({ title, icon: Icon, iconColor, iconBg, borderColor, severity, items, index }: {
  title: string;
  icon: any;
  iconColor: string;
  iconBg: string;
  borderColor: string;
  severity: 'high' | 'medium' | 'low' | 'info';
  items: string[];
  index: number;
}) {
  const [expanded, setExpanded] = useState(true);

  const severityConfig = {
    high: { color: 'var(--color-error)', bg: 'var(--color-error-light)', label: 'High' },
    medium: { color: 'var(--color-warning)', bg: 'var(--color-warning-light)', label: 'Medium' },
    low: { color: 'var(--color-success)', bg: 'var(--color-success-light)', label: 'Low' },
    info: { color: 'var(--color-info)', bg: 'var(--color-info-light)', label: 'Info' },
  };

  const sev = severityConfig[severity];

  return (
    <div
      className="rounded-xl transition-all duration-200 animate-slide-in"
      style={{
        background: 'var(--background-primary)',
        border: '1px solid var(--border-subtle)',
        borderLeft: `4px solid ${borderColor}`,
        animationDelay: `${index * 80}ms`,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer transition-colors"
        onClick={() => setExpanded(!expanded)}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--background-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: iconBg }}
          >
            <Icon className="w-5 h-5" style={{ color: iconColor }} />
          </div>
          <div>
            <h3 className="text-body-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
            <p className="text-ui-xs" style={{ color: 'var(--text-muted)' }}>{items.length} items found</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="text-ui-xs font-semibold px-2 py-1 rounded-md uppercase"
            style={{ background: sev.bg, color: sev.color }}
          >
            {sev.label}
          </span>
          {expanded ? (
            <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          ) : (
            <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          )}
        </div>
      </div>

      {/* Items */}
      {expanded && (
        <div className="px-4 pb-4 animate-fade-in" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <ul className="pt-4 space-y-3">
            {items.map((item: string, idx: number) => (
              <li key={idx} className="flex items-start gap-3 text-body-sm" style={{ color: 'var(--text-secondary)' }}>
                <span
                  className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0"
                  style={{ backgroundColor: borderColor }}
                />
                <span className="flex-1" style={{ lineHeight: '1.6' }}>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
