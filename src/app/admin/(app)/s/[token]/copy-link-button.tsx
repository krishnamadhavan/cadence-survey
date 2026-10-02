"use client";

import { useState } from "react";

export function CopyLinkButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        const url = `${window.location.origin}${path}`;
        void navigator.clipboard.writeText(url).then(() => {
          setCopied(true);
        });
      }}
      className="inline-flex h-8 shrink-0 items-center rounded-full border border-ink/10 px-3 text-sm text-ink transition-colors hover:bg-ink/5"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
