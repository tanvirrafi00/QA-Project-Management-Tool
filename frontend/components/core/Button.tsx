import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const sizeStyles = {
  sm: 'h-10 px-4 text-sm gap-2',
  md: 'h-12 px-5 text-base gap-2.5',
  lg: 'h-14 px-6 text-lg gap-3',
};

const variantStyles = {
  primary: 'bg-[#06B6D4] text-white hover:bg-[#0891B2] hover:shadow-md hover:shadow-cyan-500/20 hover:-translate-y-0.5 active:translate-y-0 border-2 border-[#06B6D4]',
  secondary: 'bg-white text-[#0F172A] border-2 border-[#E2E8F0] hover:border-[#06B6D4] hover:text-[#06B6D4] hover:bg-[#ECFEFF]',
  ghost: 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9]',
  danger: 'bg-[#FEF2F2] text-[#DC2626] border-2 border-[#FECACA] hover:bg-[#FEE2E2]',
  success: 'bg-[#22C55E] text-white hover:bg-[#16A34A] hover:shadow-md hover:shadow-green-500/20 hover:-translate-y-0.5 active:translate-y-0 border-2 border-[#22C55E]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({
    variant = 'primary',
    size = 'md',
    isLoading = false,
    leftIcon,
    rightIcon,
    disabled,
    className,
    children,
    ...props
  }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          // Base styles
          'inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-200 flex-shrink-0',
          // Disabled states
          'disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0',
          // Size variants
          sizeStyles[size],
          // Color variants
          variantStyles[variant],
          className
        )}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
        ) : leftIcon ? (
          <span className="flex-shrink-0">{leftIcon}</span>
        ) : null}
        <span className="truncate">{children}</span>
        {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
