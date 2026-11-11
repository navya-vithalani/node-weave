import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  NodeProps,
  ReactFlowProvider,
  useReactFlow,
  useUpdateNodeInternals,
  Handle,
  Position,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { OriginalStructure } from '../types/schema';
import '../styles/dashboard.css';
import * as d3Force from 'd3-force';

// Node radii by type (pixels)
const NODE_RADIUS = {
  topic: 24,
  subtopic: 14,
  customInsight: 16,
} as const;

const HANDLE_POINT_COUNT = 24;
const SUBTOPIC_LINK_DISTANCE = 110;

// Force configuration
const FORCE_CONFIG = {
  linkStrength: 0.3,
  manyBodyStrength: -150,
  collidePadding: 4,
  centerStrength: 0.05,
  alphaDecay: 0.08,
};

interface PhysicsGraphProps {
  structure: OriginalStructure;
  onNodeDetail: (node: GraphNode) => void;
  showSubtopics: boolean;
  showConnections: boolean;
  fitRequest: number;
  focusNodeId: string | null;
  dimUnrelated: boolean;
  physicsPaused: boolean;
  reheatRequest: number;
  nodeScale: number;
}

export interface GraphNode {
  id: string;
  type: 'topic' | 'subtopic' | 'customInsight';
  name: string;
  summary: string;
  points?: string[];
  parentTopicId?: string;
  modified?: boolean;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'hierarchical' | 'connection' | 'insight';
  link: string;
}

// Get radius for a node type
function getNodeRadius(type: string, scale = 1): number {
  const radius = (NODE_RADIUS as Record<string, number>)[type];
  return (radius ?? 16) * scale;
}

function getConnectionHandles(
  source: SimulationNode | undefined,
  target: SimulationNode | undefined,
  fallback: { x: number; y: number }
): { sourceHandle: string; targetHandle: string } {
  const deltaX = (target?.x ?? fallback.x) - (source?.x ?? fallback.x);
  const deltaY = (target?.y ?? fallback.y) - (source?.y ?? fallback.y);
  const angle = Math.atan2(deltaY, deltaX);
  const sourceIndex = Math.round(
    ((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * HANDLE_POINT_COUNT
  ) % HANDLE_POINT_COUNT;
  const targetIndex = (sourceIndex + HANDLE_POINT_COUNT / 2) % HANDLE_POINT_COUNT;

  return {
    sourceHandle: `source-${sourceIndex}`,
    targetHandle: `target-${targetIndex}`,
  };
}

// Circle Node Component
function CircleNode({ data, selected, id }: NodeProps<Node>) {
  const nodeType = (data.nodeType as string) || 'topic';
  const radius = getNodeRadius(nodeType, Number(data.nodeScale ?? 1));

  const getStrokeColor = () => {
    switch (nodeType) {
      case 'topic': return 'var(--accent)';
      case 'subtopic': return 'color-mix(in srgb, var(--accent) 58%, var(--bg))';
      case 'customInsight': return 'var(--magenta)';
      default: return 'var(--accent)';
    }
  };
  const getFillColor = () => {
    switch (nodeType) {
      case 'topic': return 'var(--accent)';
      case 'subtopic': return 'color-mix(in srgb, var(--accent) 58%, var(--bg))';
      case 'customInsight': return 'color-mix(in srgb, var(--magenta) 72%, var(--panel))';
      default: return 'var(--accent)';
    }
  };

  return (
    <div
      className={`circle-node circle-node--${nodeType} ${selected ? 'circle-node--selected' : ''}`}
      style={{
        width: radius * 2,
        height: radius * 2,
        borderColor: getStrokeColor(),
      }}
      data-node-id={id}
    >
      <svg width={radius * 2} height={radius * 2} style={{ overflow: 'visible' }}>
        <circle
          cx={radius}
          cy={radius}
          r={radius - 2}
          fill={getFillColor()}
          stroke={getStrokeColor()}
          strokeWidth={nodeType === 'topic' ? 2 : 1.5}
        />
      </svg>
      {Array.from({ length: HANDLE_POINT_COUNT }, (_, index) => {
        const angle = (index / HANDLE_POINT_COUNT) * Math.PI * 2;
        const position = Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))
          ? (Math.cos(angle) >= 0 ? Position.Right : Position.Left)
          : (Math.sin(angle) >= 0 ? Position.Bottom : Position.Top);
        const radialOffset = ((radius - 2) / (radius * 2)) * 100;
        const handleStyle = {
          left: `${50 + Math.cos(angle) * radialOffset}%`,
          top: `${50 + Math.sin(angle) * radialOffset}%`,
          right: 'auto',
          bottom: 'auto',
          transform: 'translate(-50%, -50%)',
          width: 2,
          height: 2,
          opacity: 0,
          border: 0,
        };

        return [
          <Handle
            key={`source-${index}`}
            id={`source-${index}`}
            type="source"
            position={position}
            isConnectable={false}
            style={handleStyle}
          />,
          <Handle
            key={`target-${index}`}
            id={`target-${index}`}
            type="target"
            position={position}
            isConnectable={false}
            style={handleStyle}
          />,
        ];
      })}
      <div className="circle-node__tooltip" role="tooltip">
        <strong>{String(data.label ?? '')}</strong>
        {Boolean(data.summary) && <span>{String(data.summary)}</span>}
      </div>
    </div>
  );
}

