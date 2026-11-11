import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Edge,
  Handle,
  MiniMap,
  Node,
  NodeChange,
  NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useNodesInitialized,
  useReactFlow,
} from '@xyflow/react';
import type { OriginalStructure } from '../types/schema';
import type { GraphNode } from './PhysicsGraph';
import { getTopicInsights, graphNodeId } from '../lib/graphIds';

export type TreeLayout = 'left-right' | 'top-down' | 'radial';

interface TreeViewProps {
  structure: OriginalStructure;
  layout: TreeLayout;
  showSubtopics: boolean;
  showConnections: boolean;
  expandedTopics: Set<string>;
  onToggleTopic: (topicId: string) => void;
  focusedBranchId: string | null;
  focusNodeId: string | null;
  fitRequest: number;
  onNodeDetail: (node: GraphNode) => void;
  editMode: boolean;
  onNodeSelect: (node: GraphNode) => void;
  onConnectionSelect: (connectionId: string) => void;
}

interface TreeCardData extends Record<string, unknown> {
  title: string;
  kind: string;
  summary: string;
  points: string[];
  graphNode?: GraphNode;
  childCount: number;
  expanded: boolean;
  onToggleChildren?: () => void;
  onShowDetails?: () => void;
}

const treeNodeTypes = { treeCard: TreeCard };
const CARD_WIDTH = 230;
const CARD_HEIGHT = 104;
const CARD_PORTS = [
  ...[0.2, 0.4, 0.6, 0.8].map((x) => ({ x, y: 0, position: Position.Top })),
  ...[0.2, 0.4, 0.6, 0.8].map((y) => ({ x: 1, y, position: Position.Right })),
  ...[0.8, 0.6, 0.4, 0.2].map((x) => ({ x, y: 1, position: Position.Bottom })),
  ...[0.8, 0.6, 0.4, 0.2].map((y) => ({ x: 0, y, position: Position.Left })),
];

function getRectHandleIndex(dx: number, dy: number): number {
  const normalizedX = dx / (CARD_WIDTH / 2);
  const normalizedY = dy / (CARD_HEIGHT / 2);
  const scale = 1 / Math.max(Math.abs(normalizedX), Math.abs(normalizedY), 0.001);
  const x = 0.5 + normalizedX * scale * 0.5;
  const y = 0.5 + normalizedY * scale * 0.5;

  return CARD_PORTS.reduce((nearest, point, index) => {
    const distance = (point.x - x) ** 2 + (point.y - y) ** 2;
    return distance < nearest.distance ? { index, distance } : nearest;
  }, { index: 0, distance: Number.POSITIVE_INFINITY }).index;
}

function getRectHandles(source: { x: number; y: number }, target: { x: number; y: number }) {
  const sourceIndex = getRectHandleIndex(target.x - source.x, target.y - source.y);
  const targetIndex = getRectHandleIndex(source.x - target.x, source.y - target.y);
  return {
    sourceHandle: `tree-source-${sourceIndex}`,
    targetHandle: `tree-target-${targetIndex}`,
  };
}

