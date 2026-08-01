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
          // Base styles - consistent with form styling
          'w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-sm text-[#1E293B] transition-all',
          // Focus state
          'focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/30 focus:border-[#06B6D4]',
          // Error state
          error && 'border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]/30',
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
          // Base styles - consistent with form styling
          'w-full p-3 min-h-[100px] bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-sm text-[#1E293B] transition-all resize-none',
          // Focus state
          'focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#06B6D4]/30 focus:border-[#06B6D4]',
          // Error state
          error && 'border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]/30',
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
        className={cn('block text-xs font-medium text-[#64748B] mb-1.5', className)}
        {...props}
      >
        {children}
        {required && <span className="text-[#EF4444]">*</span>}
      </label>
    );
  }
);

Label.displayName = 'Label';
