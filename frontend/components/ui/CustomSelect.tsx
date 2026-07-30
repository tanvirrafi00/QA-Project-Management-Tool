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
        <div style={{ position: 'relative', width: '100%' }}>
            {/* Trigger Button */}
            <button
                ref={triggerRef}
                type="button"
                onClick={() => { setQuery(''); setIsOpen(o => !o); }}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                style={{
                    width: '100%',
                    height: `${height}px`,
                    background: '#FFFFFF',
                    border: `2px solid ${isOpen || isFocused ? accentColor : '#E2E8F0'}`,
                    borderRadius: '10px',
                    padding: '0 12px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: selectedOption ? '#0F172A' : '#94A3B8',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                    cursor: 'pointer',
                    outline: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    transition: 'all 0.2s ease',
                    boxShadow: isOpen || isFocused ? `0 0 0 3px ${accentColor}1A` : 'none',
                }}
            >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedOption?.icon}
                    {selectedOption?.label || placeholder}
                </span>
                <ChevronDown
                    style={{
                        width: '16px',
                        height: '16px',
                        color: '#64748B',
                        flexShrink: 0,
                        transition: 'transform 0.2s ease',
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                />
            </button>

            {/* Dropdown panel — portaled to body so it is never clipped. */}
            {isOpen && mounted && createPortal(
                <div
                    ref={panelRef}
                    style={{
                        background: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: '12px',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
                        overflow: 'hidden',
                        animation: 'dropdownFadeIn 0.15s ease-out',
                        ...panelStyle,
                    }}
                >
                    {searchable && (
                        <div style={{ padding: '8px', borderBottom: '1px solid #F1F5F9', position: 'sticky', top: 0, background: '#FFFFFF', zIndex: 1 }}>
                            <input
                                ref={searchRef}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search…"
                                style={{
                                    width: '100%',
                                    height: '32px',
                                    padding: '0 10px',
                                    borderRadius: '8px',
                                    border: '1px solid #E2E8F0',
                                    fontSize: '13px',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                    fontFamily: 'inherit',
                                }}
                            />
                        </div>
                    )}
                    {visibleOptions.length === 0 ? (
                        <div style={{ padding: '16px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>No matches</div>
                    ) : visibleOptions.map((option, index) => {
                        const isSelected = option.value === value;
                        return (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => handleSelect(option.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px 14px',
                                    background: isSelected ? `${accentColor}0D` : 'transparent',
                                    border: 'none',
                                    borderBottom: index < options.length - 1 ? '1px solid #F1F5F9' : 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '8px',
                                    fontSize: '14px',
                                    fontWeight: isSelected ? '600' : '500',
                                    color: isSelected ? accentColor : '#334155',
                                    fontFamily: 'inherit',
                                    transition: 'background 0.1s ease',
                                    textAlign: 'left',
                                }}
                                onMouseEnter={(e) => {
                                    if (!isSelected) e.currentTarget.style.background = '#F9FAFB';
                                }}
                                onMouseLeave={(e) => {
                                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                                }}
                            >
                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {option.icon}
                                    {option.label}
                                </span>
                                {isSelected && (
                                    <Check style={{ width: '16px', height: '16px', color: accentColor, flexShrink: 0 }} />
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
