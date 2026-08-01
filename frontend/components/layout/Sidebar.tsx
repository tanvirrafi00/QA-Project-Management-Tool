'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/AuthContext';
import type { UserRole } from '@/features/auth/types';
import {
  Calculator,
  ClipboardCheck,
  Bug,
  Sparkles,
  BarChart3,
  ListChecks,
  FolderKanban,
  Users,
  Upload,
  ChevronDown,
} from 'lucide-react';

type NavIcon = typeof Sparkles;

interface NavItem {
  name: string;
  href: string;
  icon: NavIcon;
  /** When omitted the item is visible to everyone; otherwise filtered by role. */
  roles?: UserRole[];
}

interface NavSection {
  /** Clickable parent header — toggles the visibility of its items. */
  label: string;
  items: NavItem[];
}

/** localStorage key for the set of collapsed section labels. */
const COLLAPSED_STORAGE_KEY = 'sidebar-collapsed-sections';

/**
 * Role-aware navigation, grouped into collapsible sections. Items without `roles` are visible to
 * everyone; others are filtered by the current user's role (see `docs/rbac-design.md` §1). A section
 * is only rendered when it has at least one visible item. Falls back to "show all" while the session
 * is loading or on unauthenticated render (the proxy gates the shell anyway).
 *
 * Each section header is clickable: it expands/collapses its items (state persisted to localStorage).
 * The section containing the active route is always kept expanded so the active item stays visible.
 *
 * Hidden modules (kept out of the menu so direct navigation still works via their routes):
 *   Dashboard, Gap Analysis, API Tests, Test Data, History, Settings.
 */
const navigationSections: NavSection[] = [
  {
    label: 'Projects',
    items: [
      { name: 'Project Management', href: '/projects', icon: FolderKanban, roles: ['admin', 'qa_lead'] },
      { name: 'Project Estimation', href: '/project-estimation', icon: Calculator },
    ],
  },
  {
    label: 'Testing',
    items: [
      { name: 'Test Case Generator', href: '/test-cases', icon: ClipboardCheck },
      { name: 'Import Test Cases', href: '/test-case-import', icon: Upload },
      { name: 'Test Management', href: '/test-management', icon: ListChecks },
    ],
  },
  {
    label: 'Bugs',
    items: [
      { name: 'Bug Generator', href: '/bug-generator', icon: Bug },
      { name: 'Import Bugs', href: '/bug-import', icon: Upload },
      { name: 'Bug Dashboard', href: '/bug-dashboard', icon: BarChart3 },
    ],
  },
  {
    label: 'Administration',
    items: [
      { name: 'User Management', href: '/admin/users', icon: Users, roles: ['admin'] },
    ],
  },
];

function isItemActive(pathname: string, href: string) {
  return pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
}

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const role = user?.role;

  const isVisible = (item: NavItem) => !item.roles || !role || item.roles.includes(role);

  // Pre-filter items per section and drop sections that end up empty for this role.
  const sections = navigationSections
    .map((section) => ({ ...section, items: section.items.filter(isVisible) }))
    .filter((section) => section.items.length > 0);

  // Collapsed state — initialized empty (avoids SSR hydration mismatch), then hydrated from
  // localStorage on mount.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
      if (stored) setCollapsed(new Set(JSON.parse(stored) as string[]));
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  const toggleSection = (label: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      try {
        window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        /* storage unavailable — keep in-memory only */
      }
      return next;
    });
  };

  return (
    <aside aria-label="Main navigation" className="w-[280px] bg-white flex flex-col border-r border-[#E2E8F0] flex-shrink-0 overflow-hidden">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 flex-shrink-0 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center flex-shrink-0 shadow-sm">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="text-[15px] font-semibold text-[#1E293B] tracking-wide">QA Copilot</span>
        </div>
      </div>

      {/* Navigation - Scrollable, grouped into collapsible sections */}
      <nav aria-label="Section navigation" className="flex-1 px-4 py-3 overflow-y-auto">
        {sections.map((section, sectionIndex) => {
          // Keep the active section expanded so the active item is always visible.
          const containsActive = section.items.some((item) => isItemActive(pathname, item.href));
          const isCollapsed = collapsed.has(section.label) && !containsActive;

          return (
            <div key={section.label} className={cn(sectionIndex === 0 ? 'mt-1' : 'mt-6')}>
              {/* Clickable section header */}
              <button
                type="button"
                onClick={() => toggleSection(section.label)}
                aria-expanded={!isCollapsed}
                className="group w-full flex items-center justify-between px-3 pb-2 rounded-lg transition-colors hover:bg-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06B6D4]/40 cursor-pointer"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8] group-hover:text-[#64748B] transition-colors">
                  {section.label}
                </span>
                <ChevronDown
                  className={cn(
                    'w-3.5 h-3.5 text-[#94A3B8] transition-transform duration-200',
                    isCollapsed && '-rotate-90',
                  )}
                />
              </button>

              {/* Collapsible items — grid-rows trick for a smooth height animation */}
              <div
                className={cn(
                  'grid transition-all duration-200 ease-in-out',
                  isCollapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100',
                )}
              >
                <div className="overflow-hidden">
                  <div className="space-y-1">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = isItemActive(pathname, item.href);

                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          prefetch={false}
                          aria-current={isActive ? 'page' : undefined}
                          className={cn(
                            'group flex items-center gap-3 px-3 h-10 rounded-xl text-sm font-medium transition-all duration-200 relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06B6D4]/40',
                            isActive
                              ? 'text-[#1E293B] bg-[#E0F2FE] border border-[#06B6D4]/20'
                              : 'text-[#64748B] hover:text-[#1E293B] hover:bg-[#F8FAFC]',
                          )}
                        >
                          {/* Active indicator bar */}
                          {isActive && (
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-5 rounded-r-full bg-[#06B6D4]" />
                          )}
                          <Icon
                            className={cn(
                              'w-4 h-4 flex-shrink-0 transition-colors',
                              isActive ? 'text-[#06B6D4]' : 'text-[#64748B] group-hover:text-[#1E293B]',
                            )}
                          />
                          <span className="truncate">{item.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer - 20px breathing room from bottom bezel */}
      <div className="px-5 pb-5 pt-4 border-t border-[#E2E8F0] flex-shrink-0">
        <div className="text-[12px] text-[#94A3B8] text-center font-mono">
          AI QA Copilot v1.0
        </div>
      </div>
    </aside>
  );
}