const nodeTypes = {
  circle: CircleNode,
};

interface SimulationNode extends d3Force.SimulationNodeDatum {
  id: string;
  nodeType: 'topic' | 'subtopic' | 'customInsight';
  name: string;
  summary: string;
  points?: string[];
  parentTopicId?: string;
  modified?: boolean;
}

interface SimulationLink extends d3Force.SimulationLinkDatum<SimulationNode> {
  id: string;
  type: GraphEdge['type'];
  link: string;
}

function useForceSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  nodeScale: number,
  physicsPaused: boolean
) {
  const [simulationNodes, setSimulationNodes] = useState<SimulationNode[]>([]);
  const [simulationEdges, setSimulationEdges] = useState<SimulationLink[]>([]);
  const [simulationSettled, setSimulationSettled] = useState(false);
  const simulationRef = useRef<d3Force.Simulation<SimulationNode, undefined> | null>(null);
  const positionsRef = useRef(new Map<string, { x: number; y: number; vx: number; vy: number }>());

  useEffect(() => {
    if (nodes.length === 0) {
      setSimulationNodes([]);
      setSimulationEdges([]);
      setSimulationSettled(true);
      return;
    }

    setSimulationSettled(false);
    // Initialize positions at center with slight random spread
    const centerX = width / 2;
    const centerY = height / 2;
    const initializedNodes: SimulationNode[] = nodes.map((node) => {
      const previousPosition = positionsRef.current.get(node.id);
      const parentPosition = node.parentTopicId
        ? positionsRef.current.get(node.parentTopicId)
        : undefined;
      const seedPosition = previousPosition ?? parentPosition;

      return {
        ...node,
        nodeType: node.type,
        x: seedPosition
          ? seedPosition.x + (previousPosition ? 0 : (Math.random() - 0.5) * 24)
          : centerX + (Math.random() - 0.5) * 100,
        y: seedPosition
          ? seedPosition.y + (previousPosition ? 0 : (Math.random() - 0.5) * 24)
          : centerY + (Math.random() - 0.5) * 100,
        vx: previousPosition?.vx ?? 0,
        vy: previousPosition?.vy ?? 0,
      };
    });

    // Create d3-force simulation
    const simulation = d3Force.forceSimulation<SimulationNode>(initializedNodes)
      .alphaDecay(FORCE_CONFIG.alphaDecay)
      .force('link', d3Force.forceLink<SimulationNode, SimulationLink>()
        .id((d) => d.id)
        .distance((link) => link.type === 'hierarchical' ? SUBTOPIC_LINK_DISTANCE : 130)
        .strength((link) => link.type === 'hierarchical' ? 1 : FORCE_CONFIG.linkStrength))
      .force('charge', d3Force.forceManyBody<SimulationNode>()
        .strength((node) => node.nodeType === 'subtopic' ? -35 : FORCE_CONFIG.manyBodyStrength))
      .force('collide', d3Force.forceCollide<SimulationNode>()
        .radius((d) => {
          const r = getNodeRadius(d.nodeType, nodeScale);
          return r + FORCE_CONFIG.collidePadding;
        }))
      .force('center', d3Force.forceCenter(width / 2, height / 2)
        .strength(FORCE_CONFIG.centerStrength));

    // Set up link force with edges
    // d3-force mutates endpoints into node references, so keep graph data pristine.
    const linkForce = simulation.force('link') as d3Force.ForceLink<SimulationNode, SimulationLink>;
    linkForce.links(edges.map((edge) => ({ ...edge })));

    simulation.on('tick', () => {
      const currentNodes = simulation.nodes();
      positionsRef.current = new Map(currentNodes.map((node) => [
        node.id,
        { x: node.x ?? centerX, y: node.y ?? centerY, vx: node.vx ?? 0, vy: node.vy ?? 0 },
      ]));
      setSimulationNodes([...currentNodes]);
    });
    simulation.on('end', () => setSimulationSettled(true));
    if (physicsPaused) simulation.stop();

    simulationRef.current = simulation;
    setSimulationNodes([...initializedNodes]);
    setSimulationEdges(linkForce.links());

    return () => {
      simulation.stop();
      simulationRef.current = null;
    };
  }, [nodes, edges, width, height, nodeScale]);

  useEffect(() => {
    const simulation = simulationRef.current;
    if (!simulation) return;
    if (physicsPaused) simulation.stop();
    else simulation.alpha(Math.max(simulation.alpha(), 0.3)).restart();
  }, [physicsPaused]);

  // Expose simulation for manual restarts
  const restartSimulation = useCallback((alpha = 1) => {
    if (simulationRef.current) {
      simulationRef.current.alpha(alpha).restart();
    }
  }, []);

  return { simulationNodes, simulationEdges, simulationSettled, restartSimulation };
}

