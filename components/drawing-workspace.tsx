"use client";

import {
  useCallback,
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
  Check,
  Download,
  Grid3X3,
  LoaderCircle,
  MapPin,
  Minus,
  MousePointer2,
  Pencil,
  Redo2,
  Save,
  Square,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import Konva from "konva";
import {
  Arrow,
  Group,
  Layer,
  Line,
  Rect,
  Stage,
  Text,
  Transformer,
} from "react-konva";
import {
  publishDiagramVersion,
  saveDiagramDraft,
  type DiagramMarkerInput,
} from "@/app/jobs/[jobId]/drawing/actions";

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 780;
const GRID_SIZE = 20;

type DrawingTool = "select" | "pen" | "line" | "arrow" | "rect" | "text" | "marker";
type DiagramStatus = "draft" | "complete" | "skipped";

type DiagramObject = {
  id: string;
  type: Exclude<DrawingTool, "select">;
  x: number;
  y: number;
  width?: number;
  height?: number;
  points?: number[];
  text?: string;
  stroke: string;
  fill: string;
  strokeWidth: number;
  dash?: number[];
  findingId?: string | null;
  label?: string;
};

export type DrawingFinding = {
  id: string;
  code: string;
  title: string;
  classification: string | null;
};

export type DrawingVersion = {
  id: string;
  version: number;
  status: "complete" | "skipped";
  createdAt: string;
};

export type DrawingWorkspaceProps = {
  organizationId: string;
  jobId: string;
  jobNumber: number;
  propertyAddress: string;
  initialObjects: DiagramObject[];
  initialStatus: DiagramStatus;
  findings: DrawingFinding[];
  versions: DrawingVersion[];
};

function snap(value: number, enabled: boolean) {
  return enabled ? Math.round(value / GRID_SIZE) * GRID_SIZE : value;
}

function markerItems(objects: DiagramObject[]): DiagramMarkerInput[] {
  return objects
    .filter((object) => object.type === "marker")
    .map((object) => ({
      key: object.id,
      findingId: object.findingId ?? null,
      label: object.label ?? "Unlinked",
      x: object.x,
      y: object.y,
    }));
}

function dataUrlToFile(dataUrl: string, filename: string) {
  const [header, body] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "image/png";
  const bytes = atob(body);
  const buffer = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) buffer[index] = bytes.charCodeAt(index);
  return new File([buffer], filename, { type: mime });
}

