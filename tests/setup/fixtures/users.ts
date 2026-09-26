export const mockAdminUser = {
  userid: "admin-uuid-001",
  id: "admin-uuid-001",
  username: "admin",
  email: "admin@test.com",
  firstname: "Admin",
  lastname: "User",
  isadmin: true,
  isAdmin: true,
  canrequest: true,
  canRequest: true,
  organizationId: "org-uuid-001",
  departmentId: null,
  permissions: [] as string[],
  mfaPending: false,
};

export const mockRegularUser = {
  userid: "user-uuid-001",
  id: "user-uuid-001",
  username: "regular",
  email: "user@test.com",
  firstname: "Regular",
  lastname: "User",
  isadmin: false,
  isAdmin: false,
  canrequest: true,
  canRequest: true,
  organizationId: "org-uuid-001",
  departmentId: "dept-uuid-001",
  permissions: ["asset:view", "asset:create"],
  mfaPending: false,
};

export const mockOrganization = {
  id: "org-uuid-001",
  name: "Test Organization",
  slug: "test-org",
  settings: {},
};