function TreeCard({ data }: NodeProps<Node<TreeCardData>>) {
  const [detail, setDetail] = useState<'description' | 'points' | null>(null);
  const canShowPoints = data.points.length > 0;

  return (
    <div
      className={`tree-card tree-card--${data.kind}`}
      onDoubleClick={(event) => {
        event.stopPropagation();
        data.onShowDetails?.();
      }}
    >
      {CARD_PORTS.flatMap((port, index) => (
        <Fragment key={index}>
          <Handle
            id={`tree-source-${index}`}
            type="source"
            position={port.position}
            isConnectable={false}
            style={{
              left: `${port.x * 100}%`,
              top: `${port.y * 100}%`,
              width: 2,
              height: 2,
              border: 0,
              opacity: 0,
              transform: 'translate(-50%, -50%)',
            }}
          />
          <Handle
            id={`tree-target-${index}`}
            type="target"
            position={port.position}
            isConnectable={false}
            style={{
              left: `${port.x * 100}%`,
              top: `${port.y * 100}%`,
              width: 2,
              height: 2,
              border: 0,
              opacity: 0,
              transform: 'translate(-50%, -50%)',
            }}
          />
        </Fragment>
      ))}
      <div className="tree-card__heading">
        <span className="tree-card__kind">{data.kind}</span>
        <strong>{data.title}</strong>
      </div>
      <div className="tree-card__actions">
        {data.childCount > 0 && (
          <button
            type="button"
            className="tree-card__action nodrag nopan"
            aria-expanded={data.expanded}
            onClick={(event) => {
              event.stopPropagation();
              data.onToggleChildren?.();
            }}
          >
            {data.expanded ? 'Hide' : 'Show'} {data.childCount}
          </button>
        )}
        {data.summary && (
          <button
            type="button"
            className="tree-card__action nodrag nopan"
            aria-expanded={detail === 'description'}
            onClick={(event) => {
              event.stopPropagation();
              setDetail((current) => current === 'description' ? null : 'description');
            }}
          >
            About
          </button>
        )}
        {canShowPoints && (
          <button
            type="button"
            className="tree-card__action nodrag nopan"
            aria-expanded={detail === 'points'}
            onClick={(event) => {
              event.stopPropagation();
              setDetail((current) => current === 'points' ? null : 'points');
            }}
          >
            Points
          </button>
        )}
      </div>
      {detail && (
        <div className="tree-card__details">
          {detail === 'description' ? (
            <p>{data.summary}</p>
          ) : (
            <ul>{data.points.map((point) => <li key={point}>{point}</li>)}</ul>
          )}
        </div>
      )}
    </div>
  );
}

function makeGraphNode(
  id: string,
  schemaId: string,
  type: GraphNode['type'],
  name: string,
  summary: string,
  parentTopicId?: string,
  points?: string[]
): GraphNode {
  return { id, schemaId, type, name, summary, parentTopicId, points };
}