function PhysicsGraphContent({
  structure,
  onNodeDetail,
  showSubtopics,
  showConnections,
  fitRequest,
  focusNodeId,
  dimUnrelated,
  physicsPaused,
  reheatRequest,
  nodeScale,
}: PhysicsGraphProps) {
  const { fitView } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const containerRef = useRef<HTMLDivElement>(null);
  const hasInitialFitRef = useRef(false);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [edgeTooltip, setEdgeTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [collapsedTopics, setCollapsedTopics] = useState<Set<string>>(new Set());
  const pendingClickRef = useRef<{ id: string; timeout: number } | null>(null);
  const showSubtopicsRef = useRef(showSubtopics);
  showSubtopicsRef.current = showSubtopics;
  const DOUBLE_CLICK_DELAY = 300;

  // Build base graph (topics + insights only — no connections here)
  const baseGraph = useMemo(() => {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // Add topic nodes
    structure.topics.forEach((topic, topicIndex) => {
      nodes.push({
        id: `topic-${topicIndex}`,
        type: 'topic',
        name: topic.name,
        summary: topic.summary,
        modified: topic.modified,
      });
    });

    // Add insight nodes
    structure.topics.forEach((topic, topicIndex) => {
      if (topic.customInsights) {
        topic.customInsights.forEach((insight) => {
          nodes.push({
            id: `insight-${topicIndex}-${insight.id}`,
            type: 'customInsight',
            name: insight.name,
            summary: insight.summary,
            parentTopicId: `topic-${topicIndex}`,
            modified: true,
          });
          edges.push({
            id: `edge-insight-${topicIndex}-${insight.id}`,
            source: `insight-${topicIndex}-${insight.id}`,
            target: `topic-${topicIndex}`,
            type: 'insight',
            link: 'custom insight for this topic',
          });
        });
      }
    });

    return { nodes, edges };
  }, [structure]);

  // Build subtopic data-ID → position map (used for connection edge resolution)
  const subtopicIdMap = useMemo(() => {
    const map = new Map<string, { topicIndex: number; subIndex: number }>();
    structure.topics.forEach((topic, topicIndex) => {
      topic.subtopics.forEach((sub, subIndex) => {
        map.set(sub.id, { topicIndex, subIndex });
      });
    });
    return map;
  }, [structure]);

  const topicIdMap = useMemo(() => new Map(
    structure.topics.map((topic, topicIndex) => [topic.id, `topic-${topicIndex}`])
  ), [structure]);

  // Build current graph: topics + insights + subtopics + all edge types
  const currentGraph = useMemo(() => {
    const nodes: GraphNode[] = [...baseGraph.nodes];
    const edges: GraphEdge[] = [...baseGraph.edges];

    // Determine which topics should show subtopics
    const topicsWithSubtopics = new Set<string>();
    if (showSubtopics) {
      // The global toggle shows all topic children unless an individual topic is collapsed.
      structure.topics.forEach((_, topicIndex) => {
        const topicId = `topic-${topicIndex}`;
        if (!collapsedTopics.has(topicId)) topicsWithSubtopics.add(topicId);
      });
    } else {
      // Toggle OFF: show subtopics only for individually expanded topics
      expandedTopics.forEach((topicId) => {
        topicsWithSubtopics.add(topicId);
      });
    }

    // Add subtopic nodes + hierarchical edges for visible topics
    topicsWithSubtopics.forEach((topicId) => {
      const topicIndex = parseInt(topicId.replace('topic-', ''), 10);
      const topic = structure.topics[topicIndex];
      if (!topic) return;

      topic.subtopics.forEach((sub, subIndex) => {
        const subId = `subtopic-${topicIndex}-${subIndex}`;
        nodes.push({
          id: subId,
          type: 'subtopic',
          name: sub.name,
          summary: sub.summary,
          points: sub.points,
          parentTopicId: topicId,
          modified: sub.modified,
        });
        edges.push({
          id: `edge-sub-${topicIndex}-${subIndex}`,
          source: topicId,
          target: subId,
          type: 'hierarchical',
          link: 'is a subtopic of',
        });
      });
    });

    // Add cross-topic connection edges (resolving subtopic data IDs → node IDs)
    const collapsedConnectionPairs = new Set<string>();
    if (showConnections) structure.connections.forEach((conn, i) => {
      const resolveNodeId = (id: string): string | null => {
        const topicNodeId = topicIdMap.get(id);
        if (topicNodeId) return topicNodeId;
        const pos = subtopicIdMap.get(id);
        if (!pos) return null;
        const topicId = `topic-${pos.topicIndex}`;
        if (topicsWithSubtopics.has(topicId)) {
          return `subtopic-${pos.topicIndex}-${pos.subIndex}`;
        }
        return topicId;
      };

      const sourceId = resolveNodeId(conn.source);
      const targetId = resolveNodeId(conn.target);

      if (sourceId && targetId && sourceId !== targetId) {
        const sourceIsCollapsedTopic = sourceId.startsWith('topic-')
          && !topicsWithSubtopics.has(sourceId);
        const targetIsCollapsedTopic = targetId.startsWith('topic-')
          && !topicsWithSubtopics.has(targetId);
        const pairKey = [sourceId, targetId].sort().join('|');
        if (!showSubtopics && sourceIsCollapsedTopic && targetIsCollapsedTopic) {
          if (collapsedConnectionPairs.has(pairKey)) return;
          collapsedConnectionPairs.add(pairKey);
        }
        edges.push({
          id: `edge-conn-${i}`,
          source: sourceId,
          target: targetId,
          type: 'connection',
          link: conn.link,
        });
      }
    });

    return { nodes, edges };
  }, [baseGraph, subtopicIdMap, topicIdMap, showSubtopics, expandedTopics, collapsedTopics, showConnections, structure]);

  // Initialize force simulation
  const { simulationNodes, simulationEdges, simulationSettled, restartSimulation: restartForceSimulation } = useForceSimulation(
    currentGraph.nodes,
    currentGraph.edges,
    dimensions.width,
    dimensions.height,
    nodeScale,
    physicsPaused
  );

  // Update dimensions on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateDimensions = () => {
      const { width, height } = container.getBoundingClientRect();
      setDimensions({ width, height });
    };

    updateDimensions();
    const observer = new ResizeObserver(updateDimensions);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Convert simulation state to React Flow nodes/edges
  const { flowNodes, flowEdges } = useMemo(() => {
    const simulationNodeById = new Map(simulationNodes.map((node) => [node.id, node]));
    const nodes: Node[] = simulationNodes.map((node) => {
      const radius = getNodeRadius(node.nodeType, nodeScale);
      return {
        id: node.id,
        type: 'circle',
        width: radius * 2,
        height: radius * 2,
        position: {
          x: (node.x ?? dimensions.width / 2) - radius,
          y: (node.y ?? dimensions.height / 2) - radius,
        },
        data: {
          nodeType: node.nodeType,
          label: node.name,
          summary: node.summary,
          modified: node.modified,
          nodeScale,
        },
      };
    });

    const edges: Edge[] = simulationEdges.map((edge) => {
      const sourceId = typeof edge.source === 'object' ? edge.source.id : String(edge.source);
      const targetId = typeof edge.target === 'object' ? edge.target.id : String(edge.target);
      const edgeType = edge.type;
      const { sourceHandle, targetHandle } = getConnectionHandles(
        simulationNodeById.get(sourceId),
        simulationNodeById.get(targetId),
        { x: dimensions.width / 2, y: dimensions.height / 2 }
      );
      const isConnectedToFocus = !focusNodeId
        || sourceId === focusNodeId
        || targetId === focusNodeId;

      return {
        id: edge.id,
        source: sourceId,
        target: targetId,
        sourceHandle,
        targetHandle,
        type: edgeType === 'hierarchical' ? 'straight' : 'default',
        animated: edgeType !== 'hierarchical',
        data: { link: edge.link },
        style: {
          stroke: edgeType === 'insight' ? 'var(--magenta)' :
                  edgeType === 'connection' ? 'var(--accent)' :
                  'var(--accent)',
          strokeWidth: edgeType === 'hierarchical' ? 2 : 1.5,
          opacity: !dimUnrelated || isConnectedToFocus
            ? edgeType === 'hierarchical' ? 0.78 : 0.9
            : 0.12,
          strokeDasharray: edgeType === 'insight' ? '4 3' :
                           edgeType === 'connection' ? '8 4' :
                           undefined,
        },
      };
    });

    return { flowNodes: nodes, flowEdges: edges };
  }, [simulationNodes, simulationEdges, dimensions, nodeScale, focusNodeId, dimUnrelated]);

  const focusedNodeIds = useMemo(() => {
    if (!focusNodeId) return null;
    const connected = new Set([focusNodeId]);
    simulationEdges.forEach((edge) => {
      const sourceId = typeof edge.source === 'object' ? edge.source.id : String(edge.source);
      const targetId = typeof edge.target === 'object' ? edge.target.id : String(edge.target);
      if (sourceId === focusNodeId) connected.add(targetId);
      if (targetId === focusNodeId) connected.add(sourceId);
    });
    return connected;
  }, [focusNodeId, simulationEdges]);

  const visibleFlowNodes = useMemo(() => {
    if (!dimUnrelated || !focusedNodeIds) return flowNodes;
    return flowNodes.map((node) => ({
      ...node,
      style: {
        ...node.style,
        opacity: focusedNodeIds.has(node.id) ? 1 : 0.18,
      },
    }));
  }, [dimUnrelated, flowNodes, focusedNodeIds]);

  const restartSimulation = useCallback((alpha = 1) => {
    if (!physicsPaused) restartForceSimulation(alpha);
  }, [physicsPaused, restartForceSimulation]);

  const flowNodeIds = flowNodes.map((node) => node.id).join('|');

  useEffect(() => {
    if (!flowNodeIds) return;

    const frame = window.requestAnimationFrame(() => {
      updateNodeInternals(flowNodeIds.split('|'));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [flowNodeIds, nodeScale, updateNodeInternals]);

  useEffect(() => {
    if (!simulationSettled || flowNodes.length === 0 || hasInitialFitRef.current) return;

    const frame = window.requestAnimationFrame(() => {
      void fitView({ padding: 0.2, duration: 300 });
      hasInitialFitRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fitView, flowNodes.length, simulationSettled]);

  useEffect(() => {
    if (fitRequest > 0) void fitView({ padding: 0.2, duration: 300 });
  }, [fitRequest, fitView]);

  useEffect(() => {
    if (focusNodeId && flowNodeIds.split('|').includes(focusNodeId)) {
      void fitView({ nodes: [{ id: focusNodeId }], padding: 0.6, duration: 450 });
    }
  }, [fitView, focusNodeId, flowNodeIds]);

  useEffect(() => {
    const match = focusNodeId?.match(/^subtopic-(\d+)-/);
    if (!match) return;
    const topicId = `topic-${match[1]}`;
    setCollapsedTopics((previous) => {
      if (!previous.has(topicId)) return previous;
      const next = new Set(previous);
      next.delete(topicId);
      return next;
    });
    setExpandedTopics((previous) => new Set(previous).add(topicId));
  }, [focusNodeId]);

  useEffect(() => {
    if (reheatRequest > 0) restartSimulation(1);
  }, [reheatRequest, restartSimulation]);

  const toggleTopicSubtopics = useCallback((nodeId: string) => {
    if (!nodeId.startsWith('topic-')) return;
    if (showSubtopicsRef.current) {
      setCollapsedTopics((prev) => {
        const next = new Set(prev);
        if (next.has(nodeId)) next.delete(nodeId);
        else next.add(nodeId);
        return next;
      });
      return;
    }

    setExpandedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  useEffect(() => () => {
    if (pendingClickRef.current) {
      window.clearTimeout(pendingClickRef.current.timeout);
    }
  }, []);

  // Delay single-click expansion so a double-click can cancel it.
  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const pendingClick = pendingClickRef.current;
    if (pendingClick?.id === node.id) {
      window.clearTimeout(pendingClick.timeout);
      pendingClickRef.current = null;

      const graphNode = currentGraph.nodes.find((item) => item.id === node.id);
      if (graphNode) {
        onNodeDetail(graphNode);
        restartSimulation(0.3);
      }
      return;
    }

    if (pendingClick) {
      window.clearTimeout(pendingClick.timeout);
      toggleTopicSubtopics(pendingClick.id);
    }

    const timeout = window.setTimeout(() => {
      pendingClickRef.current = null;
      toggleTopicSubtopics(node.id);
    }, DOUBLE_CLICK_DELAY);
    pendingClickRef.current = { id: node.id, timeout };
  }, [currentGraph.nodes, onNodeDetail, restartSimulation, toggleTopicSubtopics]);

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

  return (
    <div className="dashboard-flow" ref={containerRef}>
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
        nodes={visibleFlowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        onEdgeMouseEnter={handleEdgeMouseEnter}
        onEdgeMouseLeave={() => setEdgeTooltip(null)}
        className="dashboard-flow__graph"
      >
        <Background color="var(--border-soft)" variant={BackgroundVariant.Dots} gap={40} size={1} />
        <Controls className="dashboard-flow__controls" />
        <MiniMap
          className="dashboard-flow__minimap"
          nodeColor={(node) => {
            const nodeType = node.data?.nodeType;
            if (nodeType === 'topic') return 'var(--accent)';
            if (nodeType === 'customInsight') return 'var(--magenta)';
            return 'var(--muted)';
          }}
        />

      </ReactFlow>
    </div>
  );
}

export default function PhysicsGraph(props: PhysicsGraphProps) {
  return (
    <ReactFlowProvider>
      <PhysicsGraphContent {...props} />
    </ReactFlowProvider>
  );
}