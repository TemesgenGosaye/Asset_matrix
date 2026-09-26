import { describe, it, expect } from "vitest";
import {
  PERMISSIONS,
  userHasPermission,
  userCanEditUser,
  userCanDeleteUser,
} from "@/lib/permissions";

const adminUser = { id: "admin-1", isAdmin: true, canRequest: false };
const regularUser = { id: "user-1", isAdmin: false, canRequest: false };
const requesterUser = { id: "user-2", isAdmin: false, canRequest: true };
const minimalUser = {};

describe("userHasPermission", () => {
  describe("null / undefined user", () => {
    it("returns false for null user", () => {
      expect(userHasPermission(null, PERMISSIONS.ASSET_VIEW)).toBe(false);
    });

    it("returns false for undefined user", () => {
      expect(userHasPermission(undefined, PERMISSIONS.ASSET_VIEW)).toBe(false);
    });
  });

  describe("admin user bypasses all permission checks", () => {
    const allPermissions = Object.values(PERMISSIONS);

    it.each(allPermissions)("admin has permission: %s", (permission) => {
      expect(userHasPermission(adminUser, permission)).toBe(true);
    });
  });

  describe("view permissions - any authenticated user", () => {
    const viewPermissions = [
      PERMISSIONS.ASSET_VIEW,
      PERMISSIONS.USER_VIEW,
      PERMISSIONS.ACCESSORY_VIEW,
      PERMISSIONS.LICENSE_VIEW,
      PERMISSIONS.SETTINGS_VIEW,
    ];

    it.each(viewPermissions)(
      "regular user has view permission: %s",
      (permission) => {
        expect(userHasPermission(regularUser, permission)).toBe(true);
      },
    );
  });

  describe("request permissions - require canRequest", () => {
    it("user with canRequest=true can request accessories", () => {
      expect(
        userHasPermission(requesterUser, PERMISSIONS.ACCESSORY_REQUEST),
      ).toBe(true);
    });

    it("user with canRequest=false cannot request accessories", () => {
      expect(
        userHasPermission(regularUser, PERMISSIONS.ACCESSORY_REQUEST),
      ).toBe(false);
    });
  });

  describe("admin-only permissions - denied for non-admin users", () => {
    const adminOnlyPermissions = [
      PERMISSIONS.ASSET_CREATE,
      PERMISSIONS.ASSET_EDIT,
      PERMISSIONS.ASSET_DELETE,
      PERMISSIONS.ASSET_ASSIGN,
      PERMISSIONS.USER_CREATE,
      PERMISSIONS.USER_DELETE,
      PERMISSIONS.ACCESSORY_CREATE,
      PERMISSIONS.ACCESSORY_EDIT,
      PERMISSIONS.ACCESSORY_DELETE,
      PERMISSIONS.LICENSE_CREATE,
      PERMISSIONS.LICENSE_EDIT,
      PERMISSIONS.LICENSE_DELETE,
      PERMISSIONS.SETTINGS_EDIT,
      PERMISSIONS.CATALOG_MANAGE,
    ];

    it.each(adminOnlyPermissions)(
      "regular user is denied permission: %s",
      (permission) => {
        expect(userHasPermission(regularUser, permission)).toBe(false);
      },
    );
  });
});

describe("userCanEditUser", () => {
  it("returns false for null user", () => {
    expect(userCanEditUser(null, "target-1")).toBe(false);
  });

  it("returns false for undefined user", () => {
    expect(userCanEditUser(undefined, "target-1")).toBe(false);
  });

  it("admin can edit anyone", () => {
    expect(userCanEditUser(adminUser, "other-user-id")).toBe(true);
    expect(userCanEditUser(adminUser, adminUser.id)).toBe(true);
  });

  it("regular user can edit themselves", () => {
    expect(userCanEditUser(regularUser, regularUser.id)).toBe(true);
  });

  it("regular user cannot edit another user", () => {
    expect(userCanEditUser(regularUser, "someone-else")).toBe(false);
  });
});

describe("userCanDeleteUser", () => {
  it("returns false for null user", () => {
    expect(userCanDeleteUser(null, "target-1")).toBe(false);
  });

  it("returns false for undefined user", () => {
    expect(userCanDeleteUser(undefined, "target-1")).toBe(false);
  });

  it("admin can delete another user", () => {
    expect(userCanDeleteUser(adminUser, "other-user-id")).toBe(true);
    expect(userCanDeleteUser(adminUser, regularUser.id)).toBe(true);
  });

  it("admin cannot delete themselves", () => {
    expect(userCanDeleteUser(adminUser, adminUser.id)).toBe(false);
  });

  it("non-admin cannot delete anyone", () => {
    expect(userCanDeleteUser(regularUser, "other-user-id")).toBe(false);
    expect(userCanDeleteUser(regularUser, regularUser.id)).toBe(false);
  });
});
