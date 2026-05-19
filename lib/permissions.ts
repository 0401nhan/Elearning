import type { SessionUser } from "@/lib/types";

export const ADMIN_ROLE = "admin";
export const MANAGER_ROLE = "department_manager";

export const PERMISSIONS = {
  materialsRead: "materials.read",
  practiceCreate: "practice.create",
  officialCreate: "official.create",
  resultsSelfRead: "results.self.read",
  resultsDepartmentRead: "results.department.read",
  adminDashboardRead: "admin.dashboard.read",
  questionsManage: "questions.manage",
  materialsManage: "materials.manage",
  assignmentsManage: "assignments.manage",
  systemManage: "system.manage"
} as const;

type PermissionAwareUser = Pick<SessionUser, "roles"> & Partial<Pick<SessionUser, "permissions">>;

export function isAdminUser(user: Pick<SessionUser, "roles">) {
  return user.roles.includes(ADMIN_ROLE);
}

export function isDepartmentManagerUser(user: Pick<SessionUser, "roles">) {
  return user.roles.includes(MANAGER_ROLE);
}

export function hasPermissionUser(user: PermissionAwareUser, permission: string) {
  return isAdminUser(user) || Boolean(user.permissions?.includes(permission));
}

export function canViewPeopleResultsUser(user: PermissionAwareUser) {
  return isAdminUser(user) || isDepartmentManagerUser(user);
}

export function canReadAdminDashboardUser(user: PermissionAwareUser) {
  return isAdminUser(user) || isDepartmentManagerUser(user);
}

export function canManageAssignmentsUser(user: PermissionAwareUser) {
  return isAdminUser(user);
}

export function canManageQuestionsUser(user: PermissionAwareUser) {
  return isAdminUser(user);
}

export function canManageMaterialsUser(user: PermissionAwareUser) {
  return isAdminUser(user);
}

export function canManageSystemUser(user: PermissionAwareUser) {
  return isAdminUser(user);
}

export function canAccessAdminUser(user: PermissionAwareUser) {
  return isAdminUser(user) || isDepartmentManagerUser(user);
}
