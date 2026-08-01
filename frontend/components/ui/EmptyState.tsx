'use client';

import { ReactNode } from 'react';
import { Inbox, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/core';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  /** Optional left icon for the CTA button. */
  icon?: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
}

interface EmptyStateProps {
  /** Leading icon/illustration. Defaults to an inbox icon. */
  icon?: LucideIcon;
  /** Headline. Falls back to a generic message. */
  title?: string;
  /** Supporting copy under the title. */
  description?: string;
  /** Optional call-to-action button. */
  action?: EmptyStateAction;
  /** Render a custom node (e.g. a `<Link>`) instead of a button. */
  actionNode?: ReactNode;
  /** Compact vertical padding — use inside cards (tables, charts). */
  compact?: boolean;
  className?: string;
}

/**
 * Generic, reusable empty state. Every module's "no data" UI should funnel
 * through this (directly or via a `components/states/*` preset) so styling,
 * spacing, and the icon/title/description/CTA layout stay consistent.
 *
 * Design tokens: primary cyan `#06B6D4`, slate headings, muted body.
 * See `docs/ui-standards.md` §3–§5.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title = 'No Data Available',
  description = 'Data will appear here once records are created.',
  action,
  actionNode,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-12 px-4' : 'py-20 px-4',
        className,
      )}
    >
      {/* Icon / illustration */}
      <div className="relative mb-6">
        <div className="absolute inset-0 bg-[#06B6D4]/10 blur-3xl rounded-full" />
        <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-[#06B6D4]/10 to-[#3B82F6]/10 border border-[#06B6D4]/20 flex items-center justify-center">
          <Icon className="w-8 h-8 text-[#06B6D4]" />
        </div>
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-[#1E293B] mb-2">
        {title}
      </h3>

      {/* Description */}
      <p className="text-xs text-[#64748B] max-w-sm leading-relaxed">
        {description}
      </p>

      {/* CTA */}
      {(action || actionNode) && (
        <div className="mt-6">
          {actionNode ? (
            actionNode
          ) : action ? (
            <Button
              variant={action.variant ?? 'primary'}
              size="sm"
              onClick={action.onClick}
              leftIcon={action.icon}
            >
              {action.label}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
