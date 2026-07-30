'use client';

/**
 * BugDetailsSectionNav — left in-page navigation with scroll-spy (IntersectionObserver).
 *
 * Mirrors the test-case `DetailsSectionNav`. The scroll root is the AppShell `<main>` element.
 * Active highlight tracks the section near the top, just under the sticky header. Each section
 * relies on its `scroll-mt-[96px]`. Hidden below `lg`.
 */
import { useEffect, useState } from 'react';
import {
    Info, FileText, ClipboardList, Check, AlertTriangle, Paperclip,
    History, Link2, Sparkles, type LucideIcon,
} from 'lucide-react';

interface NavItem {
    id: string;
    label: string;
    icon: LucideIcon;
}

const ITEMS: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'description', label: 'Description', icon: FileText },
    { id: 'reproduction', label: 'Reproduction', icon: ClipboardList },
    { id: 'expected', label: 'Expected Result', icon: Check },
    { id: 'actual', label: 'Actual Result', icon: AlertTriangle },
    { id: 'impact', label: 'Impact', icon: AlertTriangle },
    { id: 'attachments', label: 'Attachments', icon: Paperclip },
    { id: 'history', label: 'History', icon: History },
    { id: 'linked-tests', label: 'Linked Test Cases', icon: Link2 },
    { id: 'ai-insights', label: 'AI Insights', icon: Sparkles },
];

export function BugDetailsSectionNav() {
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
