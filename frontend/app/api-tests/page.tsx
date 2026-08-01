'use client';

import { useState } from 'react';
import { AppShell, PageContainer, SplitPane, Panel } from '@/components/layout';
import { SectionHeader, Button, Label, Input, TextArea } from '@/components/core';
import { Globe, CheckCircle, AlertTriangle, Shield, Zap, Copy, Check, Loader2 } from 'lucide-react';
import { ChevronDown, ChevronRight, Target } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

export default function ApiTestsPage() {
  const [endpoint, setEndpoint] = useState('');
  const [requestBody, setRequestBody] = useState('');
  const [responseBody, setResponseBody] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleGenerate = async () => {
    if (!endpoint.trim()) return;

    setIsGenerating(true);
    setTimeout(() => {
      setResult({
        endpoint,
        summary: {
          total: 12,
          positive: 4,
          negative: 4,
          security: 2,
          edge: 2,
        },
        tests: {
          positive: [
            {
              id: 'API-001',
              description: 'Valid request returns 200',
              method: 'POST',
              expectedStatus: 200,
              assertions: ['Response status is 200', 'Response has user object', 'User object has id field'],
            },
            {
              id: 'API-002',
              description: 'Valid request with all fields',
              method: 'POST',
              expectedStatus: 200,
              assertions: ['Response status is 200', 'All fields persisted correctly'],
            },
          ],
          negative: [
            {
              id: 'API-NEG-001',
              description: 'Missing required email field',
              method: 'POST',
              expectedStatus: 400,
              assertions: ['Response status is 400', 'Error message includes "email required"'],
            },
            {
              id: 'API-NEG-002',
              description: 'Invalid email format',
              method: 'POST',
              expectedStatus: 400,
              assertions: ['Response status is 400', 'Error message indicates invalid email'],
            },
          ],
          security: [
            {
              id: 'API-SEC-001',
              description: 'SQL Injection in email field',
              method: 'POST',
              expectedStatus: 400,
              assertions: ['Input is sanitized', 'Error returned without exposing DB structure'],
            },
          ],
          edge: [
            {
              id: 'API-EDGE-001',
              description: 'Maximum length username',
              method: 'POST',
              expectedStatus: 200,
              assertions: ['Username of 100 chars accepted', 'Username of 101 chars rejected'],
            },
          ],
        },
      });
      setIsGenerating(false);
    }, 2000);
  };

  const handleCopyAll = () => {
    if (!result) return;
    const allTests = Object.entries(result.tests)
      .map(([category, tests]: [string, any]) =>
        `## ${category.toUpperCase()}\n${tests.map((t: any) => `${t.id}: ${t.description}\nMethod: ${t.method} | Expected: ${t.expectedStatus}\nAssertions:\n${t.assertions.map((a: string) => `  - ${a}`).join('\n')}`).join('\n\n')}`
      ).join('\n\n');
    navigator.clipboard.writeText(allTests);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AppShell>
      <PageContainer>
        <div className="space-y-6">
          <SectionHeader
            title="API Test Generator"
            description="Generate comprehensive API test cases from endpoint specifications"
          />

          <SplitPane stickyLeft={true}>
            {/* Input Panel */}
            <Panel padding="default">
              <div className="space-y-5">
                <div>
                  <Label required>API Endpoint</Label>
                  <Input
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    placeholder="POST /api/users"
                  />
                </div>

                <details
                  open={showDetails}
                  onToggle={(e) => setShowDetails((e.target as HTMLDetailsElement).open)}
                  className="group"
                >
                  <summary className="text-xs cursor-pointer transition-colors list-none flex items-center gap-2 select-none" style={{ color: 'var(--text-tertiary)' }}>
                    {showDetails ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    Request/Response Details
                  </summary>
                  <div className="mt-4 space-y-4 pl-6">
                    <div>
                      <Label>Request Body (JSON)</Label>
                      <TextArea
                        value={requestBody}
                        onChange={(e) => setRequestBody(e.target.value)}
                        rows={4}
                        className="min-h-[100px]"
                        placeholder={'{\n  "username": "testuser",\n  "email": "test@example.com"\n}'}
                      />
                    </div>
                    <div>
                      <Label>Response Body (JSON)</Label>
                      <TextArea
                        value={responseBody}
                        onChange={(e) => setResponseBody(e.target.value)}
                        rows={4}
                        className="min-h-[100px]"
                        placeholder={'{\n  "id": "123",\n  "username": "testuser",\n  "email": "test@example.com"\n}'}
                      />
                    </div>
                  </div>
                </details>

                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || !endpoint.trim()}
                  className="w-full"
                  isLoading={isGenerating}
                  leftIcon={<Globe className="w-5 h-5" />}
                >
                  Generate API Tests
                </Button>
              </div>
            </Panel>

            {/* Output Panel */}
            <div className="min-h-[500px]">
              {isGenerating ? (
                <ApiLoadingState />
              ) : result ? (
                <ApiResultsView result={result} onCopy={handleCopyAll} copied={copied} />
              ) : (
                <ApiEmptyState />
              )}
            </div>
          </SplitPane>
        </div>
      </PageContainer>
    </AppShell>
  );
}

/* ─── Loading State ─── */
function ApiLoadingState() {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl min-h-[550px] flex flex-col items-center justify-center text-center p-8">
      <Loader2 className="w-10 h-10 text-[#06B6D4] animate-spin mb-4" />
      <p className="text-base font-semibold text-[#0F172A] mb-1.5">
        Generating API test cases...
      </p>
      <p className="text-sm text-[#64748B]">
        Analyzing endpoint specification
      </p>
    </div>
  );
}

