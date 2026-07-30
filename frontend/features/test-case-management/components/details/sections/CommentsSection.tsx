'use client';

/**
 * Comments — renders the single `comments` string field. A threaded comment timeline is on
 * the roadmap (the data model only has one free-text field today), noted under the content.
 */
import { MessageSquare } from 'lucide-react';
import type { TestCase } from '@/features/test-case-management/types';
import { SectionCard } from '../shared/SectionCard';
import { EmptySection } from '../shared/EmptySection';

export function CommentsSection({ tc }: { tc: TestCase }) {
    const has = !!tc.comments?.trim();
    return (
        <SectionCard id="comments" title="Comments" icon={<MessageSquare className="w-4 h-4" />} description="Execution and review notes.">
            {has ? (
                <p className="text-sm text-[#475569] whitespace-pre-wrap leading-relaxed">{tc.comments}</p>
            ) : (
                <EmptySection
                    variant="empty"
                    icon={MessageSquare}
                    title="No comments available"
                    description="Add comments during execution or review."
                />
            )}
            <p className="text-[11px] text-[#94A3B8] mt-3">
                Single-field note today — a threaded comment timeline is coming.
            </p>
        </SectionCard>
    );
}
