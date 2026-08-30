import { normalizeEmail } from "@/lib/email";

export function adminLoginEmailKey(email: string): string {
  return `rl:admin-login:email:${normalizeEmail(email)}`;
}

export function adminLoginIpKey(ip: string): string {
  return `rl:admin-login:ip:${ip}`;
}
