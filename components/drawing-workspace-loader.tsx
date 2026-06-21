"use client";

import dynamic from "next/dynamic";
import type { DrawingWorkspaceProps } from "@/components/drawing-workspace";

const DrawingWorkspace = dynamic(
  () => import("@/components/drawing-workspace").then((module) => module.DrawingWorkspace),
  {
    ssr: false,
    loading: () => <div className="drawing-loading">Loading drawing workspace...</div>,
  },
);

export function DrawingWorkspaceLoader(props: DrawingWorkspaceProps) {
  return <DrawingWorkspace {...props} />;
}
