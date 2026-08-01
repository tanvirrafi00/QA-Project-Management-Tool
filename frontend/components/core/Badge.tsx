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
  default: 'bg-[#E2E8F0]/20 text-[#64748B] border border-[#E2E8F0]',
  primary: 'bg-[#06B6D4]/10 text-[#06B6D4] border border-[#06B6D4]/30',
  success: 'bg-[#22C55E]/10 text-[#16A34A] border border-[#22C55E]/30',
  warning: 'bg-[#F59E0B]/10 text-[#D97706] border border-[#F59E0B]/30',
  error: 'bg-[#EF4444]/10 text-[#DC2626] border border-[#EF4444]/30',
  info: 'bg-[#3B82F6]/10 text-[#2563EB] border border-[#3B82F6]/30',
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
  critical: 'bg-[#EF4444]/10 text-[#DC2626] border border-[#EF4444]/30',
  high: 'bg-[#F59E0B]/10 text-[#D97706] border border-[#F59E0B]/30',
  medium: 'bg-[#64748B]/10 text-[#475569] border border-[#64748B]/30',
  low: 'bg-[#22C55E]/10 text-[#16A34A] border border-[#22C55E]/30',
};

export const PriorityBadge = ({ priority }: PriorityBadgeProps) => {
  return (
    <span className={cn('px-2 py-0.5 text-xs font-medium rounded-md', priorityStyles[priority])}>
      {priority}
    </span>
  );
};
