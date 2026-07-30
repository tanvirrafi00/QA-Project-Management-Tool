'use client';

import { useRef, useEffect, useCallback, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface AutoResizeTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    /** Minimum number of visible rows (sets the floor height) */
    minRows?: number;
    /** Maximum number of visible rows before scrolling kicks in */
    maxRows?: number;
}

/**
 * A textarea that automatically grows with its content up to `maxRows`,
 * then switches to a polished custom scrollbar.
 *
 * All standard textarea props (value, onChange, placeholder, className, etc.)
 * are passed through, so existing delete/clear/edit functionality is preserved.
 */
export function AutoResizeTextarea({
    minRows = 2,
    maxRows = 12,
    className,
    value,
    onChange,
    ...props
}: AutoResizeTextareaProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const resize = useCallback(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        // Reset height to auto so scrollHeight reflects the natural content height
        textarea.style.height = 'auto';

        const computed = window.getComputedStyle(textarea);
        const lineHeight = parseFloat(computed.lineHeight) || 20;
        const paddingTop = parseFloat(computed.paddingTop) || 0;
        const paddingBottom = parseFloat(computed.paddingBottom) || 0;
        const padding = paddingTop + paddingBottom;

        const minHeight = lineHeight * minRows + padding;
        const maxHeight = lineHeight * maxRows + padding;
        const scrollHeight = textarea.scrollHeight;

        const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
        textarea.style.height = `${newHeight}px`;

        // Only show the custom scrollbar when content exceeds max height
        textarea.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
    }, [minRows, maxRows]);

    // Resize whenever the value changes (covers programmatic clears, AI fills, etc.)
    useEffect(() => {
        resize();
    }, [value, resize]);

    // Resize on mount
    useEffect(() => {
        resize();
        // Re-run after fonts/layout settle
        const timer = setTimeout(resize, 100);
        return () => clearTimeout(timer);
    }, [resize]);

    return (
        <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
                onChange?.(e);
                // Defer to next frame so the DOM has the new value
                requestAnimationFrame(resize);
            }}
            className={cn('custom-scrollbar resize-none', className)}
            {...props}
        />
    );
}
