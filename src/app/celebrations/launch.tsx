"use client";
import { useEffect, useState } from "react";
import { LaunchSplash } from "./overlay";

// The app-start animation in the phone apps. The native start-up screen is plain black, and this black cover (drawn by the server, so there is no flash of the app)
// stays until the animation has taken over and finished. Not shown again within 5 minutes, so coming back from a reloaded background app does not replay it.
export function AppLaunch({ native }: { native: boolean }) {
  const [show, setShow] = useState(native);
  useEffect(() => {
    if (!native) return;
    try {
      const last = Number(localStorage.getItem("ds_launch_at") || 0);
      if (Date.now() - last < 5 * 60 * 1000) { setShow(false); return; }
      localStorage.setItem("ds_launch_at", String(Date.now()));
    } catch { /* storage unavailable: just play it */ }
  }, [native]);
  if (!show) return null;
  return <>
    <div className="cel-launch-cover" />
    <LaunchSplash onDone={() => setShow(false)} />
  </>;
}
