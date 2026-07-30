'use client';

/**
 * MultiSelect - a portal-based multi-value dropdown (checkboxes + Select All / Clear).
 *
 * Mirrors `CustomSelect`'s portal/fixed-panel approach so `overflow-hidden` / `overflow-y-auto`
 * ancestors (AppShell main, cards, the form panels) can never clip it. Used for the generator's
 * test-types selector (and any future multi-value field).
 */

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface MultiSelectOption {
    value: string;
    label: string;
    icon?: React.ReactNode;
}

interface MultiSelectProps {
    options: MultiSelectOption[];
    value: string[];
    onChange: (next: string[]) => void;
    placeholder?: string;
    accentColor?: string;
    height?: number;
}

const PANEL_MAX_HEIGHT = 300;
const PANEL_GAP = 6;

export function MultiSelect({
    options,
    value,
    onChange,
    placeholder = 'Select...',
    accentColor = '#06B6D4',
    height = 44,
}: MultiSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [mounted, setMounted] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

    const selectedSet = new Set(value);
    const allSelected = options.length > 0 && options.every((o) => selectedSet.has(o.value));

    // Portal target only exists in the browser — set a mounted flag so createPortal is skipped
    // during SSR. Standard portal-SSR pattern (mirrors CustomSelect); the set-state-in-effect rule's
    // cascading-render concern does not apply to a one-time mount flag.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMounted(true);
    }, []);

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
            maxHeight: Math.min(PANEL_MAX_HEIGHT, (placeAbove ? spaceAbove : spaceBelow) - PANEL_GAP),
            overflowY: 'auto',
        };
        if (placeAbove) {
            style.bottom = window.innerHeight - rect.top + PANEL_GAP;
        } else {
            style.top = rect.bottom + PANEL_GAP;
        }
        setPanelStyle(style);
    }, []);

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

    const toggle = (val: string) => {
        onChange(selectedSet.has(val) ? value.filter((v) => v !== val) : [...value, val]);
    };

    const selectAll = () => onChange(options.map((o) => o.value));
    const clearAll = () => onChange([]);

    const triggerLabel =
        value.length === 0
            ? placeholder
            : allSelected
              ? `All (${value.length})`
              : `${value.length} selected`;

    return (
        <div style={{ position: 'relative', width: '100%' }}>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setIsOpen((o) => !o)}
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
                    color: value.length > 0 ? '#0F172A' : '#94A3B8',
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
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {triggerLabel}
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

            {isOpen && mounted && createPortal(
                <div
                    ref={panelRef}
                    style={{
                        background: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: '12px',
                        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.12), 0 8px 10px -6px rgba(0,0,0,0.08)',
                        overflow: 'hidden',
                        ...panelStyle,
                    }}
                >
                    {/* Select All / Clear header */}
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            borderBottom: '1px solid #F1F5F9',
                            background: '#F9FAFB',
                            gap: '8px',
                        }}
                    >
                        <button
                            type="button"
                            onClick={selectAll}
                            style={{
                                border: 'none',
                                background: 'transparent',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: 600,
                                color: accentColor,
                                fontFamily: 'inherit',
                            }}
                        >
                            Select All
                        </button>
                        <button
                            type="button"
                            onClick={clearAll}
                            style={{
                                border: 'none',
                                background: 'transparent',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: 600,
                                color: '#64748B',
                                fontFamily: 'inherit',
                            }}
                        >
                            Clear
                        </button>
                    </div>

                    {options.map((option) => {
                        const isSelected = selectedSet.has(option.value);
                        return (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => toggle(option.value)}
                                style={{
                                    width: '100%',
                                    padding: '9px 14px',
                                    background: isSelected ? `${accentColor}0D` : 'transparent',
                                    border: 'none',
                                    borderBottom: '1px solid #F1F5F9',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    fontSize: '14px',
                                    fontWeight: isSelected ? 600 : 500,
                                    color: isSelected ? accentColor : '#334155',
                                    fontFamily: 'inherit',
                                    textAlign: 'left',
                                }}
                            >
                                <span
                                    style={{
                                        width: '18px',
                                        height: '18px',
                                        borderRadius: '4px',
                                        border: isSelected ? 'none' : '2px solid #CBD5E1',
                                        background: isSelected ? accentColor : 'transparent',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                    }}
                                >
                                    {isSelected && <Check style={{ width: '14px', height: '14px', color: '#FFFFFF' }} />}
                                </span>
                                {option.icon}
                                <span>{option.label}</span>
                            </button>
                        );
                    })}
                </div>,
                document.body,
            )}
        </div>
    );
}
