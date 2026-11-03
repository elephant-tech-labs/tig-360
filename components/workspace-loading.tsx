"use client";

import { usePathname } from "next/navigation";

export type SkeletonVariant = "list" | "form" | "job" | "page";

// Picks the skeleton that matches the destination page's layout.
export function skeletonVariant(pathname: string): SkeletonVariant {
  if (/\/(new|edit)$/.test(pathname)) return "form";
  if (/^\/jobs\/[^/]+/.test(pathname)) return "job";
  if (pathname === "/jobs" || pathname === "/contacts" || pathname === "/compliance/wdo") return "list";
  return "page";
}

export function loadingLabel(pathname: string) {
  if (/^\/jobs\/[^/]+/.test(pathname) && !pathname.endsWith("/new")) return "Loading inspection job";
  if (pathname.startsWith("/jobs")) return "Loading inspection jobs";
  if (pathname.startsWith("/contacts")) return "Loading contacts";
  if (pathname.startsWith("/compliance")) return "Loading compliance";
  if (pathname.startsWith("/settings")) return "Loading settings";
  return "Loading management";
}

function Bar({ width, height = 12 }: { width: string | number; height?: number }) {
  return <span className="skeleton-bar" style={{ height, width }} />;
}

function Heading({ action = true }: { action?: boolean }) {
  return (
    <div className="page-heading">
      <div>
        <Bar width={130} height={11} />
        <Bar width={280} height={30} />
        <Bar width={360} height={13} />
      </div>
      {action ? <Bar width={124} height={38} /> : null}
    </div>
  );
}

function Rows({ count }: { count: number }) {
  return (
    <div className="skeleton-card">
      <Bar width="30%" height={16} />
      <div className="skeleton-rows">
        {Array.from({ length: count }, (_, index) => (
          <span className="skeleton-row" key={index}><Bar width={`${70 - (index % 3) * 12}%`} /></span>
        ))}
      </div>
    </div>
  );
}

function Skeleton({ variant, pathname }: { variant: SkeletonVariant; pathname: string }) {
  if (variant === "job") {
    return (
      <>
        <header className="job-workspace-header">
          <div>
            <Bar width={80} height={13} />
            <Bar width={150} height={11} />
            <Bar width={320} height={30} />
            <Bar width={200} height={13} />
          </div>
        </header>
        <div className="job-authoring-nav">
          {Array.from({ length: 7 }, (_, index) => (
            <span className="job-authoring-step" key={index}><Bar width="70%" height={11} /></span>
          ))}
        </div>
        <Rows count={4} />
      </>
    );
  }

  if (variant === "form") {
    return (
      <div className="form-page">
        <Bar width={110} height={13} />
        <div className="form-page-heading skeleton-form-heading">
          <span className="skeleton-bar skeleton-icon" />
          <div>
            <Bar width={110} height={11} />
            <Bar width={300} height={30} />
            <Bar width={380} height={13} />
          </div>
        </div>
        <div className="skeleton-card skeleton-form-card">
          {Array.from({ length: 5 }, (_, index) => (
            <div className="skeleton-field" key={index}>
              <Bar width={120} height={11} />
              <Bar width="100%" height={38} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "list") {
    return (
      <>
        <Heading />
        {pathname === "/jobs" ? (
          <div className="job-metrics">
            {Array.from({ length: 3 }, (_, index) => <span className="skeleton-bar skeleton-metric" key={index} />)}
          </div>
        ) : null}
        <Rows count={6} />
      </>
    );
  }

  return (
    <>
      <Heading action={false} />
      <Rows count={3} />
      <Rows count={2} />
    </>
  );
}

// Shared route fallback for every workspace loading.tsx. It renders inside the
// persistent shell, fades in after a short delay (CSS) so fast navigations do
// not flash, and announces itself to assistive technology.
export function WorkspaceLoading() {
  return <RouteSkeleton pathname={usePathname() ?? ""} />;
}

export function RouteSkeleton({ pathname }: { pathname: string }) {
  return (
    <div aria-busy="true" className="route-loading" role="status">
      <span className="sr-only">{loadingLabel(pathname)}…</span>
      <div aria-hidden="true">
        <Skeleton pathname={pathname} variant={skeletonVariant(pathname)} />
      </div>
    </div>
  );
}