/* ─── Empty State ─── */
function ApiEmptyState() {
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-2xl min-h-[550px]">
      <EmptyState
        icon={Globe}
        title="No API Tests Yet"
        description="Enter your API endpoint details to generate comprehensive test cases"
      />
    </div>
  );
}

/* ─── Results View ─── */
function ApiResultsView({ result, onCopy, copied }: { result: any; onCopy: () => void; copied: boolean }) {
  const [activeTab, setActiveTab] = useState<string>('positive');

  const tabs = [
    { id: 'positive', label: 'Positive', icon: CheckCircle, count: result.tests.positive.length, color: 'var(--color-success)' },
    { id: 'negative', label: 'Negative', icon: AlertTriangle, count: result.tests.negative.length, color: 'var(--color-error)' },
    { id: 'security', label: 'Security', icon: Shield, count: result.tests.security.length, color: 'var(--color-warning)' },
    { id: 'edge', label: 'Edge Cases', icon: Zap, count: result.tests.edge.length, color: 'var(--color-purple)' },
  ];

  const activeTests = result.tests[activeTab] || [];

  return (
    <div
      className="w-full h-full flex flex-col animate-fade-in"
      style={{
        background: 'var(--background-primary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-xl)',
        padding: 'var(--spacing-8)',
        gap: 'var(--spacing-6)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden',
      }}
    >
      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <ResultMetricCard
          icon={<Target className="w-4 h-4" />}
          label="TOTAL TESTS"
          value={result.summary.total}
          color="blue"
        />
        <ResultMetricCard
          icon={<CheckCircle className="w-4 h-4" />}
          label="POSITIVE"
          value={result.summary.positive}
          color="emerald"
        />
        <ResultMetricCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="NEGATIVE"
          value={result.summary.negative}
          color="amber"
        />
        <ResultMetricCard
          icon={<Shield className="w-4 h-4" />}
          label="SECURITY"
          value={result.summary.security}
          color="purple"
        />
      </div>

      {/* Tab Bar */}
      <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex gap-4 sm:gap-6 flex-wrap">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className="text-ui-md transition-all relative pb-2 whitespace-nowrap"
              style={{
                color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--text-tertiary)',
                fontWeight: activeTab === tab.id ? '600' : '500',
              }}
            >
              {tab.label}
              {tab.count > 0 && (
                <span
                  className="ml-1.5 text-ui-xs px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: 'var(--color-primary-light)', color: 'var(--color-primary)' }}
                >
                  {tab.count}
                </span>
              )}
              {activeTab === tab.id && (
                <span className="absolute bottom-[-1px] left-0 right-0 h-0.5 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }} />
              )}
            </button>
          ))}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onCopy}
          leftIcon={copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          className="whitespace-nowrap flex-shrink-0"
        >
          {copied ? 'Copied!' : 'Copy All'}
        </Button>
      </div>

      {/* Test Cases List */}
      <div className="flex-1 overflow-y-auto space-y-3" style={{ minHeight: 0 }}>
        {activeTests.map((test: any, idx: number) => (
          <ApiTestCard key={test.id} test={test} index={idx} />
        ))}
      </div>
    </div>
  );
}

/* ─── Metric Card ─── */
function ResultMetricCard({ icon, label, value, color }: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: 'blue' | 'emerald' | 'amber' | 'purple';
}) {
  const colors = {
    blue: { bg: 'bg-[#EEF2FF]', icon: 'text-[#3B82F6]', border: 'border-[#BFDBFE]' },
    emerald: { bg: 'bg-[#D1FAE5]', icon: 'text-[#10B981]', border: 'border-[#A7F3D0]' },
    amber: { bg: 'bg-[#FEF3C7]', icon: 'text-[#F59E0B]', border: 'border-[#FDE68A]' },
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

/* ─── Test Card ─── */
function ApiTestCard({ test, index }: { test: any; index: number }) {
  const [expanded, setExpanded] = useState(index === 0);

  const statusColor = test.expectedStatus >= 400 ? 'var(--color-error)' : 'var(--color-success)';
  const statusBg = test.expectedStatus >= 400 ? 'var(--color-error-light)' : 'var(--color-success-light)';

  return (
    <div
      className="rounded-xl transition-all duration-200 animate-slide-in"
      style={{
        background: 'var(--background-primary)',
        border: '1px solid var(--border-subtle)',
        animationDelay: `${index * 50}ms`,
      }}
    >
      <div
        className="flex items-center justify-between p-4 cursor-pointer transition-colors"
        onClick={() => setExpanded(!expanded)}
        style={{ borderRadius: 'var(--radius-lg)' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--background-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span
            className="text-ui-xs font-mono px-2 py-1 rounded-md flex-shrink-0"
            style={{ background: 'var(--background-tertiary)', color: 'var(--text-muted)' }}
          >
            {test.id}
          </span>
          <h4 className="text-body-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
            {test.description}
          </h4>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          <span
            className="text-ui-xs font-semibold px-2 py-1 rounded-md"
            style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}
          >
            {test.method}
          </span>
          <span
            className="text-ui-xs font-semibold px-2 py-1 rounded-md"
            style={{ background: statusBg, color: statusColor }}
          >
            {test.expectedStatus}
          </span>
          {expanded ? <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} /> : <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 animate-fade-in" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <div className="pt-4">
            <span className="text-ui-xs uppercase tracking-wider font-semibold mb-3 block" style={{ color: 'var(--text-muted)' }}>
              Assertions
            </span>
            <ul className="space-y-2">
              {test.assertions.map((assertion: string, idx: number) => (
                <li key={idx} className="flex items-center gap-2.5 text-body-sm" style={{ color: 'var(--text-secondary)' }}>
                  <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--color-success)' }} />
                  {assertion}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
