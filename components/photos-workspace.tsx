"use client";
/* eslint-disable @next/next/no-img-element */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Eye,
  EyeOff,
  ImageIcon,
  Images,
  LoaderCircle,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Square,
  Star,
  Trash2,
  Type,
  Upload,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  archiveJobPhoto,
  moveJobPhoto,
  registerJobPhoto,
  savePhotoAnnotation,
  setJobPhotoStatus,
  updateJobPhoto,
} from "@/app/jobs/[jobId]/photos/actions";

type AnnotationObject = {
  id: string;
  type: "pen" | "rect" | "circle" | "arrow" | "text";
  color: string;
  width: number;
  points: number[];
  text?: string;
};

export type JobPhotoItem = {
  id: string;
  originalPath: string;
  originalUrl: string;
  annotatedPath: string | null;
  annotatedUrl: string | null;
  filename: string;
  contentType: string | null;
  size: number | null;
  caption: string;
  category: string;
  includeInReport: boolean;
  isCover: boolean;
  location: string;
  capturedAt: string | null;
  annotationJson: { objects?: AnnotationObject[] };
  findingIds: string[];
};

type FindingOption = { id: string; code: string; title: string };
type UploadItem = { id: string; name: string; state: "uploading" | "done" | "error"; message?: string };

type PhotosWorkspaceProps = {
  organizationId: string;
  jobId: string;
  jobNumber: number;
  propertyAddress: string;
  initialPhotos: JobPhotoItem[];
  findings: FindingOption[];
  initialStatus: string;
  captureOnly: boolean;
};

const categoryLabels: Record<string, string> = {
  cover: "Cover",
  inspection: "Inspection",
  finding_evidence: "Finding evidence",
  reference: "Reference",
  internal: "Internal only",
};

