/**
 * User-service state-machine tests.
 *
 * The registration-approval workflow is a strict status machine (see the docstring in user.service.ts).
 * These tests pin the rules so regressions like "a deleted/rejected user can be approved again" cannot
 * return. The repository is mocked, so this validates the *service* orchestration + guards; the actual
 * soft-delete SQL predicate is covered by the curl smoke test against the running app.
 */

import type { AccountStatus, UserRole } from "../../../shared/auth";
import activityLogRepository from "../../../shared/db/repositories/activity-log.repository";
import type { UserRow } from "../repositories/user.repository";
import userRepository from "../repositories/user.repository";
import { userService } from "../services/user.service";
import { ConflictError, NotFoundError, ValidationError } from "../../../shared/errors";

jest.mock("../../../shared/db/repositories/activity-log.repository", () => ({
    __esModule: true,
    default: { log: jest.fn() },
}));

jest.mock("../repositories/user.repository", () => ({
    __esModule: true,
    default: {
        findById: jest.fn(),
        applyApproval: jest.fn(),
        applyRejection: jest.fn(),
        setStatus: jest.fn(),
        deactivate: jest.fn(),
        assignToProject: jest.fn(),
        countActiveAdmins: jest.fn(),
        findByEmail: jest.fn(),
        create: jest.fn(),
        list: jest.fn(),
        listByStatus: jest.fn(),
        update: jest.fn(),
        touchLastLogin: jest.fn(),
        listAccessibleProjectIds: jest.fn(),
        isMemberOf: jest.fn(),
    },
}));

const repo = userRepository as unknown as {
    findById: jest.Mock;
    applyApproval: jest.Mock;
    applyRejection: jest.Mock;
    setStatus: jest.Mock;
    deactivate: jest.Mock;
    assignToProject: jest.Mock;
    countActiveAdmins: jest.Mock;
};
const activityLog = activityLogRepository as unknown as { log: jest.Mock };

const ACTOR = "actor-1";

