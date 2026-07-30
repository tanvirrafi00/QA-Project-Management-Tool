'use client';

/**
 * DetailsSectionNav — left in-page navigation with scroll-spy (IntersectionObserver).
 *
 * The scroll root is the AppShell `<main>` element (the page's scroll container, not the
 * window). Active highlight tracks whichever section sits near the top, just under the
 * sticky header. Jumping to a section relies on each `SectionCard`'s `scroll-mt-[96px]`.
 * Hidden below `lg` (mobile stacks vertically).
 */
import { useEffect, useState } from 'react';
import {
    Info, FileText, ListChecks, Target, PlayCircle, Bug, MessageSquare,
    Paperclip, Sparkles, History, type LucideIcon,
} from 'lucide-react';

interface NavItem {
    id: string;
    label: string;
    icon: LucideIcon;
}

const ITEMS: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'description', label: 'Description', icon: FileText },
    { id: 'steps', label: 'Test Steps', icon: ListChecks },
    { id: 'expected', label: 'Expected Results', icon: Target },
    { id: 'execution', label: 'Execution', icon: PlayCircle },
    { id: 'bugs', label: 'Related Bugs', icon: Bug },
    { id: 'comments', label: 'Comments', icon: MessageSquare },
    { id: 'attachments', label: 'Attachments', icon: Paperclip },
    { id: 'ai-insights', label: 'AI Insights', icon: Sparkles },
    { id: 'history', label: 'History', icon: History },
];

export function DetailsSectionNav() {
    const [active, setActive] = useState('overview');

    useEffect(() => {
        const root = document.querySelector('main');
        const sections = ITEMS
            .map((i) => document.getElementById(i.id))
            .filter((el): el is HTMLElement => !!el);
        if (sections.length === 0) return;

        const visible = new Set<string>();
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((e) => {
                    if (e.isIntersecting) visible.add(e.target.id);
                    else visible.delete(e.target.id);
                });
                if (visible.size > 0) {
                    const top = sections.find((s) => visible.has(s.id));
                    if (top) setActive(top.id);
                }
            },
            { root, rootMargin: '-96px 0px -65% 0px', threshold: 0 },
        );
        sections.forEach((s) => observer.observe(s));
        return () => observer.disconnect();
    }, []);

    const goTo = (id: string) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActive(id);
    };

    return (
        <nav className="hidden lg:block">
            <div className="lg:sticky lg:top-[104px]">
                <p className="text-xs font-semibold text-[#94A3B8] uppercase tracking-wider mb-3 px-2">
                    Sections
                </p>
                <ul className="space-y-1">
                    {ITEMS.map((item) => {
                        const isActive = active === item.id;
                        const Icon = item.icon;
                        return (
                            <li key={item.id}>
                                <button
                                    onClick={() => goTo(item.id)}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                                        isActive
                                            ? 'bg-[#ECFEFF] text-[#0E7490]'
                                            : 'text-[#64748B] hover:text-[#1E293B] hover:bg-[#F8FAFC]'
                                    }`}
                                >
                                    <Icon className="w-4 h-4 flex-shrink-0" />
                                    <span className="truncate">{item.label}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </nav>
    );
}
