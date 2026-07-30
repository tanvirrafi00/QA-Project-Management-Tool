'use client';

/**
 * AI Insights — future-ready placeholder. Only project-level AI insights exist today; the
 * per-case coverage/duplicate-risk/suggestions shown in the spec are not yet backed by data.
 */
import { Sparkles } from 'lucide-react';
import { SectionCard } from '../shared/SectionCard';
import { EmptySection } from '../shared/EmptySection';

export function AIInsightsSection() {
    return (
        <SectionCard
            id="ai-insights"
            title="AI Insights"
            icon={<Sparkles className="w-4 h-4" />}
            description="AI-generated coverage and risk recommendations for this test case."
        >
            <EmptySection
                variant="comingSoon"
                icon={Sparkles}
                title="Per-case AI insights — coming soon"
                description="Coverage %, duplicate risk, similar test cases, missing test areas, and suggested improvements will appear here."
            />
        </SectionCard>
    );
}
