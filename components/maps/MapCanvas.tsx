'use client';

// Pan/zoom map canvas built on react-konva. Renders the map image, pointcrawl
// edges + nodes, and markers, all positioned from normalized (0–1) coordinates
// against the map's intrinsic width/height. Stateless about the data model — the
// parent passes display-ready labels and handles every mutation via callbacks.
//
// Konva touches `window` at import time, so this module must only ever be loaded
// client-side (MapsTab imports it via next/dynamic with ssr:false).

import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Circle, Text, Line, Group } from 'react-konva';
import useImage from 'use-image';
import type { CampaignMap } from '@/lib/maps/types';

const ICON_GLYPH: Record<string, string> = {
  pin: '📍',
  star: '⭐',
  sword: '⚔️',
  eye: '👁️',
  skull: '💀',
  house: '🏠',
  cave: '🕳️',
  tree: '🌲',
};

type Pos = { x: number; y: number };

type Props = {
  map: CampaignMap;
  selectedTool: 'select' | 'addMarker' | 'addNode' | 'addEdge';
  selectedId?: string | null;
  visibleLayerIds: Set<string>;
  readOnly?: boolean;
  onMarkerCreate?: (pos: Pos) => void;
  onMarkerClick?: (markerId: string, shiftKey: boolean) => void;
  onMarkerDrag?: (markerId: string, pos: Pos) => void;
  onNodeCreate?: (pos: Pos) => void;
  onNodeClick?: (nodeId: string, shiftKey: boolean) => void;
  onNodeDrag?: (nodeId: string, pos: Pos) => void;
  onEdgeCreate?: (fromNodeId: string, toNodeId: string) => void;
};

