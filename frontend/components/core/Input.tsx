import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          // Base styles
          'h-12 w-full px-4 bg-white border-2 border-[#E2E8F0] rounded-xl text-base text-[#0F172A] placeholder:text-[#94A3B8]',
          // Focus state
          'focus:outline-none focus:border-[#06B6D4] focus:ring-4 focus:ring-[#06B6D4]/10 transition-all duration-200',
          // Error state
          error && 'border-[#EF4444]/50 focus:border-[#EF4444] focus:ring-[#EF4444]/10',
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ className, error, style, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          // Base styles
          'w-full p-4 min-h-[120px] bg-white border-2 border-[#E2E8F0] rounded-xl text-base text-[#0F172A] placeholder:text-[#94A3B8]',
          // Focus state
          'focus:outline-none focus:border-[#06B6D4] focus:ring-4 focus:ring-[#06B6D4]/10 transition-all duration-200 resize-none leading-relaxed',
          // Error state
          error && 'border-[#EF4444]/50 focus:border-[#EF4444] focus:ring-[#EF4444]/10',
          className
        )}
        style={style}
        {...props}
      />
    );
  }
);

TextArea.displayName = 'TextArea';

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, required, children, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn('text-sm font-semibold text-[#0F172A] mb-3 block', className)}
        {...props}
      >
        {children}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
    );
  }
);

Label.displayName = 'Label';
