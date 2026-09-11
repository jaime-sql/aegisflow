import { isClerkConfigured } from "./config";
import { parseOpsRole, type OpsRole } from "./roles";

export type OpsSession = {
  role: OpsRole;
  clerkEnabled: boolean;
  bypass: boolean;
  displayName: string;
  imageUrl?: string;
};

function bypassRole(searchRole?: string | string[]): OpsRole {
  const raw = Array.isArray(searchRole) ? searchRole[0] : searchRole;
  if (raw === "viewer" || raw === "manager") return raw;
  // DEV bypass defaults to manager so QA can exercise dispatch.
  return process.env.AEGISFLOW_DEV_ROLE === "viewer" ? "viewer" : "manager";
}

export async function getOpsSession(searchRole?: string | string[]): Promise<OpsSession> {
  if (!isClerkConfigured()) {
    const role = bypassRole(searchRole);
    return {
      role,
      clerkEnabled: false,
      bypass: true,
      displayName: role === "manager" ? "Dev Manager" : "Dev Viewer",
    };
  }

  const { currentUser } = await import("@clerk/nextjs/server");
  const user = await currentUser();
  const role = parseOpsRole(user?.publicMetadata?.role);

  return {
    role,
    clerkEnabled: true,
    bypass: false,
    displayName:
      user?.firstName ||
      user?.username ||
      user?.primaryEmailAddress?.emailAddress ||
      "Operator",
    imageUrl: user?.imageUrl,
  };
}
