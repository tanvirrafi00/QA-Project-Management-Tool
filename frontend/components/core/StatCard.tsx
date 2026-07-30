import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import { formatStat, safeString } from '@/lib/safe-value';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  icon: LucideIcon;
  color: 'cyan' | 'blue' | 'emerald' | 'amber' | 'purple';
}

const colorStyles = {
  cyan: {
    background: 'bg-[#ECFEFF]',
    border: 'border-[#CFFAFE]',
    iconBg: 'bg-[#06B6D4]',
    iconColor: 'text-white',
    textColor: 'text-[#0E7490]',
  },
  blue: {
    background: 'bg-[#EFF6FF]',
    border: 'border-[#DBEAFE]',
    iconBg: 'bg-[#3B82F6]',
    iconColor: 'text-white',
    textColor: 'text-[#1E40AF]',
  },
  emerald: {
    background: 'bg-[#ECFDF5]',
    border: 'border-[#D1FAE5]',
    iconBg: 'bg-[#10B981]',
    iconColor: 'text-white',
    textColor: 'text-[#065F46]',
  },
  amber: {
    background: 'bg-[#FEF3C7]',
    border: 'border-[#FDE68A]',
    iconBg: 'bg-[#F59E0B]',
    iconColor: 'text-white',
    textColor: 'text-[#B45309]',
  },
  purple: {
    background: 'bg-[#F3E8FF]',
    border: 'border-[#E9D5FF]',
    iconBg: 'bg-[#8B5CF6]',
    iconColor: 'text-white',
    textColor: 'text-[#6D28D9]',
  },
};

export function StatCard({ title, value, change, icon: Icon, color }: StatCardProps) {
  const styles = colorStyles[color];

  return (
    <div
      className={cn(
        'bg-white border rounded-2xl p-6 hover:scale-[1.02] transition-all duration-300 shadow-sm hover:shadow-md',
        styles.background,
        styles.border
      )}
    >
      {/* Top row with icon and percentage badge */}
      <div className="flex items-center justify-between mb-4">
        <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', styles.iconBg)}>
          <Icon className={cn('w-6 h-6', styles.iconColor)} />
        </div>
        {change && (
          <span className={cn('text-sm font-semibold', styles.textColor)}>
            {safeString(change)}
          </span>
        )}
      </div>

      {/* Main value — guarded so undefined/NaN/null never render */}
      <div className="text-[32px] font-bold text-[#0F172A] mb-2">{formatStat(value)}</div>

      {/* Title label */}
      <div className="text-sm text-[#64748B]">{title}</div>
    </div>
  );
}
