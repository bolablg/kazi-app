import { useState } from "react";
import { useConvex } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";
import { Download } from "lucide-react";
import { useData } from "./data";
import { useAccountIdentity } from "./IdentityScreens";

export type AccountIdentityExport = FunctionReturnType<
  typeof api.commands.exportData
>["accountIdentity"];
type ExportProps = {
  onExport: (identity?: AccountIdentityExport) => void;
  onError: () => void;
};

export function AccountDataExportButton(props: ExportProps) {
  const identity = useAccountIdentity();
  const { workspaceId, demo, local } = useData();
  if (identity && !demo && !local && workspaceId)
    return <LiveExportButton {...props} workspaceId={workspaceId} />;
  return (
    <button className="button secondary" onClick={() => props.onExport()}>
      <Download size={16} />
      Export my data
    </button>
  );
}

function LiveExportButton({
  workspaceId,
  onExport,
  onError,
}: ExportProps & { workspaceId: Id<"workspaces"> }) {
  const convex = useConvex();
  const [busy, setBusy] = useState(false);
  const download = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // The server derives the requesting identity from authentication. No
      // caller-supplied actor, email, provider, or alias is accepted here.
      const result = await convex.query(api.commands.exportData, {
        workspaceId,
      });
      if (!result.accountIdentity)
        throw new Error("Account metadata is unavailable.");
      onExport(result.accountIdentity);
    } catch {
      onError();
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      className="button secondary"
      disabled={busy}
      onClick={() => void download()}
    >
      <Download size={16} />
      {busy ? "Exporting…" : "Export my data"}
    </button>
  );
}
