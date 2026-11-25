"use client";
/**
 * Re-renders the current route (including the layout) once after mount. Used when
 * opening an unread update marks it read during render, so the nav badge and
 * notification count — rendered earlier by the layout — catch up. The server only
 * renders this while the update was unread, so the refresh cannot loop.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function RefreshOnce() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
  }, [router]);
  return null;
}
