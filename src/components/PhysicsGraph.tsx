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
  insight: 16,
} as const;

// Force configuration
const FORCE_CONFIG = {
  linkStrength: 0.3,
  manyBodyStrength: -150,
  collidePadding: 4,
  centerStrength: 0.05,
};

interface PhysicsGraphProps {
  structure: OriginalStructure;
}

interface GraphNode {
  id: string;
  type: 'topic' | 'subtopic' | 'customInsight';
  name: string;
  summary: string;
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
      case 'subtopic': return 'var(--border-soft)';
      case 'insight': return 'var(--magenta)';
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
  parentTopicId?: string;
  modified?: boolean;
}

function useForceSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number
) {
  const [simulationNodes, setSimulationNodes] = useState<SimulationNode[]>([]);
  const [simulationEdges, setSimulationEdges] = useState<d3Force.SimulationLinkDatum<SimulationNode>[]>([]);
  const simulationRef = useRef<d3Force.Simulation<SimulationNode, undefined> | null>(null);

  useEffect(() => {
    if (nodes.length === 0) {
      setSimulationNodes([]);
      setSimulationEdges([]);
      return;
    }

    // Initialize positions at center with slight random spread
    const centerX = width / 2;
    const centerY = height / 2;
    const initializedNodes: SimulationNode[] = nodes.map((node) => ({
      ...node,
      nodeType: node.type,
      x: centerX + (Math.random() - 0.5) * 100,
      y: centerY + (Math.random() - 0.5) * 100,
    }));

    // Create d3-force simulation
    const simulation = d3Force.forceSimulation<SimulationNode>(initializedNodes)
      .force('link', d3Force.forceLink<SimulationNode, GraphEdge>()
        .id((d) => d.id)
        .strength(FORCE_CONFIG.linkStrength))
      .force('charge', d3Force.forceManyBody()
        .strength(FORCE_CONFIG.manyBodyStrength))
      .force('collide', d3Force.forceCollide()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .radius((d: any) => {
          const r = getNodeRadius(d.nodeType);
          return r + FORCE_CONFIG.collidePadding;
        }))
      .force('center', d3Force.forceCenter(width / 2, height / 2)
        .strength(FORCE_CONFIG.centerStrength));

    // Set up link force with edges
    // NB: d3-force mutates link objects (source/target → node refs), so pass a shallow copy
    // to keep `currentGraph.edges` pristine for later edge-type lookups.
    const linkForce = simulation.force('link') as d3Force.ForceLink<SimulationNode, GraphEdge>;
    linkForce.links(edges.map((e) => ({ ...e })));

    simulation.on('tick', () => {
      setSimulationNodes([...simulation.nodes()]);
      setSimulationEdges([...linkForce.links()]);
    });

    simulationRef.current = simulation;

    // Run simulation to near completion
    simulation.alpha(1).stop();

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

  return { simulationNodes, simulationEdges, restartSimulation };
}

function PhysicsGraphContent({ structure }: PhysicsGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [showSubtopics, setShowSubtopics] = useState(true);
  const [showTitles, setShowTitles] = useState(false);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [detailNode, setDetailNode] = useState<GraphNode | null>(null);
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);
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
    structure.connections.forEach((conn, i) => {
      const resolveNodeId = (id: string): string | null => {
        if (id.startsWith('topic-')) return id;
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
        edges.push({
          id: `edge-conn-${i}`,
          source: sourceId,
          target: targetId,
          type: 'connection',
        });
      }
    });

    return { nodes, edges };
  }, [baseGraph, subtopicIdMap, showSubtopics, expandedTopics, structure]);

  // Initialize force simulation
  const { simulationNodes, simulationEdges, restartSimulation } = useForceSimulation(
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

  // Restart simulation when graph topology changes
  useEffect(() => {
    restartSimulation(1);
  }, [currentGraph.nodes, currentGraph.edges, dimensions.width, dimensions.height, restartSimulation]);

  // Convert simulation state to React Flow nodes/edges
  const { flowNodes, flowEdges } = useMemo(() => {
    const nodes: Node[] = simulationNodes.map((node) => {
      const radius = getNodeRadius(node.nodeType);
      return {
        id: node.id,
        type: 'circle',
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

    // Lookup edge type by either endpoint ordering (connections and insight
    // edges are directional, hierarchical edges are parent→child)
    const edgeTypeByPair = new Map<string, GraphEdge['type']>();
    currentGraph.edges.forEach((e) => {
      edgeTypeByPair.set(`${e.source}|${e.target}`, e.type);
      edgeTypeByPair.set(`${e.target}|${e.source}`, e.type);
    });

    const edges: Edge[] = simulationEdges.map((edge) => {
      const sourceNode = edge.source as SimulationNode;
      const targetNode = edge.target as SimulationNode;
      const sourceId = sourceNode?.id ?? 'unknown';
      const targetId = targetNode?.id ?? 'unknown';

      const edgeType = edgeTypeByPair.get(`${sourceId}|${targetId}`) || 'hierarchical';

      return {
        id: `edge-${sourceId}-${targetId}`,
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

  // Handle node click (expand or select)
  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const now = Date.now();
    const lastClick = lastClickRef.current;
    const nodeId = node.id;

    if (lastClick && lastClick.id === nodeId && now - lastClick.time < DOUBLE_CLICK_DELAY) {
      // Double-click detected
      lastClickRef.current = null;

      // Find the graph node data
      const graphNode = currentGraph.nodes.find((n) => n.id === nodeId);
      if (graphNode) {
        setDetailNode(graphNode);
        restartSimulation(0.3); // Light reheat
      }
    } else {
      // Single click
      lastClickRef.current = { id: nodeId, time: now };

      // Toggle subtopics for a topic when the global "Sub" toggle is off
      if (nodeId.startsWith('topic-') && !showSubtopics) {
        setExpandedTopics((prev) => {
          const next = new Set(prev);
          if (next.has(nodeId)) {
            next.delete(nodeId);
          } else {
            next.add(nodeId);
          }
          return next;
        });
      }
    }
  }, [showSubtopics, currentGraph.nodes, restartSimulation]);

  // Toggle subtopics
  const handleToggleSubtopics = useCallback(() => {
    setShowSubtopics((prev) => !prev);
    restartSimulation(1);
  }, [restartSimulation]);

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
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
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
            if (nodeType === 'insight') return 'var(--magenta)';
            return 'var(--border)';
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