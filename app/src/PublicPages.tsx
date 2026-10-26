import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { PrivacyPolicyPage } from "./PrivacyPolicyPage";

/** Public legal notices must render before any account provider is mounted. */
export function PublicPages({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  if (/^\/(privacy|privacy-policy)\/?$/.test(pathname))
    return <PrivacyPolicyPage />;
  return children;
}
