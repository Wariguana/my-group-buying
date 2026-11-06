"use client";

import { useEffect } from "react";

const warning = "銀行設定尚未儲存，確定離開並放棄修改？";

// Capture links before Next handles them; beforeunload covers reload/close.
// The Navigation API additionally covers browser back/forward when available.
export function useUnsavedBankSettings(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      const next = new URL(link.href);
      if (next.pathname === location.pathname && next.search === location.search && next.origin === location.origin) return;
      if (!window.confirm(warning)) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    const traverse = (event: Event) => {
      const navigation = event as Event & { navigationType: string; canIntercept: boolean };
      if (navigation.navigationType === "traverse" && navigation.canIntercept && !window.confirm(warning)) event.preventDefault();
    };
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    navigation?.addEventListener("navigate", traverse);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
      navigation?.removeEventListener("navigate", traverse);
    };
  }, [dirty]);
}
