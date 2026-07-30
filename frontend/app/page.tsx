'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell, PageContainer } from '@/components/layout';
import { Button, StatCard } from '@/components/core';
import { EmptyDashboard } from '@/components/states';
import { formatStat } from '@/lib/safe-value';
import { ClipboardCheck, SearchCheck, Globe, FolderKanban, Bug, ListChecks, Loader2, UserCheck, ChevronRight, AlertCircle, RefreshCw } from 'lucide-react';
import { projectService } from '@/features/project-management/services/project.service';
import type { ProjectSummary } from '@/features/project-management/types';
import { useAuth } from '@/features/auth/AuthContext';
import { userService } from '@/features/user-management/services/user.service';
import type { UserSummary } from '@/features/user-management/types';

export default function Home() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [summary, setSummary] = useState<ProjectSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [userSummary, setUserSummary] = useState<UserSummary | null>(null);

  const loadDashboard = async () => {
    setLoading(true);
    setError(false);
    try {
      const r = await projectService.getProjectSummary();
      if (r.success && r.data) {
        setSummary(r.data);
      } else {
        // A failed fetch is an ERROR, not an empty dashboard — surface a retry.
        setSummary(null);
        setError(true);
      }
    } catch {
      setSummary(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  // Admins see a pending-approvals card — fetch the user summary only for them.
  useEffect(() => {
    if (!isAdmin) return;
    userService
      .getUserSummary()
      .then((r) => {
        if (r.success && r.data) setUserSummary(r.data);
      })
      .catch(() => {
        /* pending count stays 0 — the card degrades gracefully */
      });
  }, [isAdmin]);

  const projects = summary?.totalProjects ?? 0;
  const testCases = summary?.totalTestCases ?? 0;
  const bugs = summary?.totalBugs ?? 0;
  const active = summary?.activeProjects ?? 0;
  const isEmpty = !loading && !error && projects === 0 && testCases === 0 && bugs === 0;

  return (
    <AppShell>
      <PageContainer>
        <div className="space-y-6">
          {/* ========== HEADER ========== */}
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A] tracking-tight mb-1.5">Welcome back</h1>
            <p className="text-sm text-[#64748B]">AI QA Copilot dashboard</p>
          </div>

          {/* ========== PENDING APPROVALS (admin only) ========== */}
          {isAdmin && (
            <Link
              href="/admin/users"
              prefetch={false}
              className="group flex items-center justify-between gap-4 bg-white border-2 border-[#FDE68A] rounded-xl p-5 hover:border-[#F59E0B] hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#FEF3C7] flex items-center justify-center flex-shrink-0">
                  <UserCheck className="w-6 h-6 text-[#F59E0B]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#0F172A]">Pending User Approvals</p>
                  <p className="text-xs text-[#64748B]">
                    Review and approve new registration requests
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-[#B45309]">
                  {userSummary?.pendingApproval ?? 0}
                </span>
                <span className="text-sm text-[#B45309]">Pending</span>
                <ChevronRight className="w-5 h-5 text-[#94A3B8] group-hover:text-[#F59E0B] transition-colors" />
              </div>
            </Link>
          )}

          {/* ========== STATS GRID / LOADING / ERROR ========== */}
          {loading ? (
            <div role="status" aria-live="polite" className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-[#06B6D4] animate-spin mb-3" />
              <p className="text-sm text-[#64748B]">Loading dashboard…</p>
            </div>
          ) : error ? (
            <div role="alert" className="flex flex-col items-center justify-center py-16 text-center">
              <AlertCircle className="w-8 h-8 text-[#EF4444] mb-3" />
              <p className="text-sm font-semibold text-[#1E293B] mb-1">Couldn&apos;t load your dashboard</p>
              <p className="text-sm text-[#64748B] mb-4">Something went wrong while fetching your summary.</p>
              <Button variant="secondary" onClick={loadDashboard} leftIcon={<RefreshCw className="w-4 h-4" />}>
                Retry
              </Button>
            </div>
          ) : !isEmpty ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <StatCard title="Projects" value={formatStat(projects)} icon={FolderKanban} color="blue" />
              <StatCard title="Active Projects" value={formatStat(active)} icon={ListChecks} color="emerald" />
              <StatCard title="Test Cases" value={formatStat(testCases)} icon={ClipboardCheck} color="purple" />
              <StatCard title="Bugs" value={formatStat(bugs)} icon={Bug} color="amber" />
            </div>
          ) : null}

          {/* ========== EMPTY STATE (centralized) — shown instead of zero-stat cards ========== */}
          {!loading && !error && isEmpty && (
            <EmptyDashboard
              actionNode={
                <Link
                  href="/projects"
                  prefetch={false}
                  className="inline-flex items-center justify-center h-10 px-5 rounded-xl bg-[#06B6D4] hover:bg-[#0891B2] text-white text-sm font-semibold transition-colors"
                >
                  Create Your First Project
                </Link>
              }
            />
          )}

          {/* ========== QUICK ACTIONS ========== */}
          <div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <QuickActionCard
                icon={ClipboardCheck}
                iconColor="blue"
                title="Generate Test Cases"
                description="Create comprehensive test cases from requirements"
                href="/test-cases"
              />
              <QuickActionCard
                icon={SearchCheck}
                iconColor="purple"
                title="Analyze Requirements"
                description="Find gaps and missing requirements in your PRD"
                href="/gap-analysis"
              />
              <QuickActionCard
                icon={Globe}
                iconColor="emerald"
                title="API Test Generator"
                description="Generate API test cases from endpoints"
                href="/api-tests"
              />
            </div>
          </div>
        </div>
      </PageContainer>
    </AppShell>
  );
}

function QuickActionCard({
  icon: Icon,
  iconColor,
  title,
  description,
  href,
}: {
  icon: any;
  iconColor: string;
  title: string;
  description: string;
  href: string;
}) {
  const iconColors = {
    blue: 'text-[#3B82F6]',
    purple: 'text-[#8B5CF6]',
    emerald: 'text-[#10B981]',
  };

  const bgColors = {
    blue: 'bg-[#EFF6FF]',
    purple: 'bg-[#F3E8FF]',
    emerald: 'bg-[#ECFDF5]',
  };

  const borderColors = {
    blue: 'border-[#DBEAFE] hover:border-[#3B82F6]',
    purple: 'border-[#E9D5FF] hover:border-[#8B5CF6]',
    emerald: 'border-[#D1FAE5] hover:border-[#10B981]',
  };

  return (
    <Link
      href={href}
      className={`group block p-6 flex flex-col bg-white border-2 rounded-xl ${borderColors[iconColor as keyof typeof borderColors]} transition-all duration-300 hover:scale-[1.02] hover:shadow-lg min-h-[180px]`}
    >
      <div className={`w-14 h-14 rounded-xl ${bgColors[iconColor as keyof typeof bgColors]} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform flex-shrink-0`}>
        <Icon className={`w-7 h-7 ${iconColors[iconColor as keyof typeof iconColors]}`} />
      </div>
      <h3 className="text-base font-semibold text-[#0F172A] mb-2">{title}</h3>
      <p className="text-sm text-[#64748B] leading-relaxed">{description}</p>
    </Link>
  );
}