function row(overrides: Partial<UserRow> = {}): UserRow {
    return {
        id: "user-1",
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

describe("userService.approve", () => {
    it("throws NotFoundError when the user does not exist (covers soft-deleted users)", async () => {
        repo.findById.mockResolvedValue(undefined);
        await expect(
            userService.approve("user-1", { role: "qa_engineer" }, ACTOR),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(repo.applyApproval).not.toHaveBeenCalled();
    });

    it.each<[string, AccountStatus]>([
        ["rejected", "rejected"],
        ["active", "active"],
        ["suspended", "suspended"],
        ["disabled", "disabled"],
    ])("throws ConflictError for a %s user (rejection is terminal; only pending_approval is approvable)", async (__, status) => {
        repo.findById.mockResolvedValue(row({ status }));
        await expect(
            userService.approve("user-1", { role: "qa_engineer" }, ACTOR),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(repo.applyApproval).not.toHaveBeenCalled();
    });

    it("throws ValidationError when the requested role is admin", async () => {
        repo.findById.mockResolvedValue(row());
        await expect(
            userService.approve("user-1", { role: "admin" as UserRole }, ACTOR),
        ).rejects.toBeInstanceOf(ValidationError);
    });

    it("approves a pending user, assigns projects, clears rejection, and writes an audit entry", async () => {
        const existing = row({ status: "pending_approval", requestedRole: "qa_lead" });
        repo.findById.mockResolvedValue(existing);
        const approved = row({ status: "active", role: "qa_lead", rejectionReason: null, version: 2 });
        repo.applyApproval.mockResolvedValue(approved);
        repo.assignToProject.mockResolvedValue(undefined);
        activityLog.log.mockResolvedValue(undefined);

        const result = await userService.approve(
            "user-1",
            { role: "qa_lead", projectIds: ["p-1", "p-2"], notes: "ok" },
            ACTOR,
        );

        expect(repo.applyApproval).toHaveBeenCalledWith("user-1", "qa_lead", ACTOR);
        expect(repo.assignToProject).toHaveBeenCalledTimes(2);
        expect(repo.assignToProject).toHaveBeenNthCalledWith(1, "user-1", "p-1", "qa_lead", ACTOR);
        expect(activityLog.log).toHaveBeenCalledWith(
            expect.objectContaining({ action: "user.approve", entityId: "user-1" }),
        );
        expect(result.status).toBe("active");
    });

    it("maps a concurrent change (applyApproval affects no row) to a ConflictError", async () => {
        repo.findById.mockResolvedValue(row());
        repo.applyApproval.mockResolvedValue(undefined);
        await expect(
            userService.approve("user-1", { role: "qa_engineer" }, ACTOR),
        ).rejects.toBeInstanceOf(ConflictError);
    });
});

describe("userService.reject", () => {
    it("throws NotFoundError when the user does not exist", async () => {
        repo.findById.mockResolvedValue(undefined);
        await expect(
            userService.reject("user-1", { reason: "nope" }, ACTOR),
        ).rejects.toBeInstanceOf(NotFoundError);
    });

    it.each<[string, AccountStatus]>([
        ["active", "active"],
        ["suspended", "suspended"],
        ["already rejected", "rejected"],
    ])("throws ConflictError for a %s user", async (__, status) => {
        repo.findById.mockResolvedValue(row({ status }));
        await expect(
            userService.reject("user-1", { reason: "x" }, ACTOR),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(repo.applyRejection).not.toHaveBeenCalled();
    });

    it("rejects a pending user, stores a trimmed reason, and writes an audit entry", async () => {
        repo.findById.mockResolvedValue(row({ status: "pending_approval" }));
        repo.applyRejection.mockResolvedValue(row({ status: "rejected", rejectionReason: "bad fit" }));
        await userService.reject("user-1", { reason: "  bad fit  " }, ACTOR);
        expect(repo.applyRejection).toHaveBeenCalledWith("user-1", "bad fit", ACTOR);
        expect(activityLog.log).toHaveBeenCalledWith(
            expect.objectContaining({ action: "user.reject" }),
        );
    });
});

describe("userService.suspend", () => {
    it("throws NotFoundError when the user does not exist", async () => {
        repo.findById.mockResolvedValue(undefined);
        await expect(userService.suspend("user-1", ACTOR)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("forbids suspending your own account", async () => {
        repo.findById.mockResolvedValue(row({ id: "self", status: "active" }));
        await expect(userService.suspend("self", "self")).rejects.toBeInstanceOf(ConflictError);
        expect(repo.setStatus).not.toHaveBeenCalled();
    });

    it("forbids suspending the last remaining admin", async () => {
        repo.findById.mockResolvedValue(row({ id: "admin-1", role: "admin", status: "active" }));
        repo.countActiveAdmins.mockResolvedValue(1);
        await expect(userService.suspend("admin-1", ACTOR)).rejects.toBeInstanceOf(ConflictError);
        expect(repo.setStatus).not.toHaveBeenCalled();
    });

    it.each<[string, AccountStatus]>([
        ["pending", "pending_approval"],
        ["suspended", "suspended"],
        ["rejected", "rejected"],
    ])("throws ConflictError for a %s user", async (__, status) => {
        repo.findById.mockResolvedValue(row({ status }));
        await expect(userService.suspend("user-1", ACTOR)).rejects.toBeInstanceOf(ConflictError);
    });

    it("suspends an active user (locked to the active source state)", async () => {
        repo.findById.mockResolvedValue(row({ status: "active" }));
        repo.setStatus.mockResolvedValue(row({ status: "suspended", version: 2 }));
        const result = await userService.suspend("user-1", ACTOR);
        expect(repo.setStatus).toHaveBeenCalledWith("user-1", "suspended", ACTOR, ["active"]);
        expect(result.status).toBe("suspended");
    });
});

describe("userService.activate", () => {
    it("throws ConflictError for a rejected user (must re-register, not be activated)", async () => {
        repo.findById.mockResolvedValue(row({ status: "rejected" }));
        await expect(userService.activate("user-1", ACTOR)).rejects.toBeInstanceOf(ConflictError);
        expect(repo.setStatus).not.toHaveBeenCalled();
    });

    it.each<[string, AccountStatus]>([
        ["pending", "pending_approval"],
        ["active", "active"],
    ])("throws ConflictError for a %s user", async (__, status) => {
        repo.findById.mockResolvedValue(row({ status }));
        await expect(userService.activate("user-1", ACTOR)).rejects.toBeInstanceOf(ConflictError);
    });

    it("reactivates a suspended user (locked to the suspended source state)", async () => {
        repo.findById.mockResolvedValue(row({ status: "suspended" }));
        repo.setStatus.mockResolvedValue(row({ status: "active", version: 2 }));
        const result = await userService.activate("user-1", ACTOR);
        expect(repo.setStatus).toHaveBeenCalledWith("user-1", "active", ACTOR, ["suspended"]);
        expect(result.status).toBe("active");
    });
});

describe("userService.deactivate (delete)", () => {
    it("throws NotFoundError when the user does not exist (a deleted user cannot be deleted again)", async () => {
        repo.findById.mockResolvedValue(undefined);
        await expect(userService.deactivate("user-1", ACTOR)).rejects.toBeInstanceOf(NotFoundError);
        expect(repo.deactivate).not.toHaveBeenCalled();
    });

    it("forbids deleting your own account", async () => {
        repo.findById.mockResolvedValue(row({ id: "self" }));
        await expect(userService.deactivate("self", "self")).rejects.toBeInstanceOf(ConflictError);
    });

    it("forbids deleting the last remaining admin", async () => {
        repo.findById.mockResolvedValue(row({ role: "admin", status: "active" }));
        repo.countActiveAdmins.mockResolvedValue(1);
        await expect(userService.deactivate("user-1", ACTOR)).rejects.toBeInstanceOf(ConflictError);
        expect(repo.deactivate).not.toHaveBeenCalled();
    });

    it("soft-deletes an ordinary live user", async () => {
        repo.findById.mockResolvedValue(row({ status: "rejected" }));
        repo.deactivate.mockResolvedValue(undefined);
        await userService.deactivate("user-1", ACTOR);
        expect(repo.deactivate).toHaveBeenCalledWith("user-1");
    });
});
