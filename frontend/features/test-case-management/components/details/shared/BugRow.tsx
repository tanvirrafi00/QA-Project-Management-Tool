'use client';

/**
 * BugRow — one row of the Related Bugs table. The whole row is clickable and navigates to
 * the Bug Dashboard (there is no per-bug detail route today). Reuses the standard table-row
 * + badge styling (docs/ui-standards.md §4/§6).
 */
import { useRouter } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import type { Bug, BugSeverity, BugStatus } from '@/features/bug-management/types';

const SEVERITY_STYLE: Record<BugSeverity, string> = {
    Critical: 'bg-[#FEF2F2] text-[#DC2626]',
    High: 'bg-[#FFF7ED] text-[#EA580C]',
    Medium: 'bg-[#FEFCE8] text-[#F59E0B]',
    Low: 'bg-[#F0FDF4] text-[#16A34A]',
};

const STATUS_STYLE: Record<BugStatus, string> = {
    'Open': 'bg-[#FEF2F2] text-[#DC2626]',
    'Assigned': 'bg-[#EFF6FF] text-[#3B82F6]',
    'In Progress': 'bg-[#ECFEFF] text-[#06B6D4]',
    'Fixed': 'bg-[#F5F3FF] text-[#8B5CF6]',
    'Ready For QA': 'bg-[#FFFBEB] text-[#D97706]',
    'Verified': 'bg-[#ECFDF5] text-[#059669]',
    'Closed': 'bg-[#F1F5F9] text-[#64748B]',
    'Reopened': 'bg-[#FEF2F2] text-[#DC2626]',
};

export function BugRow({ bug }: { bug: Bug }) {
    const router = useRouter();
    return (
        <tr
            onClick={() => router.push('/bug-dashboard')}
            className="border-b border-[#F1F5F9] last:border-0 hover:bg-[#F8FAFC] cursor-pointer transition-colors"
        >
            <td className="px-4 py-2.5 text-sm font-mono font-medium text-[#06B6D4] whitespace-nowrap">{bug.bugId}</td>
            <td className="px-4 py-2.5 text-sm text-[#1E293B] max-w-xs truncate">{bug.title}</td>
            <td className="px-4 py-2.5">
                <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_STYLE[bug.status]}`}>
                    {bug.status}
                </span>
            </td>
            <td className="px-4 py-2.5">
                <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${SEVERITY_STYLE[bug.severity]}`}>
                    {bug.severity}
                </span>
            </td>
            <td className="px-4 py-2.5 text-right">
                <ExternalLink className="w-3.5 h-3.5 text-[#94A3B8] inline" />
            </td>
        </tr>
    );
}
