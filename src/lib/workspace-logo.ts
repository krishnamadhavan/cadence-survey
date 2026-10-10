export const WORKSPACE_LOGO_MAX_BYTES = 512 * 1024;

export const WORKSPACE_LOGO_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export type WorkspaceLogoContentType = (typeof WORKSPACE_LOGO_CONTENT_TYPES)[number];

const TYPE_MESSAGE = "Use a PNG, JPEG, or WebP image.";
const SIZE_MESSAGE = "Logo must be 512 KB or smaller.";

export function isWorkspaceLogoContentType(value: string): value is WorkspaceLogoContentType {
  return (WORKSPACE_LOGO_CONTENT_TYPES as readonly string[]).includes(value);
}

export function detectWorkspaceLogo(bytes: Uint8Array): WorkspaceLogoContentType | null {
  if (bytes.byteLength === 0 || bytes.byteLength > WORKSPACE_LOGO_MAX_BYTES) {
    return null;
  }
  if (isPng(bytes)) {
    return "image/png";
  }
  if (isJpeg(bytes)) {
    return "image/jpeg";
  }
  if (isWebp(bytes)) {
    return "image/webp";
  }
  return null;
}

export function workspaceLogoValidationMessage(bytes: Uint8Array): string | null {
  if (bytes.byteLength > WORKSPACE_LOGO_MAX_BYTES) {
    return SIZE_MESSAGE;
  }
  if (detectWorkspaceLogo(bytes) === null) {
    return TYPE_MESSAGE;
  }
  return null;
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isWebp(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) {
    return false;
  }
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}
