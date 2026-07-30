/**
 * HTTP response helpers — the standard API envelope and opt-in pagination.
 *
 * Envelope (Deliverable 4 §4):
 *   success: { success: true,  data, ...meta }
 *   error:   { success: false, error }
 *
 * Pagination is OPT-IN: clients that send `?page` (and/or `?page_size`) get a page slice plus
 * `{ page, page_size, total }`; clients that send neither get the full array (backward compatible).
 *
 * Migration Roadmap Step 4.
 */

import type { Request, Response } from "express";

/** `{ success: true, message, data, meta }` */
export function sendSuccess<T>(
    res: Response,
    data: T,
    meta?: Record<string, unknown>,
    message = "Operation completed successfully"
): Response {
    return res.json({
        success: true,
        message,
        data,
        meta: meta ?? {}
    });
}

/** 201 Created — `{ success: true, message, data, meta }` */
export function sendCreated<T>(
    res: Response,
    data: T,
    meta?: Record<string, unknown>,
    message = "Resource created successfully"
): Response {
    return res.status(201).json({
        success: true,
        message,
        data,
        meta: meta ?? {}
    });
}

/** Standard validation error envelope — `{ success: false, message, errors }`. */
export function sendValidationError(
    res: Response,
    errors: Record<string, string[]> | Record<string, string>,
    message = "Validation failed"
): Response {
    const formattedErrors: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(errors)) {
        formattedErrors[key] = Array.isArray(value) ? value : [value];
    }
    return res.status(400).json({
        success: false,
        message,
        errors: formattedErrors
    });
}

/** Standard error envelope — `{ success: false, message }`. */
export function sendError(res: Response, status: number, message: string): Response {
    return res.status(status).json({ success: false, message });
}

export interface ParsedPagination {
    page: number;
    pageSize: number;
    offset: number;
    /** True only when the client explicitly requested pagination. */
    isPaging: boolean;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

/** Parse `?page` / `?page_size` (also accepts `pageSize`). Unpaged when neither is present. */
export function parsePagination(req: Request): ParsedPagination {
    const rawPage = req.query.page;
    const rawSize = req.query.page_size ?? req.query.pageSize;
    if (rawPage === undefined && rawSize === undefined) {
        return { page: 1, pageSize: DEFAULT_PAGE_SIZE, offset: 0, isPaging: false };
    }
    const page = Math.max(1, parseInt(String(rawPage ?? "1"), 10) || 1);
    const pageSize = Math.min(
        MAX_PAGE_SIZE,
        Math.max(1, parseInt(String(rawSize ?? DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE),
    );
    return { page, pageSize, offset: (page - 1) * pageSize, isPaging: true };
}

/**
 * Slice `items` per the request's pagination params. Returns `{ data, meta }`:
 *   - unpaged → data is the full array, meta = { count }
 *   - paged   → data is the page slice, meta = { count, page, page_size, total }
 */
export function paginate<T>(
    items: T[],
    req: Request,
): { data: T[]; meta: Record<string, unknown> } {
    const p = parsePagination(req);
    if (!p.isPaging) {
        return { data: items, meta: { count: items.length } };
    }
    const data = items.slice(p.offset, p.offset + p.pageSize);
    return { data, meta: { count: data.length, page: p.page, page_size: p.pageSize, total: items.length } };
}
