'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/AuthContext';
import type { UserRole } from '@/features/auth/types';
import {
  LayoutDashboard,
  Calculator,
  ClipboardCheck,
  SearchCheck,
  Globe,
  Bug,
  FlaskConical,
  History,
  Settings,
  Sparkles,
  BarChart3,
  ListChecks,
  FolderKanban,
  Users,
  Upload,
} from 'lucide-react';

/**
 * Role-aware navigation. Items without `roles` are visible to everyone; others are filtered by the
 * current user's role (see `docs/rbac-design.md` §1). Falls back to "show all" while the session is
 * loading or on unauthenticated render (the proxy gates the shell anyway).
 */
const navigationItems: { name: string; href: string; icon: typeof LayoutDashboard; roles?: UserRole[]; hidden?: boolean }[] = [
  // Hidden modules (kept in config so routes still work for direct navigation; removed from the menu):
  //   Dashboard, Gap Analysis, API Tests, Test Data, History, Settings
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, hidden: true },
  { name: 'User Management', href: '/admin/users', icon: Users, roles: ['admin'] },
  { name: 'Project Management', href: '/projects', icon: FolderKanban, roles: ['admin', 'qa_lead'] },
  { name: 'Project Estimation', href: '/project-estimation', icon: Calculator },
  { name: 'Test Cases', href: '/test-cases', icon: ClipboardCheck },
  { name: 'Test Management', href: '/test-management', icon: ListChecks },
  { name: 'Import Test Cases', href: '/test-case-import', icon: Upload },
  { name: 'Gap Analysis', href: '/gap-analysis', icon: SearchCheck, roles: ['admin', 'qa_lead'], hidden: true },
  { name: 'API Tests', href: '/api-tests', icon: Globe, roles: ['admin', 'qa_lead'], hidden: true },
  { name: 'Bug Generator', href: '/bug-generator', icon: Bug },
  { name: 'Bug Dashboard', href: '/bug-dashboard', icon: BarChart3 },
  { name: 'Import Bugs', href: '/bug-import', icon: Upload },
  { name: 'Test Data', href: '/test-data', icon: FlaskConical, roles: ['admin'], hidden: true },
  { name: 'History', href: '/history', icon: History, roles: ['admin'], hidden: true },
  { name: 'Settings', href: '/settings', icon: Settings, roles: ['admin'], hidden: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const role = user?.role;

  const items = navigationItems.filter(
    (item) => !item.hidden && (!item.roles || !role || item.roles.includes(role)),
  );

  return (
    <aside className="w-[280px] bg-white flex flex-col border-r border-[#E2E8F0] flex-shrink-0 overflow-hidden">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 flex-shrink-0 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center flex-shrink-0 shadow-sm">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="text-[15px] font-semibold text-[#1E293B] tracking-wide">QA Copilot</span>
        </div>
      </div>

      {/* Navigation - Scrollable */}
      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(`${item.href}/`));

          return (
            <Link
              key={item.name}
              href={item.href}
              prefetch={false}
              className={cn(
                'group flex items-center gap-3 px-3 h-10 rounded-xl text-sm font-medium transition-all duration-200 relative',
                isActive
                  ? 'text-[#1E293B] bg-[#E0F2FE] border border-[#06B6D4]/20'
                  : 'text-[#64748B] hover:text-[#1E293B] hover:bg-[#F8FAFC]'
              )}
            >
              {/* Active indicator bar */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-5 rounded-r-full bg-[#06B6D4]" />
              )}
              <Icon className={cn("w-4 h-4 flex-shrink-0 transition-colors", isActive ? "text-[#06B6D4]" : "text-[#64748B] group-hover:text-[#1E293B]")} />
              <span className="truncate">{item.name}</span>
            </Link>
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
