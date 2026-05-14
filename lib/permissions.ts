import type { SessionUser } from "@/lib/types";

export const ADMIN_ROLE = "admin";
export const MANAGER_ROLE = "department_manager";

export function isAdminUser(user: Pick<SessionUser, "roles">) {
  return user.roles.includes(ADMIN_ROLE);
}

export function isDepartmentManagerUser(user: Pick<SessionUser, "roles">) {
  return user.roles.includes(MANAGER_ROLE);
}

export function canViewPeopleResultsUser(user: Pick<SessionUser, "roles">) {
  return isAdminUser(user) || isDepartmentManagerUser(user);
}
