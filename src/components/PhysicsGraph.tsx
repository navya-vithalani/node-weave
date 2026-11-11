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
  MarkerType,
  Panel,
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
}

interface GraphNode {
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
}

interface DetailPanelProps {
  node: GraphNode | null;
  onClose: () => void;
}

// eslint-disable-next-line react/function-component-definition
function DetailPanel({ node, onClose }: DetailPanelProps) {
  if (!node) return null;

  return (
    <div className="detail-panel">
      <div className="detail-panel__header">
        <span className="detail-panel__type">{node.type}</span>
        <button className="detail-panel__close" onClick={onClose}>×</button>
      </div>
      <h3 className="detail-panel__name">{node.name}</h3>
      {node.summary && (
        <p className="detail-panel__summary">{node.summary}</p>
      )}
      {node.points && node.points.length > 0 && (
        <ul className="detail-panel__points">
          {node.points.map((point) => <li key={point}>{point}</li>)}
        </ul>
      )}
    </div>
  );
}

// Get radius for a node type
function getNodeRadius(type: string): number {
  const radius = (NODE_RADIUS as Record<string, number>)[type];
  return radius ?? 16;
}

// Circle Node Component
function CircleNode({ data, selected, id }: NodeProps<Node>) {
  const nodeType = (data.nodeType as string) || 'topic';
  const radius = getNodeRadius(nodeType);
  const showTitle = data.showTitle as boolean;

  // Get color based on node type
  const getColor = () => {
    switch (nodeType) {
      case 'topic': return 'var(--accent)';
      case 'subtopic': return 'var(--muted)';
      case 'customInsight': return 'var(--magenta)';
      default: return 'var(--accent)';
    }
  };

  return (
    <div
      className={`circle-node circle-node--${nodeType} ${selected ? 'circle-node--selected' : ''}`}
      style={{
        width: radius * 2,
        height: radius * 2,
        borderColor: getColor(),
      }}
      data-node-id={id}
    >
      <svg width={radius * 2} height={radius * 2} style={{ overflow: 'visible' }}>
        <circle
          cx={radius}
          cy={radius}
          r={radius - 2}
          fill="var(--panel)"
          stroke={getColor()}
          strokeWidth={nodeType === 'topic' ? 2 : 1.5}
        />
      </svg>
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={false}
        style={{ width: 1, height: 1, opacity: 0, border: 0 }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        style={{ width: 1, height: 1, opacity: 0, border: 0 }}
      />
      {showTitle && (
        <div className="circle-node__label">{String(data.label ?? '')}</div>
      )}
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
}

function useForceSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number
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
        .strength(FORCE_CONFIG.linkStrength))
      .force('charge', d3Force.forceManyBody()
        .strength(FORCE_CONFIG.manyBodyStrength))
      .force('collide', d3Force.forceCollide<SimulationNode>()
        .radius((d) => {
          const r = getNodeRadius(d.nodeType);
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

    simulationRef.current = simulation;
    setSimulationNodes([...initializedNodes]);
    setSimulationEdges(linkForce.links());

    return () => {
      simulation.stop();
      simulationRef.current = null;
    };
  }, [nodes, edges, width, height]);

  // Expose simulation for manual restarts
  const restartSimulation = useCallback((alpha = 1) => {
    if (simulationRef.current) {
      simulationRef.current.alpha(alpha).restart();
    }
  }, []);

  return { simulationNodes, simulationEdges, simulationSettled, restartSimulation };
}

function PhysicsGraphContent({ structure }: PhysicsGraphProps) {
  const { fitView } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const containerRef = useRef<HTMLDivElement>(null);
  const hasInitialFitRef = useRef(false);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [showSubtopics, setShowSubtopics] = useState(true);
  const [showTitles, setShowTitles] = useState(false);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [detailNode, setDetailNode] = useState<GraphNode | null>(null);
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
      // Toggle ON: show subtopics for ALL topics
      structure.topics.forEach((_, topicIndex) => {
        topicsWithSubtopics.add(`topic-${topicIndex}`);
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
        });
      });
    });

    // Add cross-topic connection edges (resolving subtopic data IDs → node IDs)
    const collapsedConnectionPairs = new Set<string>();
    structure.connections.forEach((conn, i) => {
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
        });
      }
    });

    return { nodes, edges };
  }, [baseGraph, subtopicIdMap, topicIdMap, showSubtopics, expandedTopics, structure]);

  // Initialize force simulation
  const { simulationNodes, simulationEdges, simulationSettled, restartSimulation } = useForceSimulation(
    currentGraph.nodes,
    currentGraph.edges,
    dimensions.width,
    dimensions.height
  );

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setDimensions({ width, height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Convert simulation state to React Flow nodes/edges
  const { flowNodes, flowEdges } = useMemo(() => {
    const nodes: Node[] = simulationNodes.map((node) => {
      const radius = getNodeRadius(node.nodeType);
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
          showTitle: showTitles,
          modified: node.modified,
        },
      };
    });

    const edges: Edge[] = simulationEdges.map((edge) => {
      const sourceId = typeof edge.source === 'object' ? edge.source.id : String(edge.source);
      const targetId = typeof edge.target === 'object' ? edge.target.id : String(edge.target);
      const edgeType = edge.type;

      return {
        id: edge.id,
        source: sourceId,
        target: targetId,
        type: 'smoothstep',
        animated: edgeType !== 'hierarchical',
        style: {
          stroke: edgeType === 'insight' ? 'var(--magenta)' :
                  edgeType === 'connection' ? 'var(--accent)' :
                  'var(--border-soft)',
          strokeWidth: edgeType === 'hierarchical' ? 1 : 1.5,
          strokeDasharray: edgeType === 'insight' ? '4 3' :
                           edgeType === 'connection' ? '8 4' :
                           undefined,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edgeType === 'insight' ? 'var(--magenta)' :
                 edgeType === 'connection' ? 'var(--accent)' :
                 'var(--border-soft)',
        },
      };
    });

    return { flowNodes: nodes, flowEdges: edges };
  }, [simulationNodes, simulationEdges, dimensions, showTitles, currentGraph.edges]);

  const flowNodeIds = flowNodes.map((node) => node.id).join('|');

  useEffect(() => {
    if (!flowNodeIds) return;

    const frame = window.requestAnimationFrame(() => {
      updateNodeInternals(flowNodeIds.split('|'));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [flowNodeIds, updateNodeInternals]);

  useEffect(() => {
    if (!simulationSettled || flowNodes.length === 0 || hasInitialFitRef.current) return;

    const frame = window.requestAnimationFrame(() => {
      void fitView({ padding: 0.2, duration: 300 });
      hasInitialFitRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [fitView, flowNodes.length, simulationSettled]);

  const expandTopic = useCallback((nodeId: string) => {
    if (!nodeId.startsWith('topic-') || showSubtopicsRef.current) return;
    setExpandedTopics((prev) => {
      if (prev.has(nodeId)) return prev;
      const next = new Set(prev);
      next.add(nodeId);
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
        setDetailNode(graphNode);
        restartSimulation(0.3);
      }
      return;
    }

    if (pendingClick) {
      window.clearTimeout(pendingClick.timeout);
      expandTopic(pendingClick.id);
    }

    const timeout = window.setTimeout(() => {
      pendingClickRef.current = null;
      expandTopic(node.id);
    }, DOUBLE_CLICK_DELAY);
    pendingClickRef.current = { id: node.id, timeout };
  }, [currentGraph.nodes, expandTopic, restartSimulation]);

  // Toggle subtopics
  const handleToggleSubtopics = useCallback(() => {
    if (showSubtopics) setExpandedTopics(new Set());
    setShowSubtopics(!showSubtopics);
    restartSimulation(1);
  }, [restartSimulation, showSubtopics]);

  // Toggle titles
  const handleToggleTitles = useCallback(() => {
    setShowTitles((prev) => !prev);
  }, []);

  // Close detail panel
  const handleCloseDetail = useCallback(() => {
    setDetailNode(null);
  }, []);

  return (
    <div className="dashboard-flow" ref={containerRef}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
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

        {/* Floating controls */}
        <Panel position="bottom-left">
          <div className="dashboard-flow__controls-floating">
            <label className="dashboard__subtopic-toggle">
              <input
                type="checkbox"
                checked={showSubtopics}
                onChange={handleToggleSubtopics}
              />
              <span>Sub</span>
            </label>
            <label className="dashboard__titles-toggle">
              <input
                type="checkbox"
                checked={showTitles}
                onChange={handleToggleTitles}
              />
              <span>Titles</span>
            </label>
          </div>
        </Panel>

        {/* Detail panel */}
        {detailNode && (
          <Panel position="top-right">
            <DetailPanel node={detailNode} onClose={handleCloseDetail} />
          </Panel>
        )}
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