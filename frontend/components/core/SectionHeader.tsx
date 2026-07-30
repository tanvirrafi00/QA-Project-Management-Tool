import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function SectionHeader({ title, description, actions, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between gap-4 mb-10', className)}>
      <div className="min-w-0 flex-1">
        <h1 className="text-[28px] font-semibold text-[#0F172A] tracking-tight leading-tight">{title}</h1>
        {description && <p className="text-[14px] text-[#64748B] mt-2">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-3 flex-shrink-0">{actions}</div>}
    </div>
  );
}

interface SubHeaderProps {
  title: string;
  icon?: ReactNode;
  className?: string;
}

export function SubHeader({ title, icon, className }: SubHeaderProps) {
  return (
    <h2 className={cn('text-[15px] font-medium text-[#0F172A] flex items-center gap-2.5', className)}>
      {icon}
      {title}
    </h2>
  );
}
