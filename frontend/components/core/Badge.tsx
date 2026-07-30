import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'md';
  children: React.ReactNode;
}

const sizeStyles = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
};

const variantStyles = {
  default: 'bg-slate-500/10 text-slate-400 border border-slate-500/20',
  primary: 'bg-cyan-500/10 text-cyan-600 border border-cyan-500/20',
  success: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  error: 'bg-red-500/10 text-red-400 border border-red-500/20',
  info: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = 'default', size = 'md', children }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center font-medium rounded-md',
          sizeStyles[size],
          variantStyles[variant]
        )}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

// Priority Badge (specific for test cases)
interface PriorityBadgeProps {
  priority: 'critical' | 'high' | 'medium' | 'low';
}

const priorityStyles = {
  critical: 'bg-red-500/10 text-red-400 border border-red-500/20',
  high: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
  medium: 'bg-slate-500/10 text-slate-400 border border-slate-500/20',
  low: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
};

export const PriorityBadge = ({ priority }: PriorityBadgeProps) => {
  return (
    <span className={cn('px-2 py-0.5 text-xs font-medium rounded-md', priorityStyles[priority])}>
      {priority}
    </span>
  );
};
