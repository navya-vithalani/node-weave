import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Edge,
  Handle,
  MiniMap,
  Node,
  NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
} from '@xyflow/react';
import type { OriginalStructure } from '../types/schema';
import type { GraphNode } from './PhysicsGraph';

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
}

const treeNodeTypes = { treeCard: TreeCard };

function TreeCard({ data }: NodeProps<Node<TreeCardData>>) {
  const [detail, setDetail] = useState<'description' | 'points' | null>(null);
  const canShowPoints = data.points.length > 0;

  return (
    <div className={`tree-card tree-card--${data.kind}`}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <Handle type="source" position={Position.Right} isConnectable={false} />
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
  type: GraphNode['type'],
  name: string,
  summary: string,
  parentTopicId?: string,
  points?: string[]
): GraphNode {
  return { id, type, name, summary, parentTopicId, points };
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
}: TreeViewProps) {
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();

  const { nodes, edges } = useMemo(() => {
    const topics = structure.topics
      .map((topic, topicIndex) => ({ topic, topicIndex, id: `topic-${topicIndex}` }))
      .filter(({ id }) => !focusedBranchId || id === focusedBranchId);
    const allChildren = new Map<string, Array<{ node: GraphNode; id: string }>>();
    const schemaNodeIds = new Map<string, string>();

    for (const { topic, topicIndex, id: topicId } of topics) {
      schemaNodeIds.set(topic.id, topicId);
      const children: Array<{ node: GraphNode; id: string }> = [];
      if (expandedTopics.has(topicId)) {
        if (showSubtopics) {
          topic.subtopics.forEach((subtopic, subIndex) => {
            const id = `subtopic-${topicIndex}-${subIndex}`;
            schemaNodeIds.set(subtopic.id, id);
            children.push({
              id,
              node: makeGraphNode(id, 'subtopic', subtopic.name, subtopic.summary, topicId, subtopic.points),
            });
          });
        }
        topic.customInsights?.forEach((insight) => {
          const id = `insight-${topicIndex}-${insight.id}`;
          schemaNodeIds.set(insight.id, id);
          children.push({
            id,
            node: makeGraphNode(id, 'customInsight', insight.name, insight.summary, topicId),
          });
        });
      }
      allChildren.set(topicId, children);
    }

    const visibleNodes = new Map<string, GraphNode>();
    const topicNodes = topics.map(({ topic, id }) => {
      const graphNode = makeGraphNode(id, 'topic', topic.name, topic.summary);
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

    structure.topics.forEach((topic, topicIndex) => {
      if (focusedBranchId && focusedBranchId !== `topic-${topicIndex}`) return;
      if (allChildren.has(`topic-${topicIndex}`)) {
        visibleNodes.set(`topic-${topicIndex}`, makeGraphNode(
          `topic-${topicIndex}`,
          'topic',
          topic.name,
          topic.summary
        ));
      }
    });

    const rootIncluded = !focusedBranchId;
    const spans = topicNodes.map((topic) => Math.max(1, topic.children.length));
    const totalSpan = spans.reduce((sum, span) => sum + span, 0);
    const positions = new Map<string, { x: number; y: number }>();

    if (layout === 'left-right') {
      let cursor = -((totalSpan - 1) * 120) / 2;
      topicNodes.forEach((topic, index) => {
        const span = spans[index];
        const center = cursor + ((span - 1) * 120) / 2;
        positions.set(topic.id, { x: 300, y: center });
        topic.children.forEach(({ id }, childIndex) => {
          positions.set(id, { x: 620, y: cursor + childIndex * 120 });
        });
        cursor += span * 120;
      });
      if (rootIncluded) positions.set('session-root', { x: 0, y: 0 });
    } else if (layout === 'top-down') {
      const topicSpacing = 300;
      let cursor = -((totalSpan - 1) * topicSpacing) / 2;
      topicNodes.forEach((topic, index) => {
        const span = spans[index];
        const center = cursor + ((span - 1) * topicSpacing) / 2;
        positions.set(topic.id, { x: center, y: 220 });
        topic.children.forEach(({ id }, childIndex) => {
          positions.set(id, { x: cursor + childIndex * topicSpacing, y: 470 });
        });
        cursor += span * topicSpacing;
      });
      if (rootIncluded) positions.set('session-root', { x: 0, y: 0 });
    } else {
      const topicRadius = Math.max(360, topicNodes.length * 100);
      topicNodes.forEach((topic, topicIndex) => {
        const angle = (topicIndex / Math.max(1, topicNodes.length)) * Math.PI * 2 - Math.PI / 2;
        const topicX = Math.cos(angle) * topicRadius;
        const topicY = Math.sin(angle) * topicRadius;
        positions.set(topic.id, { x: topicX, y: topicY });
        const children = topic.children;
        children.forEach(({ id }, childIndex) => {
          const offset = (childIndex - (children.length - 1) / 2) * 0.3;
          const childAngle = angle + offset;
          positions.set(id, {
            x: topicX + Math.cos(childAngle) * 240,
            y: topicY + Math.sin(childAngle) * 240,
          });
        });
      });
      if (rootIncluded) positions.set('session-root', { x: 0, y: 0 });
    }

    const flowNodes: Node<TreeCardData>[] = [];
    if (rootIncluded) {
      flowNodes.push({
        id: 'session-root',
        type: 'treeCard',
        position: positions.get('session-root') ?? { x: 0, y: 0 },
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
      const topicPosition = positions.get(topic.id) ?? { x: 300, y: 0 };
      flowNodes.push({
        id: topic.id,
        type: 'treeCard',
        position: topicPosition,
        data: {
          title: topic.title,
          kind: topic.kind,
          summary: topic.graphNode.summary,
          points: [],
          childCount: topic.children.length || (showSubtopics
            ? (structure.topics[Number(topic.id.slice(6))]?.subtopics.length ?? 0)
              + (structure.topics[Number(topic.id.slice(6))]?.customInsights?.length ?? 0)
            : structure.topics[Number(topic.id.slice(6))]?.customInsights?.length ?? 0),
          expanded: expandedTopics.has(topic.id),
          onToggleChildren: () => onToggleTopic(topic.id),
        },
      });
    });

    childNodes.forEach((child) => {
      const position = positions.get(child.id) ?? { x: 620, y: 0 };
      flowNodes.push({
        id: child.id,
        type: 'treeCard',
        position,
        data: {
          title: child.title,
          kind: child.kind,
          summary: child.graphNode.summary,
          points: child.graphNode.points ?? [],
          childCount: 0,
          expanded: false,
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
        style: { stroke: 'var(--accent)', strokeWidth: 2 },
      }));
    }
    topicNodes.forEach((topic) => topic.children.forEach(({ id }) => flowEdges.push({
      id: `tree-${topic.id}-${id}`,
      source: topic.id,
      target: id,
      type: 'straight',
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
        const topicId = `topic-${topicIndex}`;
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
          id: `tree-connection-${index}`,
          source,
          target,
          type: 'default',
          data: { link: connection.link },
          style: { stroke: 'var(--magenta)', strokeWidth: 1.5, strokeDasharray: '6 5' },
        });
      });
    }

    return { nodes: flowNodes, edges: flowEdges };
  }, [
    structure,
    layout,
    showSubtopics,
    showConnections,
    expandedTopics,
    focusedBranchId,
    onToggleTopic,
    onNodeDetail,
  ]);

  useEffect(() => {
    if (!nodes.length || !nodesInitialized) return;
    void fitView({ padding: 0.2, duration: 350 });
  }, [fitView, focusedBranchId, layout, nodes.length, nodesInitialized]);

  useEffect(() => {
    if (fitRequest > 0) void fitView({ padding: 0.2, duration: 350 });
  }, [fitRequest, fitView]);

  useEffect(() => {
    if (nodesInitialized && focusNodeId && nodes.some((node) => node.id === focusNodeId)) {
      void fitView({ nodes: [{ id: focusNodeId }], padding: 0.6, duration: 450 });
    }
  }, [fitView, focusNodeId, nodes, nodesInitialized]);

  const handleNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node<TreeCardData>) => {
    if (node.data.graphNode) onNodeDetail(node.data.graphNode);
  }, [onNodeDetail]);

  return (
    <div className="dashboard-flow tree-view">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={treeNodeTypes}
        onNodeDoubleClick={handleNodeDoubleClick}
        fitView
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