export default function MapCanvas(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [edgePending, setEdgePending] = useState<string | null>(null);
  const [image] = useImage(props.map.imageUrl ?? '', 'anonymous');

  const { width, height } = props.map;

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Fit-to-view once the container is measured. Keeps a freshly opened map fully
  // visible regardless of its intrinsic size.
  useEffect(() => {
    if (stageSize.width <= 0 || stageSize.height <= 0) return;
    const fit = Math.min(stageSize.width / width, stageSize.height / height);
    const s = Math.max(0.05, Math.min(1, fit));
    setScale(s);
    setPosition({ x: (stageSize.width - width * s) / 2, y: (stageSize.height - height * s) / 2 });
    // Re-fit when the map identity or container size changes.
  }, [stageSize.width, stageSize.height, width, height, props.map.id]);

  function handleWheel(e: any) {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const oldScale = scale;
    const pointer = stage.getPointerPosition();
    const mousePointTo = {
      x: (pointer.x - position.x) / oldScale,
      y: (pointer.y - position.y) / oldScale,
    };
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = Math.max(0.1, Math.min(8, oldScale * (1 + direction * 0.1)));
    setScale(newScale);
    setPosition({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  }

  function toNormalized(stage: any): Pos | null {
    const pointer = stage.getPointerPosition();
    const x = (pointer.x - position.x) / scale / width;
    const y = (pointer.y - position.y) / scale / height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }

  function handleStageClick(e: any) {
    if (props.readOnly) return;
    const stage = e.target.getStage();
    // Only treat clicks on empty canvas (the stage or the image) as "place".
    const onEmpty = e.target === stage || e.target.getClassName?.() === 'Image';
    if (!onEmpty) return;
    const pos = toNormalized(stage);
    if (!pos) return;
    if (props.selectedTool === 'addMarker') props.onMarkerCreate?.(pos);
    else if (props.selectedTool === 'addNode') props.onNodeCreate?.(pos);
  }

  function handleNodeClick(nodeId: string, shiftKey: boolean) {
    if (props.readOnly) return;
    if (props.selectedTool === 'addEdge' && props.onEdgeCreate) {
      if (!edgePending) setEdgePending(nodeId);
      else if (edgePending === nodeId) setEdgePending(null);
      else {
        props.onEdgeCreate(edgePending, nodeId);
        setEdgePending(null);
      }
      return;
    }
    props.onNodeClick?.(nodeId, shiftKey);
  }

  const draggableViewport = props.selectedTool === 'select';
  const draggableItems = !props.readOnly && props.selectedTool === 'select';
  const pc = props.map.pointcrawl;

  const cursor =
    props.selectedTool === 'addMarker' || props.selectedTool === 'addNode'
      ? 'crosshair'
      : props.selectedTool === 'addEdge'
        ? 'pointer'
        : 'grab';

  return (
    <div
      ref={containerRef}
      data-map-canvas
      className="size-full overflow-hidden bg-zinc-900"
      style={{ cursor }}
    >
      <Stage
        width={stageSize.width}
        height={stageSize.height}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        draggable={draggableViewport}
        onWheel={handleWheel}
        onClick={handleStageClick}
        onTap={handleStageClick}
        onDragEnd={(e) => {
          // Only the stage's own drag pans the viewport; item drags bubble here
          // too but target !== stage in that case.
          if (e.target === e.target.getStage()) {
            setPosition({ x: e.target.x(), y: e.target.y() });
          }
        }}
      >
        <Layer>
          {image && <KonvaImage image={image} width={width} height={height} listening={false} />}

          {pc?.edges
            .filter((e) => props.visibleLayerIds.has(e.layerId))
            .map((e) => {
              const a = pc.nodes.find((n) => n.id === e.fromNodeId);
              const b = pc.nodes.find((n) => n.id === e.toNodeId);
              if (!a || !b) return null;
              const x1 = a.x * width;
              const y1 = a.y * height;
              const x2 = b.x * width;
              const y2 = b.y * height;
              return (
                <Group key={e.id} listening={false}>
                  <Line
                    points={[x1, y1, x2, y2]}
                    stroke={e.hazardous ? '#ef4444' : '#94a3b8'}
                    strokeWidth={2 / scale}
                    dash={e.hazardous ? [6 / scale, 4 / scale] : undefined}
                  />
                  {e.label && (
                    <Text
                      x={(x1 + x2) / 2}
                      y={(y1 + y2) / 2 - 8 / scale}
                      text={e.label}
                      fontSize={12 / scale}
                      fill="#e5e7eb"
                    />
                  )}
                </Group>
              );
            })}

          {pc?.nodes
            .filter((n) => props.visibleLayerIds.has(n.layerId))
            .map((n) => {
              const selected = props.selectedId === n.id || edgePending === n.id;
              return (
                <Group
                  key={n.id}
                  x={n.x * width}
                  y={n.y * height}
                  draggable={draggableItems}
                  onClick={(e) => handleNodeClick(n.id, !!e.evt?.shiftKey)}
                  onTap={() => handleNodeClick(n.id, false)}
                  onDragEnd={(e) =>
                    props.onNodeDrag?.(n.id, { x: e.target.x() / width, y: e.target.y() / height })
                  }
                >
                  <Circle
                    radius={9 / scale}
                    fill={selected ? '#fbbf24' : '#a78bfa'}
                    stroke="#1e293b"
                    strokeWidth={2 / scale}
                  />
                  {n.label && (
                    <Text
                      text={n.label}
                      fontSize={12 / scale}
                      fill="#e5e7eb"
                      x={12 / scale}
                      y={-6 / scale}
                    />
                  )}
                </Group>
              );
            })}

          {props.map.markers
            .filter((m) => props.visibleLayerIds.has(m.layerId))
            .map((m) => {
              const selected = props.selectedId === m.id;
              const glyph = m.icon ? ICON_GLYPH[m.icon] : undefined;
              return (
                <Group
                  key={m.id}
                  x={m.x * width}
                  y={m.y * height}
                  draggable={draggableItems}
                  onClick={(e) => props.onMarkerClick?.(m.id, !!e.evt?.shiftKey)}
                  onTap={() => props.onMarkerClick?.(m.id, false)}
                  onDragEnd={(e) =>
                    props.onMarkerDrag?.(m.id, { x: e.target.x() / width, y: e.target.y() / height })
                  }
                >
                  <Circle
                    radius={11 / scale}
                    fill={m.color ?? '#f472b6'}
                    stroke={selected ? '#fde68a' : '#1e293b'}
                    strokeWidth={(selected ? 3 : 2) / scale}
                  />
                  {glyph && (
                    <Text
                      text={glyph}
                      fontSize={12 / scale}
                      x={-7 / scale}
                      y={-7 / scale}
                      listening={false}
                    />
                  )}
                  {m.label && (
                    <Text
                      text={m.label}
                      fontSize={12 / scale}
                      fill="#e5e7eb"
                      x={14 / scale}
                      y={-6 / scale}
                      listening={false}
                    />
                  )}
                </Group>
              );
            })}
        </Layer>
      </Stage>
    </div>
  );
}
