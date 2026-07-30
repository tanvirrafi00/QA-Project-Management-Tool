'use client';

/**
 * InlineSelectCell — an inline-editable dropdown cell for the Bug List table.
 *
 * Wraps the shared portal-based `CustomSelect`. The wrapper stops click/mousedown propagation so
 * interacting with the dropdown never triggers the row's navigate-to-details onClick. While a save is
 * in flight (`loading`), the control is dimmed and blocked with a spinner overlay.
 *
 * Read-only rendering (role-gated fields) is handled by the caller — it renders the existing badge/text
 * instead of this cell. This cell is only mounted for fields the user may edit.
 */

import { Loader2 } from 'lucide-react';
import { CustomSelect, type SelectOption } from '@/components/ui/CustomSelect';

interface InlineSelectCellProps {
    value: string;
    options: SelectOption[];
    onChange: (value: string) => void;
    accentColor?: string;
    loading?: boolean;
    searchable?: boolean;
    placeholder?: string;
}

export function InlineSelectCell({
    value,
    options,
    onChange,
    accentColor,
    loading = false,
    searchable = false,
    placeholder = 'Select...',
}: InlineSelectCellProps) {
    const stop = (e: React.SyntheticEvent) => e.stopPropagation();

    return (
        <div style={{ position: 'relative', minWidth: 120 }} onMouseDown={stop} onClick={stop}>
            {loading && (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 3,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(255,255,255,0.65)',
                        borderRadius: 10,
                    }}
                >
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#06B6D4]" />
                </div>
            )}
            <div style={{ pointerEvents: loading ? 'none' : 'auto', opacity: loading ? 0.6 : 1 }}>
                <CustomSelect
                    options={options}
                    value={value}
                    onChange={onChange}
                    accentColor={accentColor}
                    searchable={searchable}
                    placeholder={placeholder}
                    height={34}
                />
            </div>
        </div>
    );
}
