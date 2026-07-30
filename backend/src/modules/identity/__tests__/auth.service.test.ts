/**
 * Auth-service registration tests.
 *
 * Pins the re-registration rule: a merely-`rejected` account may be re-registered (it is revived to
 * `pending_approval` on the same row), while any other live status still holds the email → conflict.
 * The repository + hashPassword are mocked, so this validates service orchestration only.
 */

import { hashPassword } from "../../../shared/auth";
import { ConflictError } from "../../../shared/errors";
import userRepository from "../repositories/user.repository";
import type { UserRow } from "../repositories/user.repository";
import { authService } from "../services/auth.service";

jest.mock("../../../shared/auth", () => ({
    __esModule: true,
    hashPassword: jest.fn(),
    hashToken: jest.fn(),
    signAccess: jest.fn(),
    signRefresh: jest.fn(),
    verifyPassword: jest.fn(),
    verifyRefresh: jest.fn(),
    REFRESH_TTL_MS: 1000,
}));

jest.mock("../repositories/user.repository", () => ({
    __esModule: true,
    default: {
        findByEmail: jest.fn(),
        reRegisterRejected: jest.fn(),
        create: jest.fn(),
        findById: jest.fn(),
        touchLastLogin: jest.fn(),
    },
}));

jest.mock("../repositories/refresh-token.repository", () => ({
    __esModule: true,
    default: { create: jest.fn(), findActiveByHash: jest.fn(), revokeByHash: jest.fn() },
}));

const repo = userRepository as unknown as {
    findByEmail: jest.Mock;
    reRegisterRejected: jest.Mock;
    create: jest.Mock;
};
const mockedHash = hashPassword as jest.Mock;

const input = {
    email: "Jane@Example.com ",
    name: " Jane ",
    password: "Password1",
    role: "qa_engineer" as const,
};

function row(overrides: Partial<UserRow> = {}): UserRow {
    return {
        id: "u-1",
        email: "jane@example.com",
        name: "Jane",
        role: "qa_engineer",
        status: "pending_approval",
        passwordHash: "hash",
        rejectionReason: null,
        requestedRole: "qa_engineer",
        lastLoginAt: null,
        createdBy: null,
        updatedBy: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        version: 1,
        deletedAt: null,
        ...overrides,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe("authService.register", () => {
    it("creates a fresh pending_approval account when the email is free", async () => {
        repo.findByEmail.mockResolvedValue(undefined);
        mockedHash.mockResolvedValue("hash-new");
        repo.create.mockResolvedValue(row({ status: "pending_approval" }));

        const user = await authService.register(input);

        expect(mockedHash).toHaveBeenCalledWith("Password1");
        expect(repo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                email: "jane@example.com", // lowercased + trimmed
                name: "Jane", // trimmed
                role: "qa_engineer",
                requestedRole: "qa_engineer",
                status: "pending_approval",
                passwordHash: "hash-new",
            }),
        );
        expect(repo.reRegisterRejected).not.toHaveBeenCalled();
        expect(user.status).toBe("pending_approval");
    });

    it.each(["active", "pending_approval", "suspended"])(
        "throws ConflictError when a %s account already holds the email",
        async (status) => {
            repo.findByEmail.mockResolvedValue(row({ status: status as UserRow["status"] }));
            await expect(authService.register(input)).rejects.toBeInstanceOf(ConflictError);
            expect(repo.create).not.toHaveBeenCalled();
            expect(repo.reRegisterRejected).not.toHaveBeenCalled();
        },
    );

    it("revives a rejected account to pending_approval on re-registration (same row, fresh credentials)", async () => {
        const existing = row({ id: "u-rejected", status: "rejected", rejectionReason: "nope" });
        repo.findByEmail.mockResolvedValue(existing);
        mockedHash.mockResolvedValue("hash-new");
        const revived = row({ id: "u-rejected", status: "pending_approval", rejectionReason: null });
        repo.reRegisterRejected.mockResolvedValue(revived);

        const user = await authService.register(input);

        expect(repo.reRegisterRejected).toHaveBeenCalledWith("u-rejected", {
            name: "Jane",
            passwordHash: "hash-new",
            requestedRole: "qa_engineer",
        });
        expect(repo.create).not.toHaveBeenCalled();
        expect(user.id).toBe("u-rejected");
        expect(user.status).toBe("pending_approval");
    });

    it("maps a concurrent change (revive affects no row) to ConflictError", async () => {
        repo.findByEmail.mockResolvedValue(row({ status: "rejected" }));
        mockedHash.mockResolvedValue("hash-new");
        repo.reRegisterRejected.mockResolvedValue(undefined);
        await expect(authService.register(input)).rejects.toBeInstanceOf(ConflictError);
    });
});
