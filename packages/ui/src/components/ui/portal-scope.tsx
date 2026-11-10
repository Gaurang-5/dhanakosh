"use client";

import * as React from "react";

const PortalScopeContext = React.createContext<string | undefined>(undefined);

interface PortalScopeProps {
  /** Marks the portal of every popup opened inside, as `data-portal-scope`. */
  name: string;
  children: React.ReactNode;
}

/**
 * Names the part of the app that popups opened inside it belong to. Popups
 * render outside their opener, so kept mobile screens can use this marker to
 * keep off-screen popups out of reach.
 */
function PortalScope({ name, children }: PortalScopeProps) {
  return <PortalScopeContext.Provider value={name}>{children}</PortalScopeContext.Provider>;
}

function usePortalScopeProps(): { "data-portal-scope"?: string } {
  const scope = React.useContext(PortalScopeContext);
  return scope === undefined ? {} : { "data-portal-scope": scope };
}

export { PortalScope, usePortalScopeProps };