function TreeViewContent({
  structure,
  layout,
  showSubtopics,
  showConnections,
  expandedTopics,
  onToggleTopic,
  focusedBranchId,
  focusNodeId,
  fitRequest,
  onNodeDetail,
  editMode,
  onNodeSelect,
  onConnectionSelect,
}: TreeViewProps) {
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  const containerRef = useRef<HTMLDivElement>(null);
  const [edgeTooltip, setEdgeTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [manualPositions, setManualPositions] = useState<Record<TreeLayout, Record<string, { x: number; y: number }>>>({
    'left-right': {},
    'top-down': {},
    radial: {},
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const { nodes, edges } = useMemo(() => {
    const topics = structure.topics
      .map((topic, topicIndex) => ({ topic, topicIndex, id: graphNodeId('topic', topic.id) }))
      .filter(({ id }) => !focusedBranchId || id === focusedBranchId);
    const allChildren = new Map<string, Array<{ node: GraphNode; id: string }>>();
    const schemaNodeIds = new Map<string, string>();

    for (const { topic, id: topicId } of topics) {
      schemaNodeIds.set(topic.id, topicId);
      const children: Array<{ node: GraphNode; id: string }> = [];
      if (expandedTopics.has(topicId)) {
        if (showSubtopics) {
          topic.subtopics.forEach((subtopic) => {
            const id = graphNodeId('subtopic', subtopic.id);
            schemaNodeIds.set(subtopic.id, id);
            children.push({
              id,
              node: makeGraphNode(id, subtopic.id, 'subtopic', subtopic.name, subtopic.summary, topicId, subtopic.points),
            });
          });
        }
        getTopicInsights(structure, topic).forEach((insight) => {
          const id = graphNodeId('customInsight', insight.id);
          schemaNodeIds.set(insight.id, id);
          children.push({
            id,
            node: makeGraphNode(id, insight.id, 'customInsight', insight.name, insight.summary, topicId),
          });
        });
      }
      allChildren.set(topicId, children);
    }

    const visibleNodes = new Map<string, GraphNode>();
    const topicNodes = topics.map(({ topic, id }) => {
      const graphNode = makeGraphNode(id, topic.id, 'topic', topic.name, topic.summary);
      visibleNodes.set(id, graphNode);
      return { id, title: topic.name, kind: 'topic', graphNode, children: allChildren.get(id) ?? [] };
    });

    const childNodes = topicNodes.flatMap((topic) => topic.children.map(({ id, node }) => {
      visibleNodes.set(id, node);
      return {
        id,
        title: node.name,
        kind: node.type,
        graphNode: node,
        children: [] as Array<{ id: string; node: GraphNode }>,
        parentId: topic.id,
      };
    }));

    structure.topics.forEach((topic) => {
      const topicId = graphNodeId('topic', topic.id);
      if (focusedBranchId && focusedBranchId !== topicId) return;
      if (allChildren.has(topicId)) {
        visibleNodes.set(topicId, makeGraphNode(
          topicId,
          topic.id,
          'topic',
          topic.name,
          topic.summary
        ));
      }
    });

    const rootIncluded = !focusedBranchId;
    const positions = new Map<string, { x: number; y: number }>();

    if (layout === 'left-right') {
      const rowHeights = topicNodes.map((topic) => Math.max(160, topic.children.length * 112));
      let cursor = -rowHeights.reduce((sum, height) => sum + height, 0) / 2;
      topicNodes.forEach((topic, index) => {
        const height = rowHeights[index];
        const topicCenterY = cursor + height / 2;
        positions.set(topic.id, { x: 320, y: topicCenterY - CARD_HEIGHT / 2 });
        topic.children.forEach(({ id }, childIndex) => {
          const offset = (childIndex - (topic.children.length - 1) / 2) * 112;
          positions.set(id, { x: 620, y: topicCenterY + offset - CARD_HEIGHT / 2 });
        });
        cursor += height;
      });
      if (rootIncluded) positions.set('session-root', { x: -CARD_WIDTH / 2, y: -CARD_HEIGHT / 2 });
    } else if (layout === 'top-down') {
      const groupWidths = topicNodes.map(() => 280);
      let cursor = -groupWidths.reduce((sum, width) => sum + width, 0) / 2;
      topicNodes.forEach((topic, index) => {
        const width = groupWidths[index];
        const topicX = cursor + width / 2 - CARD_WIDTH / 2;
        positions.set(topic.id, { x: topicX, y: 220 - CARD_HEIGHT / 2 });
        topic.children.forEach(({ id }, childIndex) => {
          positions.set(id, { x: topicX, y: 420 + childIndex * 132 - CARD_HEIGHT / 2 });
        });
        cursor += width;
      });
      if (rootIncluded) positions.set('session-root', { x: -CARD_WIDTH / 2, y: -CARD_HEIGHT / 2 - 100 });
    } else {
      const maxChildren = Math.max(1, ...topicNodes.map((topic) => topic.children.length));
      const maxBranchWidth = Math.max(CARD_WIDTH, (maxChildren - 1) * 250);
      const topicRadius = Math.max(360, (topicNodes.length * maxBranchWidth * 0.65) / (Math.PI * 2));
      topicNodes.forEach((topic, topicIndex) => {
        const angle = (topicIndex / Math.max(1, topicNodes.length)) * Math.PI * 2 - Math.PI / 2;
        const topicX = Math.cos(angle) * topicRadius;
        const topicY = Math.sin(angle) * topicRadius;
        positions.set(topic.id, {
          x: topicX - CARD_WIDTH / 2,
          y: topicY - CARD_HEIGHT / 2,
        });
        const children = topic.children;
        children.forEach(({ id }, childIndex) => {
          const tangentOffset = (childIndex - (children.length - 1) / 2) * 250;
          positions.set(id, {
            x: topicX + Math.cos(angle) * 280 - Math.sin(angle) * tangentOffset - CARD_WIDTH / 2,
            y: topicY + Math.sin(angle) * 280 + Math.cos(angle) * tangentOffset - CARD_HEIGHT / 2,
          });
        });
      });
      if (rootIncluded) positions.set('session-root', { x: -CARD_WIDTH / 2, y: -CARD_HEIGHT / 2 });
    }

    const flowNodes: Node<TreeCardData>[] = [];
    if (rootIncluded) {
      flowNodes.push({
        id: 'session-root',
        type: 'treeCard',
        position: manualPositions[layout]['session-root'] ?? positions.get('session-root') ?? { x: 0, y: 0 },
        data: {
          title: structure.sessionName,
          kind: 'session',
          summary: '',
          points: [],
          childCount: 0,
          expanded: true,
        },
      });
    }

    topicNodes.forEach((topic) => {
      const sourceTopic = structure.topics.find((item) => item.id === topic.graphNode.schemaId);
      const topicPosition = manualPositions[layout][topic.id] ?? positions.get(topic.id) ?? { x: 320, y: 0 };
      flowNodes.push({
        id: topic.id,
        type: 'treeCard',
        position: topicPosition,
        width: CARD_WIDTH,
        data: {
          title: topic.title,
          kind: topic.kind,
          summary: topic.graphNode.summary,
          points: [],
          graphNode: topic.graphNode,
          childCount: topic.children.length || (sourceTopic
            ? (showSubtopics ? sourceTopic.subtopics.length : 0) + getTopicInsights(structure, sourceTopic).length
            : 0),
          expanded: expandedTopics.has(topic.id),
          onToggleChildren: () => onToggleTopic(topic.id),
          onShowDetails: () => onNodeDetail(topic.graphNode),
        },
      });
    });

    childNodes.forEach((child) => {
      const position = manualPositions[layout][child.id] ?? positions.get(child.id) ?? { x: 620, y: 0 };
      flowNodes.push({
        id: child.id,
        type: 'treeCard',
        position,
        width: CARD_WIDTH,
        data: {
          title: child.title,
          kind: child.kind,
          summary: child.graphNode.summary,
          points: child.graphNode.points ?? [],
          graphNode: child.graphNode,
          childCount: 0,
          expanded: false,
          onShowDetails: () => onNodeDetail(child.graphNode),
        },
      });
    });

    const flowEdges: Edge[] = [];
    if (rootIncluded) {
      topicNodes.forEach((topic) => flowEdges.push({
        id: `tree-root-${topic.id}`,
        source: 'session-root',
        target: topic.id,
        type: 'straight',
        data: { link: 'topic in this session' },
        style: { stroke: 'var(--accent)', strokeWidth: 2 },
      }));
    }
    topicNodes.forEach((topic) => topic.children.forEach(({ id }) => flowEdges.push({
      id: `tree-${topic.id}-${id}`,
      source: topic.id,
      target: id,
      type: 'straight',
      data: { link: 'is a subtopic of' },
      style: { stroke: 'var(--accent)', strokeWidth: 1.5 },
    })));

    if (showConnections) {
      const connectionPairs = new Set<string>();
      const resolveConnectionNode = (id: string): string | null => {
        const visibleId = schemaNodeIds.get(id);
        if (visibleId && visibleNodes.has(visibleId)) return visibleId;
        const topicIndex = structure.topics.findIndex((topic) =>
          topic.id === id || topic.subtopics.some((subtopic) => subtopic.id === id)
        );
        if (topicIndex < 0) return null;
        const topicId = graphNodeId('topic', structure.topics[topicIndex].id);
        const isSubtopic = structure.topics[topicIndex].subtopics.some((subtopic) => subtopic.id === id);
        const isExpanded = showSubtopics && expandedTopics.has(topicId);
        return isSubtopic && isExpanded ? null : topicId;
      };

      structure.connections.forEach((connection, index) => {
        const source = resolveConnectionNode(connection.source);
        const target = resolveConnectionNode(connection.target);
        if (!source || !target || source === target || !visibleNodes.has(source) || !visibleNodes.has(target)) return;
        const pairKey = [source, target].sort().join('|');
        if (connectionPairs.has(pairKey)) return;
        connectionPairs.add(pairKey);
        flowEdges.push({
          id: `tree-connection-${connection.id || index}`,
          source,
          target,
          type: 'default',
          data: { link: connection.link, connectionId: connection.id },
          style: { stroke: 'var(--magenta)', strokeWidth: 1.5, strokeDasharray: '6 5' },
        });
      });
    }

    const nodeCenters = new Map(flowNodes.map((node) => [
      node.id,
      { x: node.position.x + CARD_WIDTH / 2, y: node.position.y + CARD_HEIGHT / 2 },
    ]));
    const connectedEdges = flowEdges.map((edge) => {
      const sourceCenter = nodeCenters.get(edge.source);
      const targetCenter = nodeCenters.get(edge.target);
      return sourceCenter && targetCenter
        ? { ...edge, ...getRectHandles(sourceCenter, targetCenter) }
        : edge;
    });

    return { nodes: flowNodes, edges: connectedEdges };
  }, [
    structure,
    layout,
    showSubtopics,
    showConnections,
    expandedTopics,
    focusedBranchId,
    onToggleTopic,
    onNodeDetail,
    manualPositions,
  ]);

  const [renderNodes, setRenderNodes] = useState<Node<TreeCardData>[]>([]);
  useEffect(() => {
    setRenderNodes(nodes);
  }, [nodes]);

  useEffect(() => {
    if (!renderNodes.length || !nodesInitialized || !containerSize.width || !containerSize.height) return;
    void fitView({ padding: 0.2, duration: 350 });
  }, [containerSize.height, containerSize.width, fitView, focusedBranchId, layout, nodes.length, nodesInitialized, renderNodes.length]);

  useEffect(() => {
    if (fitRequest > 0) void fitView({ padding: 0.2, duration: 350 });
  }, [fitRequest, fitView]);

  useEffect(() => {
    if (nodesInitialized && focusNodeId && nodes.some((node) => node.id === focusNodeId)) {
      void fitView({ nodes: [{ id: focusNodeId }], padding: 0.6, duration: 450 });
    }
  }, [fitView, focusNodeId, nodes, nodesInitialized]);

  const handleEdgeMouseEnter = useCallback((event: React.MouseEvent, edge: Edge) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    const text = edge.data?.link;
    if (!bounds || typeof text !== 'string' || !text) return;
    setEdgeTooltip({
      text,
      x: Math.min(event.clientX - bounds.left + 12, bounds.width - 280),
      y: Math.min(event.clientY - bounds.top + 12, bounds.height - 70),
    });
  }, []);

  const handleNodesChange = useCallback((changes: NodeChange<Node<TreeCardData>>[]) => {
    setRenderNodes((current) => applyNodeChanges(changes, current));
    const movedNodes = changes.filter((change) => change.type === 'position' && change.position);
    if (movedNodes.length === 0) return;
    setManualPositions((previous) => {
      const positionsForLayout = { ...previous[layout] };
      movedNodes.forEach((change) => {
        if (change.type === 'position' && change.position) {
          positionsForLayout[change.id] = change.position;
        }
      });
      return { ...previous, [layout]: positionsForLayout };
    });
  }, [layout]);

  const saveNodePosition = useCallback((nodeId: string, position: { x: number; y: number }) => {
    setRenderNodes((current) => current.map((node) =>
      node.id === nodeId ? { ...node, position } : node
    ));
    setManualPositions((previous) => ({
      ...previous,
      [layout]: { ...previous[layout], [nodeId]: position },
    }));
  }, [layout]);

  const handleNodeDrag = useCallback((_: unknown, node: Node<TreeCardData>) => {
    saveNodePosition(node.id, node.position);
  }, [saveNodePosition]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node<TreeCardData>) => {
    if (editMode && node.data.graphNode) onNodeSelect(node.data.graphNode);
  }, [editMode, onNodeSelect]);

  const handleEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    const connectionId = edge.data?.connectionId;
    if (editMode && typeof connectionId === 'string') onConnectionSelect(connectionId);
  }, [editMode, onConnectionSelect]);

  return (
    <div className="dashboard-flow tree-view" ref={containerRef}>
      {edgeTooltip && (
        <div
          className="graph-edge-tooltip"
          style={{ left: Math.max(8, edgeTooltip.x), top: Math.max(8, edgeTooltip.y) }}
          role="tooltip"
        >
          {edgeTooltip.text}
        </div>
      )}
      <ReactFlow
        nodes={renderNodes}
        edges={edges}
        nodeTypes={treeNodeTypes}
        onNodesChange={handleNodesChange}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDrag}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onEdgeMouseEnter={handleEdgeMouseEnter}
        onEdgeMouseLeave={() => setEdgeTooltip(null)}
        nodesDraggable={editMode}
        fitView
        minZoom={0.1}
        fitViewOptions={{ padding: 0.2 }}
      >
        <Background color="var(--border-soft)" variant={BackgroundVariant.Dots} gap={40} size={1} />
        <Controls className="dashboard-flow__controls" />
        <MiniMap
          className="dashboard-flow__minimap"
          nodeColor={(node) => node.data?.kind === 'topic' ? 'var(--accent)' : 'var(--muted)'}
        />
      </ReactFlow>
    </div>
  );
}

export default function TreeView(props: TreeViewProps) {
  return (
    <ReactFlowProvider>
      <TreeViewContent {...props} />
    </ReactFlowProvider>
  );
}
