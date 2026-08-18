"use client";

import { useEffect, useState } from "react";

export function ReadingProgress({ postId }: { postId: string }) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const update = () => {
      const available = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(available > 0 ? Math.min(100, (window.scrollY / available) * 100) : 0);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    const timer = window.setTimeout(() => {
      void fetch("/api/events/view", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId, referrer: document.referrer || "direct" }), keepalive: true });
    }, 1200);
    return () => { window.removeEventListener("scroll", update); window.clearTimeout(timer); };
  }, [postId]);
  return <div className="fixed inset-x-0 top-0 z-50 h-0.5 bg-transparent"><div className="h-full bg-[var(--blog-accent)] transition-[width] duration-100" style={{ width: `${progress}%` }} /></div>;
}
