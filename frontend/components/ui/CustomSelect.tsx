'use client';

/**
 * CustomSelect - A custom, animated dropdown component.
 *
 * The dropdown panel is rendered through a React portal to `document.body` using
 * `position: fixed`. This is essential: many ancestors in this app use
 * `overflow-hidden` / `overflow-y-auto` (the Header, AppShell main, Sidebar,
 * cards), which would otherwise clip an absolutely-positioned panel. Portalling
 * to the top level escapes every clipping ancestor.
 *
 * Features:
 * - Portal-rendered, fixed-position panel (never clipped, always on top)
 * - Auto-flips upward when there is more room above than below
 * - Repositions on scroll (capture, so nested scrollers are covered) and resize
 * - Outside-click and Escape to close
 * - Keyboard accessible
 */

import {
    useState, useRef, useEffect, useCallback, useLayoutEffect,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption {
    value: string;
    label: string;
    icon?: React.ReactNode;
}

interface CustomSelectProps {
    options: SelectOption[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    accentColor?: string;
    height?: number;
    /** When true, renders a filter input at the top of the panel (used for long lists like assignees). */
    searchable?: boolean;
}

const PANEL_MAX_HEIGHT = 280;
const PANEL_GAP = 6;

export function CustomSelect({
    options,
    value,
    onChange,
    placeholder = 'Select...',
    accentColor = '#06B6D4',
    height = 42,
    searchable = false,
}: CustomSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [query, setQuery] = useState('');
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

    const selectedOption = options.find(o => o.value === value);

    const visibleOptions = searchable && query.trim()
        ? options.filter(o => o.label.toLowerCase().includes(query.trim().toLowerCase()))
        : options;

    // Portal target only exists in the browser.
    useEffect(() => { setMounted(true); }, []);

    /**
     * Compute the fixed-panel position from the trigger's viewport rect.
     * Flips above the trigger when there is more room above than below.
     */
    const computePosition = useCallback(() => {
        const trigger = triggerRef.current;
        if (!trigger) return;
        const rect = trigger.getBoundingClientRect();

        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const placeAbove = spaceBelow < PANEL_MAX_HEIGHT && spaceAbove > spaceBelow;

        const style: React.CSSProperties = {
            position: 'fixed',
            left: rect.left,
            width: rect.width,
            zIndex: 9999,
            maxHeight: Math.min(
                PANEL_MAX_HEIGHT,
                (placeAbove ? spaceAbove : spaceBelow) - PANEL_GAP
            ),
            overflowY: 'auto',
        };

        if (placeAbove) {
            // Anchor the panel's bottom edge PANEL_GAP px above the trigger.
            style.bottom = window.innerHeight - rect.top + PANEL_GAP;
        } else {
            style.top = rect.bottom + PANEL_GAP;
        }

        setPanelStyle(style);
    }, []);

    // Position on open and keep it aligned while open (scroll anywhere / resize).
    useLayoutEffect(() => {
        if (!isOpen) return;
        computePosition();
        const reposition = () => computePosition();
        window.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition);
        return () => {
            window.removeEventListener('scroll', reposition, true);
            window.removeEventListener('resize', reposition);
        };
    }, [isOpen, computePosition]);

    // Autofocus the filter input when the panel opens (searchable lists only).
    useEffect(() => {
        if (isOpen && searchable) {
            searchRef.current?.focus();
        }
    }, [isOpen, searchable]);

    // Outside-click & Escape handling. The panel lives in a portal, so both the
    // trigger and the panel must be treated as "inside".
    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            if (triggerRef.current?.contains(target)) return;
            if (panelRef.current?.contains(target)) return;
            setIsOpen(false);
        };
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen]);

    const handleSelect = useCallback((val: string) => {
        onChange(val);
        setIsOpen(false);
    }, [onChange]);

    return (
        <div className="relative w-full">
            {/* Trigger Button */}
            <button
                ref={triggerRef}
                type="button"
                onClick={() => { setQuery(''); setIsOpen(o => !o); }}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                className={cn(
                    'w-full h-10 px-3 rounded-lg bg-white transition-all duration-200 flex items-center justify-between gap-2 outline-none cursor-pointer',
                    'focus:ring-2 focus:ring-offset-2',
                    selectedOption ? 'text-[#0F172A]' : 'text-[#94A3B8]'
                )}
                style={{
                    border: `2px solid ${isOpen || isFocused ? accentColor : '#E2E8F0'}`,
                    boxShadow: isOpen || isFocused ? `0 0 0 3px ${accentColor}1A` : 'none',
                }}
            >
                <span className="flex items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap">
                    {selectedOption?.icon}
                    {selectedOption?.label || placeholder}
                </span>
                <ChevronDown
                    className="w-4 h-4 text-[#64748B] flex-shrink-0 transition-transform duration-200"
                    style={{
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                />
            </button>

            {/* Dropdown panel — portaled to body so it is never clipped. */}
            {isOpen && mounted && createPortal(
                <div
                    ref={panelRef}
                    className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden animate-dropdownFadeIn"
                    style={{
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
                        ...panelStyle,
                    }}
                >
                    {searchable && (
                        <div className="p-2 border-b border-[#F1F5F9] sticky top-0 bg-white z-1">
                            <input
                                ref={searchRef}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search…"
                                className="w-full h-8 px-2.5 rounded-lg border border-[#E2E8F0] text-xs outline-none box-border font-sans"
                            />
                        </div>
                    )}
                    {visibleOptions.length === 0 ? (
                        <div className="p-4 text-center text-[#94A3B8] text-xs">No matches</div>
                    ) : visibleOptions.map((option, index) => {
                        const isSelected = option.value === value;
                        return (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => handleSelect(option.value)}
                                className={cn(
                                    'w-full px-3.5 py-2.5 text-left transition-colors duration-100 flex items-center justify-between gap-2',
                                    'text-sm font-medium outline-none cursor-pointer',
                                    isSelected
                                        ? `bg-[${accentColor}0D] text-[${accentColor}] font-semibold`
                                        : 'text-[#334155] hover:bg-[#F9FAFB]',
                                    index < options.length - 1 ? 'border-b border-[#F1F5F9]' : ''
                                )}
                            >
                                <span className="flex items-center gap-2 min-w-0">
                                    {option.icon}
                                    <span className="truncate" title={option.label}>{option.label}</span>
                                </span>
                                {isSelected && (
                                    <Check className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} />
                                )}
                            </button>
                        );
                    })}
                </div>,
                document.body
            )}
        </div>
    );
}
