'use client';

/** Attachments — future-ready placeholder (no attachment storage in the backend yet). */
import { Paperclip } from 'lucide-react';
import { SectionCard } from '../shared/SectionCard';
import { EmptySection } from '../shared/EmptySection';

export function AttachmentsSection() {
    return (
        <SectionCard
            id="attachments"
            title="Attachments"
            icon={<Paperclip className="w-4 h-4" />}
            description="Screenshots, recordings, logs, and supporting documents."
        >
            <EmptySection
                variant="comingSoon"
                title="Attachments — coming soon"
                description="Upload screenshots, screen recordings, log files, API responses, and supporting documents. Attachment storage is on the roadmap."
            />
        </SectionCard>
    );
}
