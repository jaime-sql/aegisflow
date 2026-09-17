"use client";

import { useEffect, useState } from "react";
import type { RegionId } from "@/lib/regions";
import { withBasePath } from "@/lib/base-path";

type ProbeJson = {
  live: boolean;
  rowCount: number;
  summary: string;
  error: string | null;
  regionId: string;
};

export function FirmsVerifyButton({
  regionId,
  disabled = false,
}: {
  regionId: RegionId;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ProbeJson | null>(null);

  useEffect(() => {
    setResult(null);
  }, [regionId]);

  async function onVerify() {
    if (busy || disabled) return;
    setBusy(true);
    try {
      const res = await fetch(
        withBasePath(`/api/ops/firms-verify?region=${encodeURIComponent(regionId)}`),
        { cache: "no-store" },
      );
      if (!res.ok) {
        throw new Error(`verify HTTP ${res.status}`);
      }
      const body = (await res.json()) as ProbeJson;
      setResult(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : "verify failed";
      setResult({
        live: false,
        rowCount: 0,
        summary: message,
        error: message,
        regionId,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={onVerify}
        disabled={busy || disabled}
        aria-label="Verify FIRMS"
        aria-busy={busy}
        className="font-mono text-[10px] tracking-wider text-[#3DB9FF] hover:text-[#E8EEF9] disabled:cursor-wait disabled:opacity-50"
      >
        {busy ? "…" : "Verify"}
      </button>
      {result ? (
        <span
          role="status"
          title={result.summary}
          className={`max-w-[220px] truncate font-mono text-[9px] tracking-wider ${
            result.live ? "text-[#3DDC97]" : "text-[#FFB020]"
          }`}
        >
          {result.summary}
        </span>
      ) : null}
    </span>
  );
}