function extensionFor(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

export function PhotosWorkspace({
  organizationId,
  jobId,
  jobNumber,
  propertyAddress,
  initialPhotos,
  findings,
  initialStatus,
  captureOnly,
}: PhotosWorkspaceProps) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [selectedId, setSelectedId] = useState(initialPhotos[0]?.id ?? null);
  const [filter, setFilter] = useState("all");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [status, setStatus] = useState(initialStatus);
  const [captureMode, setCaptureMode] = useState(captureOnly);
  const [annotationPhoto, setAnnotationPhoto] = useState<JobPhotoItem | null>(null);
  const [isPending, startTransition] = useTransition();
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const selected = photos.find((photo) => photo.id === selectedId) ?? null;

  const visiblePhotos = useMemo(() => photos.filter((photo) => {
    if (filter === "all") return true;
    if (filter === "unassigned") return !photo.findingIds.length;
    if (filter === "report") return photo.includeInReport;
    if (filter === "internal") return photo.category === "internal";
    if (filter === "cover") return photo.isCover;
    return photo.category === filter;
  }), [filter, photos]);

  const linkedCount = photos.filter((photo) => photo.findingIds.length).length;
  const reportCount = photos.filter((photo) => photo.includeInReport).length;

  async function uploadFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const files = Array.from(fileList);
    if (status !== "capture_in_progress" && captureMode) {
      await changeStatus("capture_in_progress");
    }
    for (const file of files) {
      const uploadId = crypto.randomUUID();
      setUploads((current) => [...current, { id: uploadId, name: file.name, state: "uploading" }]);
      const path = `${organizationId}/${jobId}/originals/${crypto.randomUUID()}.${extensionFor(file)}`;
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("inspection-photos")
        .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
      if (uploadError) {
        setUploads((current) => current.map((item) =>
          item.id === uploadId ? { ...item, state: "error", message: uploadError.message } : item,
        ));
        continue;
      }
      const result = await registerJobPhoto({
        organizationId,
        jobId,
        storagePath: path,
        originalName: file.name || `capture-${Date.now()}.jpg`,
        mimeType: file.type || "image/jpeg",
        size: file.size,
        capturedAt: new Date(file.lastModified || Date.now()).toISOString(),
      });
      if (!result.ok) {
        await supabase.storage.from("inspection-photos").remove([path]);
        setUploads((current) => current.map((item) =>
          item.id === uploadId ? { ...item, state: "error", message: result.message } : item,
        ));
        continue;
      }
      const { data: signed } = await supabase.storage.from("inspection-photos").createSignedUrl(path, 60 * 60 * 4);
      const nextPhoto: JobPhotoItem = {
        id: result.photoId ?? crypto.randomUUID(),
        originalPath: path,
        originalUrl: signed?.signedUrl ?? URL.createObjectURL(file),
        annotatedPath: null,
        annotatedUrl: null,
        filename: file.name,
        contentType: file.type,
        size: file.size,
        caption: "",
        category: "inspection",
        includeInReport: true,
        isCover: false,
        location: "",
        capturedAt: new Date(file.lastModified || Date.now()).toISOString(),
        annotationJson: { objects: [] },
        findingIds: [],
      };
      setPhotos((current) => [...current, nextPhoto]);
      setSelectedId(nextPhoto.id);
      setUploads((current) => current.map((item) =>
        item.id === uploadId ? { ...item, state: "done" } : item,
      ));
    }
    window.setTimeout(() => setUploads((current) => current.filter((item) => item.state !== "done")), 1800);
  }

  function saveSelected() {
    if (!selected) return;
    startTransition(async () => {
      const result = await updateJobPhoto({
        organizationId,
        jobId,
        photoId: selected.id,
        caption: selected.caption,
        category: selected.category,
        includeInReport: selected.includeInReport,
        isCover: selected.isCover,
        location: selected.location,
        findingIds: selected.findingIds,
      });
      setNotice(result.ok
        ? { type: "success", message: "Photo details saved." }
        : { type: "error", message: result.message });
    });
  }

  function patchSelected(update: Partial<JobPhotoItem>) {
    if (!selectedId) return;
    setPhotos((current) => current.map((photo) =>
      photo.id === selectedId ? { ...photo, ...update } : photo,
    ));
  }

  function setCoverPhoto(checked: boolean) {
    if (!selectedId) return;
    setPhotos((current) => current.map((photo) => {
      if (photo.id === selectedId) {
        return {
          ...photo,
          isCover: checked,
          category: checked ? "cover" : photo.category === "cover" ? "inspection" : photo.category,
        };
      }
      return checked
        ? { ...photo, isCover: false, category: photo.category === "cover" ? "inspection" : photo.category }
        : photo;
    }));
  }

  function moveSelected(movement: "up" | "down") {
    if (!selectedId) return;
    const currentIndex = photos.findIndex((photo) => photo.id === selectedId);
    const swapIndex = movement === "up" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || swapIndex < 0 || swapIndex >= photos.length) return;
    const next = [...photos];
    [next[currentIndex], next[swapIndex]] = [next[swapIndex], next[currentIndex]];
    setPhotos(next);
    startTransition(async () => {
      const result = await moveJobPhoto({ organizationId, jobId, photoId: selectedId, movement });
      if (!result.ok) {
        setPhotos(photos);
        setNotice({ type: "error", message: result.message });
      }
    });
  }

  async function changeStatus(nextStatus: "draft" | "capture_in_progress" | "complete" | "not_required") {
    const result = await setJobPhotoStatus({ organizationId, jobId, status: nextStatus });
    if (result.ok) {
      setStatus(nextStatus);
      setNotice({ type: "success", message: nextStatus === "complete" ? "Photo workspace marked complete." : "Photo workflow updated." });
    } else {
      setNotice({ type: "error", message: result.message });
    }
  }

  function deleteSelected() {
    if (!selected || !window.confirm("Remove this photo from the job?")) return;
    startTransition(async () => {
      const result = await archiveJobPhoto({
        organizationId,
        jobId,
        photoId: selected.id,
        paths: [selected.originalPath, selected.annotatedPath].filter(Boolean) as string[],
      });
      if (!result.ok) {
        setNotice({ type: "error", message: result.message });
        return;
      }
      const remaining = photos.filter((photo) => photo.id !== selected.id);
      setPhotos(remaining);
      setSelectedId(remaining[0]?.id ?? null);
    });
  }

  if (captureMode) {
    return (
      <div className="capture-page">
        <header className="capture-header">
          <div>
            {!captureOnly ? <button className="text-button" onClick={() => setCaptureMode(false)}><ArrowLeft size={16} /> Back to photo workspace</button> : <Link className="back-link" href={`/jobs/${jobId}`}><ArrowLeft size={16} /> Job #{jobNumber}</Link>}
            <p className="eyebrow">Inspector capture</p>
            <h1>{propertyAddress}</h1>
            <p>{photos.length} photo{photos.length === 1 ? "" : "s"} captured</p>
          </div>
          <span className={`capture-status ${status}`}>{status.replaceAll("_", " ")}</span>
        </header>
        <main className="capture-body">
          <input ref={cameraInputRef} hidden type="file" accept="image/*" capture="environment" multiple onChange={(event) => uploadFiles(event.target.files)} />
          <button className="capture-shutter" onClick={() => cameraInputRef.current?.click()}><Camera size={34} /><strong>Take photos</strong><span>Use the device camera</span></button>
          <input ref={uploadInputRef} hidden type="file" accept="image/*" multiple onChange={(event) => uploadFiles(event.target.files)} />
          <button className="capture-upload" onClick={() => uploadInputRef.current?.click()}><Images size={20} /> Choose existing photos</button>
          <UploadQueue uploads={uploads} />
          <div className="capture-recent">
            {photos.slice(-8).reverse().map((photo) => <img key={photo.id} src={photo.annotatedUrl || photo.originalUrl} alt={photo.caption || "Inspection capture"} />)}
          </div>
          <button className="primary-button capture-finish" disabled={isPending} onClick={() => changeStatus("complete")}><Check size={17} /> Finish capture</button>
        </main>
      </div>
    );
  }

  return (
    <div className="photos-page">
      <header className="photos-header">
        <div>
          <Link className="back-link" href={`/jobs/${jobId}`}><ArrowLeft size={16} /> Job #{jobNumber}</Link>
          <p className="eyebrow">Inspection evidence</p>
          <h1>Photos</h1>
          <p>{propertyAddress}</p>
        </div>
        <div className="photos-header-actions">
          <button className="secondary-button" onClick={() => setCaptureMode(true)}><Camera size={16} /> Capture mode</button>
          <input ref={uploadInputRef} hidden type="file" accept="image/*" multiple onChange={(event) => uploadFiles(event.target.files)} />
          <button className="primary-button" onClick={() => uploadInputRef.current?.click()}><Upload size={16} /> Upload photos</button>
        </div>
      </header>

      {notice ? <div className={`photos-notice form-alert ${notice.type}`}>{notice.message}</div> : null}
      <UploadQueue uploads={uploads} />

      <section className="photo-metrics">
        <div><Images size={18} /><span>Total photos</span><strong>{photos.length}</strong></div>
        <div><Eye size={18} /><span>Included in report</span><strong>{reportCount}</strong></div>
        <div><MapPin size={18} /><span>Linked to findings</span><strong>{linkedCount}</strong></div>
        <div><Star size={18} /><span>Cover selected</span><strong>{photos.some((photo) => photo.isCover) ? "Yes" : "No"}</strong></div>
      </section>

      <div className="photos-layout">
        <main className="photo-browser">
          <div className="photo-toolbar">
            <div className="photo-filter-tabs">
              {[
                ["all", "All"],
                ["report", "Report"],
                ["unassigned", "Unassigned"],
                ["finding_evidence", "Evidence"],
                ["internal", "Internal"],
                ["cover", "Cover"],
              ].map(([value, label]) => <button className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)}>{label}</button>)}
            </div>
            <div className="photo-workflow-actions">
              {!photos.length ? <button className="text-button" onClick={() => changeStatus("not_required")}>Not required</button> : null}
              <button className="secondary-button" onClick={() => changeStatus("complete")}><Check size={15} /> Mark complete</button>
            </div>
          </div>
          {visiblePhotos.length ? (
            <div className="photo-grid">
              {visiblePhotos.map((photo) => (
                <button className={`photo-tile ${selectedId === photo.id ? "selected" : ""}`} key={photo.id} onClick={() => setSelectedId(photo.id)}>
                  <img src={photo.annotatedUrl || photo.originalUrl} alt={photo.caption || photo.filename} />
                  <span className="photo-badges">
                    {photo.isCover ? <b><Star size={11} /> Cover</b> : null}
                    {!photo.includeInReport ? <b className="internal"><EyeOff size={11} /> Excluded</b> : null}
                  </span>
                  <span className="photo-tile-footer"><strong>{photo.caption || photo.location || photo.filename}</strong><small>{photo.findingIds.length ? `${photo.findingIds.length} finding link${photo.findingIds.length === 1 ? "" : "s"}` : categoryLabels[photo.category]}</small></span>
                </button>
              ))}
            </div>
          ) : (
            <div className="photos-empty"><ImageIcon size={28} /><h2>No photos in this view</h2><p>Upload images or open capture mode on a phone.</p><button className="primary-button" onClick={() => uploadInputRef.current?.click()}><Plus size={16} /> Add photos</button></div>
          )}
        </main>

        <aside className="photo-inspector">
          {selected ? (
            <>
              <div className="photo-inspector-preview"><img src={selected.annotatedUrl || selected.originalUrl} alt={selected.caption || selected.filename} /></div>
              <div className="photo-inspector-actions">
                <button onClick={() => setAnnotationPhoto(selected)}><Pencil size={15} /> Annotate</button>
                <button className="danger" onClick={deleteSelected}><Trash2 size={15} /> Remove</button>
              </div>
              <div className="photo-order-actions">
                <button onClick={() => moveSelected("up")} disabled={photos.findIndex((photo) => photo.id === selected.id) === 0}><ChevronLeft size={15} /> Earlier</button>
                <button onClick={() => moveSelected("down")} disabled={photos.findIndex((photo) => photo.id === selected.id) === photos.length - 1}>Later <ChevronRight size={15} /></button>
              </div>
              <div className="photo-form">
                <label>Caption<textarea rows={3} value={selected.caption} onChange={(event) => patchSelected({ caption: event.target.value })} placeholder="Describe what this photo shows" /></label>
                <label>Location<input value={selected.location} onChange={(event) => patchSelected({ location: event.target.value })} placeholder="Example: Subarea, north wall" /></label>
                <label>Category<select value={selected.category} onChange={(event) => patchSelected({ category: event.target.value, includeInReport: event.target.value === "internal" ? false : selected.includeInReport })}>
                  {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select></label>
                <label className="photo-toggle"><input type="checkbox" checked={selected.includeInReport} onChange={(event) => patchSelected({ includeInReport: event.target.checked })} disabled={selected.category === "internal"} /> Include in report</label>
                <label className="photo-toggle"><input type="checkbox" checked={selected.isCover} onChange={(event) => setCoverPhoto(event.target.checked)} /> Use as report cover</label>
                <fieldset className="photo-finding-links"><legend>Linked findings</legend>
                  {findings.map((finding) => <label key={finding.id}><input type="checkbox" checked={selected.findingIds.includes(finding.id)} onChange={(event) => patchSelected({ findingIds: event.target.checked ? [...selected.findingIds, finding.id] : selected.findingIds.filter((id) => id !== finding.id) })} /><span><strong>{finding.code}</strong>{finding.title}</span></label>)}
                  {!findings.length ? <p>No findings have been added yet.</p> : null}
                </fieldset>
                <button className="primary-button full-width" disabled={isPending} onClick={saveSelected}>{isPending ? <LoaderCircle className="button-spinner" size={15} /> : <Save size={15} />} Save photo</button>
              </div>
            </>
          ) : <div className="photo-inspector-empty">Select a photo to edit its report details.</div>}
        </aside>
      </div>

      {annotationPhoto ? <PhotoAnnotationEditor organizationId={organizationId} jobId={jobId} photo={annotationPhoto} onClose={() => setAnnotationPhoto(null)} onSaved={(updated) => { setPhotos((current) => current.map((photo) => photo.id === updated.id ? updated : photo)); setAnnotationPhoto(null); }} /> : null}
    </div>
  );
}

