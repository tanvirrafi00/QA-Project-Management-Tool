'use client';

import { FolderKanban, CheckCircle2, Archive, Bug, FlaskConical } from 'lucide-react';
import { StatCard } from '@/components/core';
import { ProjectSummary } from '../types';

interface ProjectSummaryCardsProps {
    summary: ProjectSummary | null;
}

export function ProjectSummaryCards({ summary }: ProjectSummaryCardsProps) {
    const s = summary ?? {
        totalProjects: 0,
        activeProjects: 0,
        archivedProjects: 0,
        totalBugs: 0,
        totalTestCases: 0,
    };

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard
                title="Total Projects"
                value={s.totalProjects}
                icon={FolderKanban}
                color="blue"
            />
            <StatCard
                title="Active Projects"
                value={s.activeProjects}
                icon={CheckCircle2}
                color="emerald"
            />
            <StatCard
                title="Archived"
                value={s.archivedProjects}
                icon={Archive}
                color="amber"
            />
            <StatCard
                title="Total Bugs"
                value={s.totalBugs}
                icon={Bug}
                color="purple"
            />
            <StatCard
                title="Total Test Cases"
                value={s.totalTestCases}
                icon={FlaskConical}
                color="blue"
            />
        </div>
    );
}
