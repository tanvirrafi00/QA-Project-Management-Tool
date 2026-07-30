'use client';

/**
 * Enhanced TestCaseCard
 * Professional QA test case card with expand/collapse, copy, and bookmark
 */

import { useState, memo } from 'react';
import {
    CheckCircle, AlertTriangle, Shield, Zap, Layers, Copy, Check,
    ChevronDown, ChevronUp, Bookmark, BookmarkCheck,
} from 'lucide-react';
import { TestCase } from '../types';

interface TestCaseCardProps {
    testCase: TestCase;
    isBookmarked?: boolean;
    onToggleBookmark?: (id: string) => void;
    onViewDetails?: (testCase: TestCase) => void;
}

function getCardStyle(type: string) {
    const t = type?.toLowerCase() || 'functional';
    switch (t) {
        case 'negative':
            return { borderColor: '#FECACA', iconBg: '#FEE2E2', iconColor: '#DC2626', Icon: AlertTriangle };
        case 'security':
            return { borderColor: '#DDD6FE', iconBg: '#EDE9FE', iconColor: '#8B5CF6', Icon: Shield };
        case 'edge':
        case 'boundary':
            return { borderColor: '#FDE68A', iconBg: '#FEF3C7', iconColor: '#F59E0B', Icon: Zap };
        case 'scenario':
            return { borderColor: '#BFDBFE', iconBg: '#DBEAFE', iconColor: '#3B82F6', Icon: Layers };
        default:
            return { borderColor: '#A7F3D0', iconBg: '#D1FAE5', iconColor: '#10B981', Icon: CheckCircle };
    }
}

function getPriorityBadge(priority: string): string {
    switch (priority?.toLowerCase()) {
        case 'critical': return 'bg-[#FEE2E2] text-[#DC2626] border-[#FECACA]';
        case 'high': return 'bg-[#FED7AA] text-[#EA580C] border-[#FDBA74]';
        case 'low': return 'bg-[#D1FAE5] text-[#059669] border-[#A7F3D0]';
        default: return 'bg-[#F1F5F9] text-[#64748B] border-[#CBD5E1]';
    }
}

export const TestCaseCard = memo(function TestCaseCard({ testCase, isBookmarked, onToggleBookmark, onViewDetails }: TestCaseCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [copied, setCopied] = useState(false);

    const style = getCardStyle(testCase.type);
    const Icon = style.Icon;

    const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const text = `${testCase.id}: ${testCase.name || testCase.scenario}\n\nSteps:\n${(testCase.steps || []).map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nExpected: ${testCase.expectedResult}`;
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard unavailable (insecure context / permission denied) — no false "copied" */
        }
    };

    const handleBookmark = (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggleBookmark?.(testCase.id);
    };

    return (
        <div
            className="rounded-xl border-l-4 transition-all duration-300"
            style={{
                borderLeftColor: style.borderColor,
                background: 'var(--background-primary)',
                border: '1px solid var(--border-subtle)',
                borderLeftWidth: '4px',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-medium)';
                e.currentTarget.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.15)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
            }}
        >
            {/* Header */}
            <div className="p-4 cursor-pointer" onClick={() => onViewDetails ? onViewDetails(testCase) : setIsExpanded(!isExpanded)}>
                <div className="flex items-center gap-3">
                    {/* Icon */}
                    <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: style.iconBg, color: style.iconColor }}
                    >
                        <Icon className="w-5 h-5" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                                {testCase.id}
                            </span>
                            <span className={`px-2 py-0.5 text-xs font-medium rounded border ${getPriorityBadge(testCase.priority)}`}>
                                {testCase.priority}
                            </span>
                            <span className="px-2 py-0.5 text-xs font-medium rounded" style={{ background: 'var(--background-tertiary)', color: 'var(--text-tertiary)' }}>
                                {testCase.type}
                            </span>
                        </div>
                        <h4 className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)', lineHeight: '1.4' }}>
                            {testCase.name || testCase.scenario}
                        </h4>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                            onClick={handleCopy}
                            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                            style={{ color: 'var(--text-muted)' }}
                            title="Copy test case"
                        >
                            {copied ? <Check className="w-4 h-4" style={{ color: 'var(--color-success)' }} /> : <Copy className="w-4 h-4" />}
                        </button>
                        {onToggleBookmark && (
                            <button
                                onClick={handleBookmark}
                                className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                                style={{ color: isBookmarked ? 'var(--color-primary)' : 'var(--text-muted)' }}
                                title="Bookmark"
                            >
                                {isBookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                            </button>
                        )}
                        {!onViewDetails && (
                            <button
                                onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
                                className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                                style={{ color: 'var(--text-muted)' }}
                            >
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && !onViewDetails && (
                <div className="px-4 pb-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                    {/* Tags */}
                    {testCase.tags && testCase.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-4 mb-4">
                            {testCase.tags.map((tag) => (
                                <span
                                    key={tag}
                                    className="px-2 py-1 text-xs rounded-lg border"
                                    style={{ background: 'var(--background-secondary)', color: 'var(--text-tertiary)', borderColor: 'var(--border-subtle)' }}
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Module */}
                    {testCase.module && (
                        <div className="mb-4">
                            <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Module: </span>
                            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{testCase.module}</span>
                        </div>
                    )}

                    {/* Steps */}
                    <div className="mb-4">
                        <h5 className="text-xs font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-primary)' }} />
                            Test Steps
                        </h5>
                        <ol className="space-y-2 pl-4">
                            {testCase.steps?.map((step, idx) => (
                                <li key={idx} className="text-sm flex gap-3" style={{ color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                                    <span
                                        className="flex-shrink-0 w-5 h-5 rounded-lg flex items-center justify-center text-xs font-mono font-medium"
                                        style={{ background: 'var(--background-secondary)', color: 'var(--text-secondary)' }}
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
                        <h5 className="text-xs font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-success)' }} />
                            Expected Result
                        </h5>
                        <div className="p-3.5 rounded-lg border" style={{ background: 'var(--background-secondary)', borderColor: 'var(--border-subtle)' }}>
                            <p className="text-sm" style={{ color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                                {testCase.expectedResult}
                            </p>
                        </div>
                    </div>

                    {/* Execution Fields */}
                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                        <div>
                            <span style={{ color: 'var(--text-muted)' }}>Status: </span>
                            <span style={{ color: 'var(--text-secondary)' }}>{testCase.testStatus || 'Not Executed'}</span>
                        </div>
                        <div>
                            <span style={{ color: 'var(--text-muted)' }}>Assigned: </span>
                            <span style={{ color: 'var(--text-secondary)' }}>{testCase.assignedTo || 'Unassigned'}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});