function UploadQueue({ uploads }: { uploads: UploadItem[] }) {
  if (!uploads.length) return null;
  return <div className="photo-upload-queue">{uploads.map((item) => <div className={item.state} key={item.id}>{item.state === "uploading" ? <LoaderCircle className="button-spinner" size={15} /> : item.state === "done" ? <Check size={15} /> : <X size={15} />}<span><strong>{item.name}</strong>{item.message || item.state}</span></div>)}</div>;
}

function PhotoAnnotationEditor({ organizationId, jobId, photo, onClose, onSaved }: {
  organizationId: string;
  jobId: string;
  photo: JobPhotoItem;
  onClose: () => void;
  onSaved: (photo: JobPhotoItem) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const drawingRef = useRef<AnnotationObject | null>(null);
  const [objects, setObjects] = useState<AnnotationObject[]>(photo.annotationJson.objects ?? []);
  const [tool, setTool] = useState<AnnotationObject["type"]>("arrow");
  const [color, setColor] = useState("#e03131");
  const [lineWidth, setLineWidth] = useState(5);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      imageRef.current = image;
      drawAnnotationCanvas(canvasRef.current, image, photo.annotationJson.objects ?? []);
    };
    image.onerror = () => setError("The image could not be loaded for annotation.");
    image.src = photo.originalUrl;
  }, [photo.annotationJson.objects, photo.originalUrl]);

  useEffect(() => {
    if (imageRef.current) drawAnnotationCanvas(canvasRef.current, imageRef.current, objects);
  }, [objects]);

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return [0, 0];
    const bounds = canvas.getBoundingClientRect();
    return [
      (event.clientX - bounds.left) * (canvas.width / bounds.width),
      (event.clientY - bounds.top) * (canvas.height / bounds.height),
    ];
  }

  function pointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const [x, y] = point(event);
    if (tool === "text") {
      const text = window.prompt("Annotation text");
      if (text) setObjects((current) => [...current, { id: crypto.randomUUID(), type: "text", color, width: lineWidth, points: [x, y], text }]);
      return;
    }
    drawingRef.current = { id: crypto.randomUUID(), type: tool, color, width: lineWidth, points: [x, y, x, y] };
  }

  function pointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const drawing = drawingRef.current;
    if (!drawing) return;
    const [x, y] = point(event);
    if (drawing.type === "pen") drawing.points.push(x, y);
    else drawing.points = [drawing.points[0], drawing.points[1], x, y];
    if (imageRef.current) drawAnnotationCanvas(canvasRef.current, imageRef.current, [...objects, drawing]);
  }

  function pointerUp() {
    if (!drawingRef.current) return;
    setObjects((current) => [...current, drawingRef.current as AnnotationObject]);
    drawingRef.current = null;
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    setError("");
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) {
      setError("Could not create the annotated image.");
      setSaving(false);
      return;
    }
    const path = `${organizationId}/${jobId}/annotated/${photo.id}-${Date.now()}.jpg`;
    const supabase = createClient();
    const { error: uploadError } = await supabase.storage.from("inspection-photos").upload(path, blob, { contentType: "image/jpeg" });
    if (uploadError) {
      setError(uploadError.message);
      setSaving(false);
      return;
    }
    const result = await savePhotoAnnotation({ organizationId, jobId, photoId: photo.id, annotationJson: { version: 1, objects }, renderPath: path });
    if (!result.ok) {
      await supabase.storage.from("inspection-photos").remove([path]);
      setError(result.message);
      setSaving(false);
      return;
    }
    if (photo.annotatedPath) await supabase.storage.from("inspection-photos").remove([photo.annotatedPath]);
    const { data: signed } = await supabase.storage.from("inspection-photos").createSignedUrl(path, 60 * 60 * 4);
    onSaved({ ...photo, annotatedPath: path, annotatedUrl: signed?.signedUrl ?? canvas.toDataURL("image/jpeg", 0.9), annotationJson: { objects } });
  }

  const tools = [
    ["arrow", ArrowRight],
    ["rect", Square],
    ["circle", Circle],
    ["pen", Pencil],
    ["text", Type],
  ] as const;

  return <div className="annotation-backdrop"><section className="annotation-editor">
    <header><div><p className="eyebrow">Non-destructive markup</p><h2>Annotate photo</h2></div><button className="icon-button" onClick={onClose}><X size={19} /></button></header>
    <div className="annotation-toolbar">
      {tools.map(([value, Icon]) => <button className={tool === value ? "active" : ""} title={value} key={value} onClick={() => setTool(value)}><Icon size={17} /></button>)}
      <input type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label="Annotation color" />
      <select value={lineWidth} onChange={(event) => setLineWidth(Number(event.target.value))}><option value={3}>Thin</option><option value={5}>Medium</option><option value={8}>Thick</option></select>
      <button title="Undo annotation" disabled={!objects.length} onClick={() => setObjects((current) => current.slice(0, -1))}><RotateCcw size={17} /></button>
      <button title="Clear annotations" disabled={!objects.length} onClick={() => setObjects([])}><Trash2 size={17} /></button>
    </div>
    <div className="annotation-canvas-wrap"><canvas ref={canvasRef} width={1200} height={800} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} /></div>
    {error ? <div className="form-alert error">{error}</div> : null}
    <footer><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving} onClick={save}>{saving ? <LoaderCircle className="button-spinner" size={16} /> : <Save size={16} />} Save annotation</button></footer>
  </section></div>;
}

