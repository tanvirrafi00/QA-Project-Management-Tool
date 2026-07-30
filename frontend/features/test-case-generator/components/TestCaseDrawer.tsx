'use client';

/**
 * TestCaseDrawer - Right-side details drawer
 * Opens when user clicks a test case for full details
 */

import { X, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { TestCase } from '../types';

interface TestCaseDrawerProps {
  testCase: TestCase | null;
  onClose: () => void;
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="text-xs uppercase tracking-wider flex-shrink-0 w-28" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <span className="text-sm flex-1" style={{ color: 'var(--text-secondary)', lineHeight: '1.5' }}>
        {value}
      </span>
    </div>
  );
}

export function TestCaseDrawer({ testCase, onClose }: TestCaseDrawerProps) {
  const [copied, setCopied] = useState(false);

  if (!testCase) return null;

  const handleCopy = () => {
    const text = `${testCase.id}: ${testCase.name || testCase.scenario}\n\nSteps:\n${(testCase.steps || []).map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nExpected: ${testCase.expectedResult}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 transition-opacity"
        style={{ background: 'rgba(0, 0, 0, 0.4)' }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md overflow-y-auto transition-transform duration-300"
        style={{
          background: 'var(--background-primary)',
          borderLeft: '1px solid var(--border-default)',
          boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.1)',
        }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between p-5 border-b"
          style={{ background: 'var(--background-primary)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono px-2 py-1 rounded-md" style={{ background: 'var(--background-tertiary)', color: 'var(--text-muted)' }}>
              {testCase.id}
            </span>
            <span className="px-2 py-0.5 text-xs font-medium rounded" style={{ background: 'var(--background-tertiary)', color: 'var(--text-tertiary)' }}>
              {testCase.type}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }}
              title="Copy"
            >
              {copied ? <Check className="w-4 h-4" style={{ color: 'var(--color-success)' }} /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-6">
          {/* Title */}
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)', lineHeight: '1.4' }}>
              {testCase.name || testCase.scenario}
            </h2>
          </div>

          {/* Basic Info */}
          <div className="rounded-xl p-4" style={{ background: 'var(--background-secondary)', border: '1px solid var(--border-subtle)' }}>
            <DetailRow label="Module" value={testCase.module} />
            <DetailRow label="Priority" value={testCase.priority} />
            <DetailRow label="Type" value={testCase.type} />
            <DetailRow label="Status" value={testCase.testStatus || 'Not Executed'} />
          </div>

          {/* Tags */}
          {testCase.tags && testCase.tags.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                Tags
              </h3>
              <div className="flex flex-wrap gap-2">
                {testCase.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 text-xs rounded-lg border"
                    style={{ background: 'var(--background-secondary)', color: 'var(--text-tertiary)', borderColor: 'var(--border-subtle)' }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Steps */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-primary)' }} />
              Test Steps
            </h3>
            <ol className="space-y-3">
              {testCase.steps?.map((step, idx) => (
                <li key={idx} className="text-sm flex gap-3" style={{ color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                  <span
                    className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-xs font-mono font-medium"
                    style={{ background: 'var(--background-secondary)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
                  >
                    {idx + 1}
                  </span>
                  <span className="flex-1 pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Expected Result */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-success)' }} />
              Expected Result
            </h3>
            <div className="p-4 rounded-xl border" style={{ background: 'var(--background-secondary)', borderColor: 'var(--border-subtle)' }}>
              <p className="text-sm" style={{ color: 'var(--text-secondary)', lineHeight: '1.7' }}>
                {testCase.expectedResult}
              </p>
            </div>
          </div>

          {/* Execution Metadata */}
          <div className="rounded-xl p-4 space-y-1" style={{ background: 'var(--background-secondary)', border: '1px solid var(--border-subtle)' }}>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
              Execution Details
            </h3>
            <DetailRow label="Assigned To" value={testCase.assignedTo || 'Unassigned'} />
            <DetailRow label="Execution Date" value={testCase.executionDate || 'Not set'} />
            <DetailRow label="Related Bugs" value={testCase.relatedBugs || 'N/A'} />
            <DetailRow label="Comments" value={testCase.comments || 'N/A'} />
          </div>
        </div>
      </div>
    </>
  );
}
