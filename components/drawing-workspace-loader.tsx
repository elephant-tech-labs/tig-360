"use client";

import dynamic from "next/dynamic";

export const DrawingWorkspaceLoader = dynamic(
  () => import("@/components/drawing-workspace").then((module) => module.DrawingWorkspace),
  {
    ssr: false,
    loading: () => <div className="drawing-loading">Loading drawing workspace...</div>,
  },
);