function drawAnnotationCanvas(canvas: HTMLCanvasElement | null, image: HTMLImageElement, objects: AnnotationObject[]) {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const x = (canvas.width - width) / 2;
  const y = (canvas.height - height) / 2;
  context.fillStyle = "#1f2925";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, x, y, width, height);
  context.lineCap = "round";
  context.lineJoin = "round";
  objects.forEach((object) => {
    context.strokeStyle = object.color;
    context.fillStyle = object.color;
    context.lineWidth = object.width;
    const [x1, y1, x2, y2] = object.points;
    if (object.type === "pen") {
      context.beginPath();
      object.points.forEach((point, index) => {
        if (index % 2) return;
        const pointY = object.points[index + 1];
        if (index === 0) context.moveTo(point, pointY);
        else context.lineTo(point, pointY);
      });
      context.stroke();
    } else if (object.type === "rect") {
      context.strokeRect(x1, y1, x2 - x1, y2 - y1);
    } else if (object.type === "circle") {
      context.beginPath();
      context.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2);
      context.stroke();
    } else if (object.type === "arrow") {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const head = 18;
      context.beginPath();
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
      context.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
      context.moveTo(x2, y2);
      context.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
      context.stroke();
    } else if (object.type === "text") {
      context.font = `bold ${Math.max(22, object.width * 5)}px Arial`;
      context.fillText(object.text ?? "", x1, y1);
    }
  });
}
