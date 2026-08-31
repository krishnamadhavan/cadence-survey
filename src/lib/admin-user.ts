export type SessionUser = {
  id: string;
  email: string;
};

export async function resolveSessionUser(
  adminId: string,
  lookup: () => Promise<SessionUser | undefined>,
): Promise<SessionUser> {
  try {
    const admin = await lookup();
    return admin ?? { id: adminId, email: "Admin" };
  } catch {
    return { id: adminId, email: "Admin" };
  }
}
