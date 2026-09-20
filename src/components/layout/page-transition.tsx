"use client";

import { usePathname } from "next/navigation";
import { ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
}

/**
 * PageTransition Component
 * Provides a smooth, GPU-composited enter animation when routes change.
 *
 * Uses `will-change: opacity, transform` to hint the GPU compositor,
 * eliminating layout repaints and ensuring a buttery-smooth transition.
 * The 8px Y-translate with cubic-bezier(0.16, 1, 0.3, 1) creates a
 * spring-like deceleration that feels native and premium.
 */
export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();

  return (
    <div
      key={pathname}
      className="page-enter-animation w-full"
      style={{ willChange: "opacity, transform" }}
    >
      {children}
    </div>
  );
}