export function DrawingWorkspace({
  organizationId,
  jobId,
  jobNumber,
  propertyAddress,
  initialObjects,
  initialStatus,
  findings,
  versions,
}: DrawingWorkspaceProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const gridLayerRef = useRef<Konva.Layer>(null);
  const initialRender = useRef(true);
  const drawingObjectId = useRef<string | null>(null);
  const historyRef = useRef<DiagramObject[][]>([initialObjects]);
  const historyIndexRef = useRef(0);

  const [objects, setObjects] = useState<DiagramObject[]>(initialObjects);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [historyLength, setHistoryLength] = useState(1);
  const [tool, setTool] = useState<DrawingTool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFindingId, setSelectedFindingId] = useState(findings[0]?.id ?? "");
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [strokeColor, setStrokeColor] = useState("#17201d");
  const [fillColor, setFillColor] = useState("#ffffff");
  const [fillEnabled, setFillEnabled] = useState(false);
  const [lineStyle, setLineStyle] = useState<"solid" | "dashed" | "dotted">("solid");
  const [zoom, setZoom] = useState(0.8);
  const [status, setStatus] = useState<DiagramStatus>(initialStatus);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [notice, setNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isPublishing, startPublishing] = useTransition();

  const activeFindings = useMemo(
    () => findings.filter((finding) => finding.code),
    [findings],
  );
  const selectedFinding = activeFindings.find((finding) => finding.id === selectedFindingId);
  const linkedFindingIds = new Set(
    objects.filter((object) => object.type === "marker" && object.findingId).map((object) => object.findingId),
  );

  const dash = lineStyle === "dashed" ? [12, 7] : lineStyle === "dotted" ? [3, 6] : [];

  const commitObjects = useCallback((next: DiagramObject[]) => {
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(next);
    historyIndexRef.current = historyRef.current.length - 1;
    setHistoryIndex(historyIndexRef.current);
    setHistoryLength(historyRef.current.length);
    setObjects(next);
  }, []);

  const replaceObject = useCallback((id: string, update: Partial<DiagramObject>, commit = false) => {
    setObjects((current) => {
      const next = current.map((object) => object.id === id ? { ...object, ...update } : object);
      if (commit) {
        historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
        historyRef.current.push(next);
        historyIndexRef.current = historyRef.current.length - 1;
        setHistoryIndex(historyIndexRef.current);
        setHistoryLength(historyRef.current.length);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    if (!transformer || !stage) return;
    const node = selectedId ? stage.findOne(`#${selectedId}`) : null;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedId, objects]);

  useEffect(() => {
    if (initialRender.current) {
      initialRender.current = false;
      return;
    }
    setSaveState("saving");
    const timer = window.setTimeout(async () => {
      const result = await saveDiagramDraft({
        organizationId,
        jobId,
        sourceJson: { schemaVersion: 1, objects },
        markers: markerItems(objects),
        canvasWidth: CANVAS_WIDTH,
        canvasHeight: CANVAS_HEIGHT,
        status,
      });
      setSaveState(result.ok ? "saved" : "error");
      if (!result.ok) setNotice({ type: "error", message: result.message });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [jobId, objects, organizationId, status]);

  function stagePoint() {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return null;
    return {
      x: snap((pointer.x - stage.x()) / zoom, snapEnabled),
      y: snap((pointer.y - stage.y()) / zoom, snapEnabled),
    };
  }

  function handlePointerDown(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (tool === "select") {
      if (event.target === event.target.getStage()) setSelectedId(null);
      return;
    }
    const point = stagePoint();
    if (!point) return;
    const id = crypto.randomUUID();
    const common = {
      id,
      x: point.x,
      y: point.y,
      stroke: strokeColor,
      fill: fillEnabled ? fillColor : "transparent",
      strokeWidth,
      dash,
    };

    if (tool === "text") {
      commitObjects([...objects, { ...common, type: "text", text: "Text", fill: strokeColor }]);
      setTool("select");
      setSelectedId(id);
      return;
    }
    if (tool === "marker") {
      if (!selectedFinding) {
        setNotice({ type: "error", message: "Choose a finding before placing a marker." });
        return;
      }
      commitObjects([...objects, {
        ...common,
        type: "marker",
        findingId: selectedFinding.id,
        label: selectedFinding.code,
        fill: "#fff7df",
        stroke: "#17201d",
        strokeWidth: 2,
      }]);
      setTool("select");
      setSelectedId(id);
      return;
    }

    drawingObjectId.current = id;
    const nextObject: DiagramObject = tool === "pen"
      ? { ...common, type: "pen", x: 0, y: 0, points: [point.x, point.y] }
      : tool === "rect"
        ? { ...common, type: "rect", width: 0, height: 0 }
        : { ...common, type: tool, x: 0, y: 0, points: [point.x, point.y, point.x, point.y] };
    setObjects([...objects, nextObject]);
  }

  function handlePointerMove() {
    const id = drawingObjectId.current;
    const point = stagePoint();
    if (!id || !point) return;
    setObjects((current) => current.map((object) => {
      if (object.id !== id) return object;
      if (object.type === "pen") return { ...object, points: [...(object.points ?? []), point.x, point.y] };
      if (object.type === "rect") return { ...object, width: point.x - object.x, height: point.y - object.y };
      return { ...object, points: [object.points?.[0] ?? point.x, object.points?.[1] ?? point.y, point.x, point.y] };
    }));
  }

  function handlePointerUp() {
    if (!drawingObjectId.current) return;
    drawingObjectId.current = null;
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(objects);
    historyIndexRef.current = historyRef.current.length - 1;
    setHistoryIndex(historyIndexRef.current);
    setHistoryLength(historyRef.current.length);
  }

  function undo() {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    setHistoryIndex(historyIndexRef.current);
    setObjects(historyRef.current[historyIndexRef.current]);
    setSelectedId(null);
  }

  function redo() {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    setHistoryIndex(historyIndexRef.current);
    setObjects(historyRef.current[historyIndexRef.current]);
    setSelectedId(null);
  }

  function deleteSelected() {
    if (!selectedId) return;
    commitObjects(objects.filter((object) => object.id !== selectedId));
    setSelectedId(null);
  }

  function clearCanvas() {
    if (!window.confirm("Clear every object from this drawing?")) return;
    commitObjects([]);
    setSelectedId(null);
  }

  function exportPng(download = true) {
    const stage = stageRef.current;
    if (!stage) return "";
    const previousWidth = stage.width();
    const previousHeight = stage.height();
    const previousScale = stage.scaleX();
    gridLayerRef.current?.hide();
    transformerRef.current?.hide();
    stage.width(CANVAS_WIDTH);
    stage.height(CANVAS_HEIGHT);
    stage.scale({ x: 1, y: 1 });
    stage.batchDraw();
    const dataUrl = stage.toDataURL({
      pixelRatio: 2,
      x: 0,
      y: 0,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
    });
    stage.width(previousWidth);
    stage.height(previousHeight);
    stage.scale({ x: previousScale, y: previousScale });
    gridLayerRef.current?.show();
    transformerRef.current?.show();
    stage.batchDraw();
    if (download) {
      const anchor = document.createElement("a");
      anchor.href = dataUrl;
      anchor.download = `termite-diagram-${jobNumber}.png`;
      anchor.click();
    }
    return dataUrl;
  }

  function publish(nextStatus: "complete" | "skipped") {
    startPublishing(async () => {
      const formData = new FormData();
      formData.set("organizationId", organizationId);
      formData.set("jobId", jobId);
      formData.set("status", nextStatus);
      formData.set("sourceJson", JSON.stringify({ schemaVersion: 1, objects }));
      formData.set("markers", JSON.stringify(markerItems(objects)));
      formData.set("canvasWidth", String(CANVAS_WIDTH));
      formData.set("canvasHeight", String(CANVAS_HEIGHT));
      if (nextStatus === "complete") {
        const dataUrl = exportPng(false);
        formData.set("render", dataUrlToFile(dataUrl, `diagram-${jobNumber}.png`));
      }
      const result = await publishDiagramVersion(formData);
      if (!result.ok) {
        setNotice({ type: "error", message: result.message });
        return;
      }
      setStatus(nextStatus);
      setNotice({
        type: "success",
        message: nextStatus === "skipped"
          ? `Drawing skipped and recorded as version ${result.version}.`
          : `Diagram version ${result.version} saved for the report.`,
      });
    });
  }

  function shapeProps(object: DiagramObject) {
    return {
      id: object.id,
      draggable: tool === "select",
      onClick: () => setSelectedId(object.id),
      onTap: () => setSelectedId(object.id),
      onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => {
        replaceObject(object.id, {
          x: snap(event.target.x(), snapEnabled),
          y: snap(event.target.y(), snapEnabled),
        }, true);
      },
      onTransformEnd: (event: Konva.KonvaEventObject<Event>) => {
        const node = event.target;
        const update = object.points
          ? {
              x: node.x(),
              y: node.y(),
              points: object.points.map((point, index) => point * (index % 2 === 0 ? node.scaleX() : node.scaleY())),
            }
          : {
              x: node.x(),
              y: node.y(),
              width: Math.max(4, (object.width ?? node.width()) * node.scaleX()),
              height: Math.max(4, (object.height ?? node.height()) * node.scaleY()),
            };
        replaceObject(object.id, update, true);
        node.scaleX(1);
        node.scaleY(1);
      },
    };
  }

  function renderObject(object: DiagramObject) {
    const props = shapeProps(object);
    if (object.type === "rect") {
      return <Rect key={object.id} {...props} width={object.width} height={object.height} stroke={object.stroke} fill={object.fill} strokeWidth={object.strokeWidth} dash={object.dash} />;
    }
    if (object.type === "line" || object.type === "pen") {
      return <Line key={object.id} {...props} points={object.points ?? []} stroke={object.stroke} strokeWidth={object.strokeWidth} dash={object.dash} lineCap="round" lineJoin="round" tension={object.type === "pen" ? 0.25 : 0} />;
    }
    if (object.type === "arrow") {
      return <Arrow key={object.id} {...props} points={object.points ?? []} stroke={object.stroke} fill={object.stroke} strokeWidth={object.strokeWidth} dash={object.dash} pointerLength={12} pointerWidth={10} />;
    }
    if (object.type === "text") {
      return (
        <Text
          key={object.id}
          {...props}
          text={object.text}
          fill={object.fill}
          fontSize={22}
          padding={4}
          onDblClick={() => {
            const nextText = window.prompt("Text", object.text ?? "");
            if (nextText !== null) replaceObject(object.id, { text: nextText }, true);
          }}
        />
      );
    }
    return (
      <Group key={object.id} {...props}>
        <Rect width={46} height={32} offsetX={23} offsetY={16} fill={object.fill} stroke={object.stroke} strokeWidth={object.strokeWidth} cornerRadius={4} />
        <Text text={object.label} width={46} height={32} offsetX={23} offsetY={16} align="center" verticalAlign="middle" fontStyle="bold" fontSize={14} fill="#17201d" />
      </Group>
    );
  }

  const tools: { id: DrawingTool; label: string; icon: React.ReactNode }[] = [
    { id: "select", label: "Select", icon: <MousePointer2 size={18} /> },
    { id: "pen", label: "Pen", icon: <Pencil size={18} /> },
    { id: "line", label: "Line", icon: <Minus size={18} /> },
    { id: "arrow", label: "Arrow", icon: <ArrowRight size={18} /> },
    { id: "rect", label: "Rectangle", icon: <Square size={18} /> },
    { id: "text", label: "Text", icon: <Type size={18} /> },
    { id: "marker", label: "Finding marker", icon: <MapPin size={18} /> },
  ];

  return (
    <div className="drawing-page">
      <header className="drawing-header">
        <div>
          <Link className="back-link" href={`/jobs/${jobId}`}><ArrowLeft size={16} /> Job #{jobNumber}</Link>
          <p className="eyebrow">Inspection authoring</p>
          <h1>Property diagram</h1>
          <p>{propertyAddress}</p>
        </div>
        <div className="drawing-header-actions">
          <span className={`draft-indicator ${saveState}`}>
            {saveState === "saving" ? <LoaderCircle className="button-spinner" size={14} /> : saveState === "saved" ? <Check size={14} /> : null}
            {saveState === "saving" ? "Saving draft" : saveState === "saved" ? "Draft saved" : "Save failed"}
          </span>
          <button className="secondary-button" onClick={() => exportPng(true)}><Download size={16} /> Export PNG</button>
          <button className="primary-button" disabled={isPublishing || !objects.length} onClick={() => publish("complete")}>
            {isPublishing ? <LoaderCircle className="button-spinner" size={16} /> : <Save size={16} />} Save version
          </button>
        </div>
      </header>

      {notice ? <div className={`drawing-notice form-alert ${notice.type}`}>{notice.message}</div> : null}

      <div className="drawing-layout">
        <aside className="drawing-tool-rail" aria-label="Drawing tools">
          {tools.map((item) => (
            <button className={tool === item.id ? "active" : ""} key={item.id} title={item.label} onClick={() => setTool(item.id)}>
              {item.icon}<span>{item.label}</span>
            </button>
          ))}
        </aside>

        <main className="drawing-main">
          <div className="drawing-control-bar">
            <label>Stroke<select value={strokeWidth} onChange={(event) => setStrokeWidth(Number(event.target.value))}><option value={1}>Thin</option><option value={3}>Medium</option><option value={6}>Thick</option></select></label>
            <label>Style<select value={lineStyle} onChange={(event) => setLineStyle(event.target.value as typeof lineStyle)}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select></label>
            <label className="color-control">Line<input type="color" value={strokeColor} onChange={(event) => setStrokeColor(event.target.value)} /></label>
            <label className="color-control">Fill<input type="color" value={fillColor} disabled={!fillEnabled} onChange={(event) => setFillColor(event.target.value)} /></label>
            <label className="toggle-control"><input type="checkbox" checked={fillEnabled} onChange={(event) => setFillEnabled(event.target.checked)} /> Fill</label>
            <div className="drawing-control-actions">
              <button title="Undo" onClick={undo} disabled={historyIndex <= 0}><Undo2 size={17} /></button>
              <button title="Redo" onClick={redo} disabled={historyIndex >= historyLength - 1}><Redo2 size={17} /></button>
              <button title="Delete selected" onClick={deleteSelected} disabled={!selectedId}><Trash2 size={17} /></button>
              <button title="Toggle snap grid" className={snapEnabled ? "active" : ""} onClick={() => setSnapEnabled((current) => !current)}><Grid3X3 size={17} /></button>
              <button title="Zoom out" onClick={() => setZoom((current) => Math.max(0.45, current - 0.1))}><ZoomOut size={17} /></button>
              <span>{Math.round(zoom * 100)}%</span>
              <button title="Zoom in" onClick={() => setZoom((current) => Math.min(1.3, current + 0.1))}><ZoomIn size={17} /></button>
            </div>
          </div>

          <div className="drawing-canvas-scroll">
            <div className="drawing-canvas-frame" style={{ width: CANVAS_WIDTH * zoom, height: CANVAS_HEIGHT * zoom }}>
              <Stage
                ref={stageRef}
                width={CANVAS_WIDTH * zoom}
                height={CANVAS_HEIGHT * zoom}
                scaleX={zoom}
                scaleY={zoom}
                onMouseDown={handlePointerDown}
                onTouchStart={handlePointerDown}
                onMouseMove={handlePointerMove}
                onTouchMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onTouchEnd={handlePointerUp}
              >
                <Layer ref={gridLayerRef} listening={false}>
                  <Rect width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="#ffffff" />
                  {Array.from({ length: Math.floor(CANVAS_WIDTH / GRID_SIZE) + 1 }, (_, index) => (
                    <Line key={`v-${index}`} points={[index * GRID_SIZE, 0, index * GRID_SIZE, CANVAS_HEIGHT]} stroke={index % 5 === 0 ? "#cfd7d3" : "#e8ecea"} strokeWidth={index % 5 === 0 ? 1 : 0.5} />
                  ))}
                  {Array.from({ length: Math.floor(CANVAS_HEIGHT / GRID_SIZE) + 1 }, (_, index) => (
                    <Line key={`h-${index}`} points={[0, index * GRID_SIZE, CANVAS_WIDTH, index * GRID_SIZE]} stroke={index % 5 === 0 ? "#cfd7d3" : "#e8ecea"} strokeWidth={index % 5 === 0 ? 1 : 0.5} />
                  ))}
                </Layer>
                <Layer>
                  {objects.map(renderObject)}
                  <Transformer ref={transformerRef} rotateEnabled={false} enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]} />
                </Layer>
              </Stage>
            </div>
          </div>
        </main>

        <aside className="drawing-side-panel">
          <section>
            <p className="eyebrow">Finding markers</p>
            <h2>Link the diagram</h2>
            <p>Select a finding, choose the marker tool, then place its report reference on the plan.</p>
            <label>Finding<select value={selectedFindingId} onChange={(event) => setSelectedFindingId(event.target.value)}>
              {!activeFindings.length ? <option value="">No findings available</option> : null}
              {activeFindings.map((finding) => <option key={finding.id} value={finding.id}>{finding.code} · {finding.title}</option>)}
            </select></label>
            <div className="marker-finding-list">
              {activeFindings.map((finding) => (
                <div key={finding.id} className={linkedFindingIds.has(finding.id) ? "linked" : ""}>
                  <span>{finding.code}</span><strong>{finding.title}</strong>
                  <small>{linkedFindingIds.has(finding.id) ? "On diagram" : "Not placed"}</small>
                </div>
              ))}
              {!activeFindings.length ? <div className="drawing-empty-side">Add findings first, or draw now and place markers later.</div> : null}
            </div>
          </section>

          <section>
            <p className="eyebrow">Workflow state</p>
            <h2>{status === "skipped" ? "Drawing skipped" : status === "complete" ? "Drawing complete" : "Draft in progress"}</h2>
            <p>A drawing is optional. Saving a version freezes both the editable source and the report PNG.</p>
            <button className="secondary-button full-width" disabled={isPublishing} onClick={() => publish("skipped")}>Mark as not required</button>
          </section>

          <section>
            <p className="eyebrow">Version history</p>
            <h2>{versions.length} saved version{versions.length === 1 ? "" : "s"}</h2>
            <div className="drawing-version-list">
              {versions.map((version) => (
                <div key={version.id}><strong>Version {version.version}</strong><span>{version.status}</span><small>{new Date(version.createdAt).toLocaleString()}</small></div>
              ))}
              {!versions.length ? <p>No report versions saved yet.</p> : null}
            </div>
          </section>

          <button className="drawing-clear-button" onClick={clearCanvas} disabled={!objects.length}><Trash2 size={15} /> Clear canvas</button>
        </aside>
      </div>
    </div>
  );
}
