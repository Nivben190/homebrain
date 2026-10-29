"use client";
import { MotionConfig } from "motion/react";

/** Every animation honours the phone's Reduce Motion setting (roadmap 2.10). */
export function MotionRoot({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
