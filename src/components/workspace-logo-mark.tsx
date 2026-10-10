import Image from "next/image";

export function WorkspaceLogoMark({
  stamp,
  className = "mb-6 max-h-12 max-w-48 object-contain object-left",
}: {
  stamp: number;
  className?: string;
}) {
  return (
    <Image
      src={`/brand/logo?v=${stamp}`}
      alt="Workspace logo"
      width={192}
      height={48}
      unoptimized
      className={className}
      style={{ width: "auto", height: "auto" }}
    />
  );
}
