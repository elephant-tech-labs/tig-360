import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import WorkspaceError from "../app/(workspace)/error";
import { LinkPendingIndicator } from "../components/link-pending-indicator";
import { loadingLabel, RouteSkeleton, skeletonVariant } from "../components/workspace-loading";
import { activeSection } from "../components/workspace-nav";

const root = path.resolve(import.meta.dirname, "..");
const workspaceDir = path.join(root, "app/(workspace)");

async function filesNamed(dir: string, name: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name === name).map((entry) => path.join(entry.parentPath, entry.name));
}

test("each destination gets the skeleton that matches its page layout", () => {
  const cases: Record<string, string> = {
    "/jobs": "list",
    "/contacts": "list",
    "/compliance/wdo": "list",
    "/jobs/new": "form",
    "/contacts/new": "form",
    "/contacts/abc/edit": "form",
    "/jobs/abc/edit": "form",
    "/compliance/wdo/activities/new": "form",
    "/jobs/abc": "job",
    "/jobs/abc/findings": "job",
    "/jobs/abc/send": "job",
    "/management": "page",
    "/management/report-content": "page",
    "/team/inspectors": "page",
    "/settings/finding-library": "page",
    "/compliance/wdo/activities/abc": "page",
    "/compliance/wdo/batches/abc": "page",
  };
  for (const [pathname, variant] of Object.entries(cases)) {
    assert.equal(skeletonVariant(pathname), variant, pathname);
  }
});

test("loading announcements name the destination", () => {
  assert.equal(loadingLabel("/jobs"), "Loading inspection jobs");
  assert.equal(loadingLabel("/jobs/new"), "Loading inspection jobs");
  assert.equal(loadingLabel("/jobs/abc/photos"), "Loading inspection job");
  assert.equal(loadingLabel("/contacts/abc/edit"), "Loading contacts");
  assert.equal(loadingLabel("/compliance/wdo"), "Loading compliance");
  assert.equal(loadingLabel("/team/inspectors"), "Loading management");
  assert.equal(loadingLabel("/settings/finding-library"), "Loading settings");
});

test("route skeleton is announced, hides the visual placeholder, and never shows progress numbers", () => {
  for (const pathname of ["/jobs", "/jobs/new", "/jobs/abc/findings", "/management"]) {
    const html = renderToStaticMarkup(createElement(RouteSkeleton, { pathname }));
    assert.match(html, /^<div aria-busy="true" class="route-loading" role="status">/, pathname);
    assert.match(html, /<span class="sr-only">Loading [a-z ]+…<\/span><div aria-hidden="true">/, pathname);
    assert.doesNotMatch(html, /\d+\s*%<|progress/i, pathname);
  }
});

test("skeletons reuse the real page layout classes", () => {
  const render = (pathname: string) => renderToStaticMarkup(createElement(RouteSkeleton, { pathname }));
  const job = render("/jobs/abc/findings");
  assert.match(job, /class="job-workspace-header"/);
  assert.equal(job.match(/class="job-authoring-step"/g)?.length, 7);
  assert.match(render("/jobs/new"), /class="form-page"/);
  assert.match(render("/jobs"), /class="job-metrics"/);
  assert.doesNotMatch(render("/contacts"), /job-metrics/);
  assert.match(render("/contacts"), /class="page-heading"/);
});

test("sidebar highlights the same section the pages used to pass to AppShell", () => {
  assert.equal(activeSection("/jobs"), "jobs");
  assert.equal(activeSection("/jobs/abc/findings"), "jobs");
  assert.equal(activeSection("/settings/finding-library"), "jobs");
  assert.equal(activeSection("/contacts/abc/edit"), "contacts");
  assert.equal(activeSection("/compliance/wdo/batches/abc"), "compliance");
  assert.equal(activeSection("/management/report-content"), "management");
  assert.equal(activeSection("/team/inspectors"), "management");
});

test("link pending indicator is hidden from assistive tech and idle outside a navigation", () => {
  assert.equal(renderToStaticMarkup(createElement(LinkPendingIndicator)), '<span aria-hidden="true" class="link-pending"></span>');
});

test("workspace error boundary is announced, shows the reference, and offers a retry", () => {
  const html = renderToStaticMarkup(createElement(WorkspaceError, {
    error: Object.assign(new Error("secret database detail"), { digest: "abc123" }),
    unstable_retry: () => {},
  }));
  assert.match(html, /role="alert"/);
  assert.match(html, /<code>abc123<\/code>/);
  assert.match(html, /<button class="primary-button" type="button">.*Try again<\/button>/);
  assert.doesNotMatch(html, /secret database detail/);
});

test("the shell is rendered once by the workspace layout, not by pages", async () => {
  const pages = await filesNamed(workspaceDir, "page.tsx");
  assert.ok(pages.length >= 22, `found ${pages.length} workspace pages`);
  for (const page of pages) {
    assert.doesNotMatch(await readFile(page, "utf8"), /AppShell/, path.relative(root, page));
  }
  assert.match(await readFile(path.join(workspaceDir, "layout.tsx"), "utf8"), /<AppShell/);
});

test("every workspace loading boundary uses the shared skeleton, and job tabs have none", async () => {
  const boundaries = (await filesNamed(workspaceDir, "loading.tsx")).map((file) => path.relative(workspaceDir, file)).sort();
  assert.deepEqual(boundaries, [
    "compliance/wdo/loading.tsx",
    "contacts/loading.tsx",
    "jobs/loading.tsx",
    "loading.tsx",
    "management/loading.tsx",
  ]);
  for (const boundary of boundaries) {
    assert.match(await readFile(path.join(workspaceDir, boundary), "utf8"), /WorkspaceLoading as default/);
  }
});

test("motion respects prefers-reduced-motion and the skeleton waits before appearing", async () => {
  const css = await readFile(path.join(root, "app/globals.css"), "utf8");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[^}]*animation-duration: \.01ms !important/);
  assert.match(css, /\.route-loading \{ animation: route-loading-in [^;]* \.15s both; \}/);
  assert.match(css, /\.link-pending\[data-pending\] \{[^}]*transition-delay: \.12s/);
});
