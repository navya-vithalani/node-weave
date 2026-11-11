import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ChunkStore, Connection, CustomInsight, OriginalStructure, WorkingStructure } from '../types/schema';
import PhysicsGraph, { type GraphNode } from './PhysicsGraph';
import TreeView, { type TreeLayout } from './TreeView';
import DocView from './DocView';
import NodeEditor from './NodeEditor';
import ChatPanel from './ChatPanel';
import { getTopicInsights, graphNodeId } from '../lib/graphIds';
import { applyTheme, loadSavedTheme, THEMES } from '../lib/theme';
import type { ThemeName } from '../lib/theme';
import '../styles/dashboard.css';

interface DashboardProps {
  sessionName: string;
  structure: OriginalStructure;
  chunkStore: ChunkStore;
  customInsights?: CustomInsight[];
}

function createWorkingCopy(structure: OriginalStructure, additionalInsights: CustomInsight[] = []): WorkingStructure {
  const copy = JSON.parse(JSON.stringify(structure)) as OriginalStructure;
  const insights = [
    ...(copy.customInsights ?? []),
    ...copy.topics.flatMap((topic) => topic.customInsights ?? []),
    ...additionalInsights,
  ];
  const uniqueInsights = [...new Map(insights.map((insight) => [insight.id, insight])).values()];
  const topics = copy.topics.map((topic) => {
    const normalizedTopic = { ...topic };
    delete normalizedTopic.customInsights;
    return normalizedTopic;
  });

  return {
    ...copy,
    topics,
    modified: true,
    customInsights: uniqueInsights,
  };
}

interface NodeSelection {
  type: GraphNode['type'];
  schemaId: string;
}

type ViewMode = 'graph' | 'tree' | 'doc';

function getSearchableNodes(structure: OriginalStructure): GraphNode[] {
  return structure.topics.flatMap((topic) => {
    const topicId = graphNodeId('topic', topic.id);
    const topicNode: GraphNode = {
      id: topicId,
      schemaId: topic.id,
      type: 'topic',
      name: topic.name,
      summary: topic.summary,
    };
    const subtopicNodes: GraphNode[] = topic.subtopics.map((subtopic) => ({
      id: graphNodeId('subtopic', subtopic.id),
      schemaId: subtopic.id,
      type: 'subtopic',
      name: subtopic.name,
      summary: subtopic.summary,
      points: subtopic.points,
      parentTopicId: topicId,
    }));
    const insightNodes: GraphNode[] = getTopicInsights(structure, topic).map((insight) => ({
      id: graphNodeId('customInsight', insight.id),
      schemaId: insight.id,
      type: 'customInsight',
      name: insight.name,
      summary: insight.summary,
      parentTopicId: topicId,
    }));
    return [topicNode, ...subtopicNodes, ...insightNodes];
  });
}

export default function Dashboard(props: DashboardProps) {
  const [workingStructure, setWorkingStructure] = useState<WorkingStructure>(
    () => createWorkingCopy(props.structure, props.customInsights)
  );
  const [viewMode, setViewMode] = useState<ViewMode>('graph');
  const [editMode, setEditMode] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [detailNode, setDetailNode] = useState<GraphNode | null>(null);
  const [nodeSelection, setNodeSelection] = useState<NodeSelection | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportNotice, setExportNotice] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [showSubtopics, setShowSubtopics] = useState(true);
  const [showConnections, setShowConnections] = useState(true);
  const [nodeSearch, setNodeSearch] = useState('');
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [dimUnrelated, setDimUnrelated] = useState(false);
  const [physicsPaused, setPhysicsPaused] = useState(false);
  const [reheatRequest, setReheatRequest] = useState(0);
  const [nodeScale, setNodeScale] = useState(1);
  const [fitRequest, setFitRequest] = useState(0);
  const [treeLayout, setTreeLayout] = useState<TreeLayout>('left-right');
  const [expandedTopics, setExpandedTopics] = useState(
    () => new Set(props.structure.topics.map((topic) => graphNodeId('topic', topic.id)))
  );
  const [focusedBranchId, setFocusedBranchId] = useState('');
  const [docSearch, setDocSearch] = useState('');
  const [collapsibleSections, setCollapsibleSections] = useState(true);
  const [accentTheme, setAccentTheme] = useState<ThemeName>(() => loadSavedTheme() ?? 'orange');

  const searchableNodes = useMemo(() => getSearchableNodes(workingStructure), [workingStructure]);
  const selectedNode = nodeSelection
    ? searchableNodes.find((node) => node.type === nodeSelection.type && node.schemaId === nodeSelection.schemaId) ?? null
    : null;
  const selectedConnection = selectedConnectionId
    ? workingStructure.connections.find((connection) => connection.id === selectedConnectionId) ?? null
    : null;
  const searchMatches = useMemo(() => {
    const query = nodeSearch.trim().toLocaleLowerCase();
    return query
      ? searchableNodes.filter((node) => node.name.toLocaleLowerCase().includes(query)).slice(0, 8)
      : [];
  }, [nodeSearch, searchableNodes]);

  useEffect(() => {
    setWorkingStructure(createWorkingCopy(props.structure, props.customInsights));
    setExpandedTopics(new Set(props.structure.topics.map((topic) => graphNodeId('topic', topic.id))));
    setFocusNodeId(null);
    setFocusedBranchId('');
    setNodeSearch('');
    setDocSearch('');
    setNodeSelection(null);
    setSelectedConnectionId(null);
  }, [props.customInsights, props.structure]);

  useEffect(() => {
    applyTheme(accentTheme);
  }, [accentTheme]);

  const updateWorkingCopy = useCallback((update: (previous: WorkingStructure) => WorkingStructure) => {
    setWorkingStructure((previous) => ({ ...update(previous), modified: true }));
  }, []);

  const handleChatToggle = () => {
    if (detailNode || nodeSelection || selectedConnectionId) {
      setDetailNode(null);
      setNodeSelection(null);
      setSelectedConnectionId(null);
      setSidePanelOpen(true);
      return;
    }
    setSidePanelOpen((open) => !open);
  };

  const handleNodeDetail = useCallback((node: GraphNode) => {
    setDetailNode(node);
    setNodeSelection(null);
    setSelectedConnectionId(null);
    setSidePanelOpen(true);
  }, []);

  const handleChatSourceSelect = useCallback((sourceId: string) => {
    const node = searchableNodes.find((item) => item.schemaId === sourceId);
    if (!node) return;
    setFocusNodeId(node.id);
    setFocusedBranchId('');
    if (node.type === 'subtopic' && node.parentTopicId) {
      setShowSubtopics(true);
      setExpandedTopics((previous) => new Set(previous).add(node.parentTopicId!));
    }
    handleNodeDetail(node);
  }, [handleNodeDetail, searchableNodes]);

  const handleAddChatInsight = useCallback((text: string, sourceIds: string[]) => {
    const sourceId = sourceIds.find((id) =>
      workingStructure.topics.some((topic) =>
        topic.id === id || topic.subtopics.some((subtopic) => subtopic.id === id)
      )
    );
    const anchorTopicId = workingStructure.topics.find((topic) =>
      topic.id === sourceId || topic.subtopics.some((subtopic) => subtopic.id === sourceId)
    )?.id ?? workingStructure.topics[0]?.id;
    if (!anchorTopicId) return;

    const insight: CustomInsight = {
      id: crypto.randomUUID(),
      name: 'Insight from Miso',
      summary: text,
      anchorTopicId,
      createdAt: new Date().toISOString(),
      modified: true,
    };
    updateWorkingCopy((previous) => ({ ...previous, customInsights: [...previous.customInsights, insight] }));
    setExpandedTopics((previous) => new Set(previous).add(graphNodeId('topic', anchorTopicId)));
    setSidePanelOpen(true);
    setDetailNode(null);
    setNodeSelection(null);
  }, [updateWorkingCopy, workingStructure]);

  const handleNodeSelect = useCallback((node: GraphNode) => {
    if (!node.schemaId) return;
    setDetailNode(null);
    setNodeSelection({ type: node.type, schemaId: node.schemaId });
    setSelectedConnectionId(null);
    setSidePanelOpen(true);
  }, []);

  const handleConnectionSelect = useCallback((connectionId: string) => {
    setDetailNode(null);
    setNodeSelection(null);
    setSelectedConnectionId(connectionId);
    setConnectionError('');
    setSidePanelOpen(true);
  }, []);

  const handleSelectSearchResult = useCallback((node: GraphNode) => {
    setNodeSearch(node.name);
    setFocusNodeId(node.id);
    setFocusedBranchId('');
    const parentTopicId = node.parentTopicId;
    if (node.type === 'subtopic' && parentTopicId) {
      setShowSubtopics(true);
      setExpandedTopics((previous) => new Set(previous).add(parentTopicId));
    }
    if (viewMode === 'doc') setDocSearch(node.name);
  }, [viewMode]);

  const handleToggleTreeTopic = useCallback((topicId: string) => {
    setExpandedTopics((previous) => {
      const next = new Set(previous);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  }, []);

  const handleToggleAllTreeTopics = () => {
    const allExpanded = workingStructure.topics.every((topic) =>
      expandedTopics.has(graphNodeId('topic', topic.id))
    );
    setExpandedTopics(allExpanded
      ? new Set()
      : new Set(workingStructure.topics.map((topic) => graphNodeId('topic', topic.id))));
  };

  const handleEditModeToggle = () => {
    const nextMode = !editMode;
    setEditMode(nextMode);
    if (!nextMode) {
      setNodeSelection(null);
      setSelectedConnectionId(null);
    }
  };

  const handleNodeFieldUpdate = (field: 'name' | 'summary' | 'points', value: string | string[]) => {
    if (!nodeSelection) return;
    updateWorkingCopy((previous) => {
      if (nodeSelection.type === 'topic') {
        return {
          ...previous,
          topics: previous.topics.map((topic) =>
            topic.id === nodeSelection.schemaId
              ? field === 'name'
                ? { ...topic, name: String(value), modified: true }
                : field === 'summary'
                  ? { ...topic, summary: String(value), modified: true }
                  : topic
              : topic
          ),
        };
      }
      if (nodeSelection.type === 'subtopic') {
        return {
          ...previous,
          topics: previous.topics.map((topic) => ({
            ...topic,
            subtopics: topic.subtopics.map((subtopic) =>
              subtopic.id === nodeSelection.schemaId
                ? field === 'name'
                  ? { ...subtopic, name: String(value), modified: true }
                  : field === 'summary'
                    ? { ...subtopic, summary: String(value), modified: true }
                  : { ...subtopic, points: Array.isArray(value) ? value : [], modified: true }
                : subtopic
            ),
          })),
        };
      }
      return {
        ...previous,
        customInsights: previous.customInsights.map((insight) =>
          insight.id === nodeSelection.schemaId
            ? field === 'name'
              ? { ...insight, name: String(value), modified: true }
              : { ...insight, summary: String(value), modified: true }
            : insight
        ),
      };
    });
  };

  const handleNodeReparent = (newTopicId: string) => {
    if (!nodeSelection || nodeSelection.type === 'topic') return;
    const currentParentId = selectedNode?.type === 'customInsight'
      ? workingStructure.customInsights.find((insight) => insight.id === nodeSelection.schemaId)?.anchorTopicId
      : workingStructure.topics.find((topic) =>
        topic.subtopics.some((subtopic) => subtopic.id === nodeSelection.schemaId)
      )?.id;
    if (currentParentId === newTopicId) return;
    updateWorkingCopy((previous) => {
      if (nodeSelection.type === 'customInsight') {
        return {
          ...previous,
          customInsights: previous.customInsights.map((insight) =>
            insight.id === nodeSelection.schemaId
              ? { ...insight, anchorTopicId: newTopicId, modified: true }
              : insight
          ),
        };
      }

      let movedSubtopic: WorkingStructure['topics'][number]['subtopics'][number] | undefined;
      const topicsWithoutSubtopic = previous.topics.map((topic) => ({
        ...topic,
        subtopics: topic.subtopics.filter((subtopic) => {
          if (subtopic.id !== nodeSelection.schemaId) return true;
          movedSubtopic = subtopic;
          return false;
        }),
      }));
      if (!movedSubtopic) return previous;
      const sourceTopic = previous.topics.find((topic) =>
        topic.subtopics.some((subtopic) => subtopic.id === nodeSelection.schemaId)
      );
      return {
        ...previous,
        topics: topicsWithoutSubtopic.map((topic) => {
          if (topic.id === newTopicId) {
            return { ...topic, subtopics: [...topic.subtopics, { ...movedSubtopic!, modified: true }], modified: true };
          }
          return topic.id === sourceTopic?.id ? { ...topic, modified: true } : topic;
        }),
      };
    });
  };

  const handleMoveNode = (direction: -1 | 1) => {
    if (!nodeSelection || !selectedNode?.parentTopicId) return;
    const parentTopic = workingStructure.topics.find((topic) =>
      graphNodeId('topic', topic.id) === selectedNode.parentTopicId
    );
    if (!parentTopic) return;

    updateWorkingCopy((previous) => {
      if (nodeSelection.type === 'subtopic') {
        return {
          ...previous,
          topics: previous.topics.map((topic) => {
            if (topic.id !== parentTopic.id) return topic;
            const subtopics = [...topic.subtopics];
            const index = subtopics.findIndex((subtopic) => subtopic.id === nodeSelection.schemaId);
            const destination = index + direction;
            if (index < 0 || destination < 0 || destination >= subtopics.length) return topic;
            [subtopics[index], subtopics[destination]] = [subtopics[destination], subtopics[index]];
            subtopics[index] = { ...subtopics[index], modified: true };
            subtopics[destination] = { ...subtopics[destination], modified: true };
            return { ...topic, subtopics, modified: true };
          }),
        };
      }

      const insightIndexes = previous.customInsights
        .map((insight, index) => ({ insight, index }))
        .filter(({ insight }) => insight.anchorTopicId === parentTopic.id);
      const position = insightIndexes.findIndex(({ insight }) => insight.id === nodeSelection.schemaId);
      const target = insightIndexes[position + direction];
      if (position < 0 || !target) return previous;
      const currentIndex = insightIndexes[position].index;
      const targetIndex = target.index;
      const customInsights = [...previous.customInsights];
      [customInsights[currentIndex], customInsights[targetIndex]] = [customInsights[targetIndex], customInsights[currentIndex]];
      customInsights[currentIndex] = { ...customInsights[currentIndex], modified: true };
      customInsights[targetIndex] = { ...customInsights[targetIndex], modified: true };
      return { ...previous, customInsights };
    });
  };

  const handleDeleteNode = () => {
    if (!nodeSelection) return;
    const deletedIds = new Set([nodeSelection.schemaId]);
    updateWorkingCopy((previous) => {
      let topics = previous.topics;
      let customInsights = previous.customInsights;
      if (nodeSelection.type === 'topic') {
        const deletedTopic = previous.topics.find((topic) => topic.id === nodeSelection.schemaId);
        deletedTopic?.subtopics.forEach((subtopic) => deletedIds.add(subtopic.id));
        topics = previous.topics.filter((topic) => topic.id !== nodeSelection.schemaId);
        customInsights = customInsights.filter((insight) => {
          const anchored = insight.anchorTopicId === nodeSelection.schemaId || deletedIds.has(insight.anchorTopicId);
          if (anchored) deletedIds.add(insight.id);
          return !anchored;
        });
      } else if (nodeSelection.type === 'subtopic') {
        topics = previous.topics.map((topic) => ({
          ...topic,
          subtopics: topic.subtopics.filter((subtopic) => subtopic.id !== nodeSelection.schemaId),
          modified: topic.modified || topic.subtopics.some((subtopic) => subtopic.id === nodeSelection.schemaId),
        }));
        const parentTopicId = workingStructure.topics.find((topic) =>
          graphNodeId('topic', topic.id) === selectedNode?.parentTopicId
        )?.id;
        customInsights = customInsights.map((insight) =>
          insight.anchorTopicId === nodeSelection.schemaId
            ? { ...insight, anchorTopicId: parentTopicId ?? insight.anchorTopicId, modified: true }
            : insight
        );
      } else {
        customInsights = customInsights.filter((insight) => insight.id !== nodeSelection.schemaId);
      }
      return {
        ...previous,
        topics,
        customInsights,
        connections: previous.connections.filter((connection) =>
          !deletedIds.has(connection.source) && !deletedIds.has(connection.target)
        ),
      };
    });
    setNodeSelection(null);
  };

  const handleAddTopic = () => {
    const topic = { id: crypto.randomUUID(), name: 'New topic', summary: '', subtopics: [], modified: true };
    updateWorkingCopy((previous) => ({ ...previous, topics: [...previous.topics, topic] }));
    setExpandedTopics((previous) => new Set(previous).add(graphNodeId('topic', topic.id)));
    setFocusedBranchId('');
    setNodeSelection({ type: 'topic', schemaId: topic.id });
    setSelectedConnectionId(null);
    setSidePanelOpen(true);
  };

  const getSelectedParentTopic = () => {
    if (!selectedNode) return null;
    const parentId = selectedNode.type === 'topic'
      ? selectedNode.schemaId
      : workingStructure.topics.find((topic) => graphNodeId('topic', topic.id) === selectedNode.parentTopicId)?.id;
    return workingStructure.topics.find((topic) => topic.id === parentId) ?? null;
  };

  const handleAddSubtopic = () => {
    const parentTopic = getSelectedParentTopic();
    if (!parentTopic) return;
    const subtopic = {
      id: crypto.randomUUID(),
      name: 'New subtopic',
      summary: '',
      points: [],
      sourceRefs: [],
      modified: true,
    };
    updateWorkingCopy((previous) => ({
      ...previous,
      topics: previous.topics.map((topic) => topic.id === parentTopic.id
        ? { ...topic, subtopics: [...topic.subtopics, subtopic], modified: true }
        : topic),
    }));
    setShowSubtopics(true);
    setExpandedTopics((previous) => new Set(previous).add(graphNodeId('topic', parentTopic.id)));
    setFocusNodeId(graphNodeId('subtopic', subtopic.id));
    setNodeSelection({ type: 'subtopic', schemaId: subtopic.id });
    setSelectedConnectionId(null);
    setSidePanelOpen(true);
  };

  const handleAddInsight = () => {
    const parentTopic = getSelectedParentTopic();
    if (!parentTopic) return;
    const insight: CustomInsight = {
      id: crypto.randomUUID(),
      name: 'New insight',
      summary: '',
      anchorTopicId: parentTopic.id,
      createdAt: new Date().toISOString(),
      modified: true,
    };
    updateWorkingCopy((previous) => ({ ...previous, customInsights: [...previous.customInsights, insight] }));
    setExpandedTopics((previous) => new Set(previous).add(graphNodeId('topic', parentTopic.id)));
    setNodeSelection({ type: 'customInsight', schemaId: insight.id });
    setSelectedConnectionId(null);
    setSidePanelOpen(true);
  };

  const [connectionSource, setConnectionSource] = useState('');
  const [connectionTarget, setConnectionTarget] = useState('');
  const [connectionReason, setConnectionReason] = useState('');

  const handleAddConnection = () => {
    if (!connectionSource || !connectionTarget || connectionSource === connectionTarget) {
      setConnectionError('Choose two different nodes.');
      return;
    }
    if (!connectionReason.trim()) {
      setConnectionError('Add a short reason for this connection.');
      return;
    }
    const duplicate = workingStructure.connections.some((connection) =>
      [connection.source, connection.target].sort().join('|')
        === [connectionSource, connectionTarget].sort().join('|')
    );
    if (duplicate) {
      setConnectionError('A connection already exists between these nodes.');
      return;
    }
    const connection: Connection = {
      id: crypto.randomUUID(),
      source: connectionSource,
      target: connectionTarget,
      link: connectionReason.trim(),
      modified: true,
    };
    updateWorkingCopy((previous) => ({ ...previous, connections: [...previous.connections, connection] }));
    setConnectionSource('');
    setConnectionTarget('');
    setConnectionReason('');
    setConnectionError('');
  };

  const handleConnectionUpdate = (field: 'source' | 'target' | 'link', value: string) => {
    if (!selectedConnectionId) return;
    const current = workingStructure.connections.find((connection) => connection.id === selectedConnectionId);
    if (!current) return;
    const source = field === 'source' ? value : current.source;
    const target = field === 'target' ? value : current.target;
    if (source === target) {
      setConnectionError('A connection must link two different nodes.');
      return;
    }
    const duplicate = workingStructure.connections.some((connection) =>
      connection.id !== selectedConnectionId
      && [connection.source, connection.target].sort().join('|') === [source, target].sort().join('|')
    );
    if (duplicate) {
      setConnectionError('A connection already exists between these nodes.');
      return;
    }
    setConnectionError('');
    updateWorkingCopy((previous) => ({
      ...previous,
      connections: previous.connections.map((connection) =>
        connection.id === selectedConnectionId
          ? { ...connection, [field]: value, modified: true }
          : connection
      ),
    }));
  };

  const handleDeleteConnection = () => {
    if (!selectedConnectionId) return;
    updateWorkingCopy((previous) => ({
      ...previous,
      connections: previous.connections.filter((connection) => connection.id !== selectedConnectionId),
    }));
    setSelectedConnectionId(null);
  };

  const downloadJSON = (data: unknown, fileName: string): boolean => {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    } catch (error) {
      setExportNotice(`Export failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      return false;
    }
  };

  const safeSessionFileName = props.sessionName.replace(/[<>:"/\\|?*]+/g, '-').trim() || 'NodeWeave-session';
  const handleExport = (kind: 'original' | 'working' | 'both') => {
    setExportMenuOpen(false);
    let succeeded = true;
    if (kind === 'original' || kind === 'both') {
      succeeded = downloadJSON({
        original: props.structure,
        chunkStore: props.chunkStore,
      }, `${safeSessionFileName}-original.json`) && succeeded;
    }
    if (kind === 'working' || kind === 'both') {
      succeeded = downloadJSON({
        working: workingStructure,
        chunkStore: props.chunkStore,
      }, `${safeSessionFileName}-modified.json`) && succeeded;
    }
    if (!succeeded) return;
    const exportName = kind === 'both' ? 'both session files' : kind === 'original' ? 'the original session' : 'the modified session';
    setExportNotice(props.chunkStore.chunks.length
      ? `Exported ${exportName}, including ${props.chunkStore.chunks.length} source notes and their local embeddings.`
      : `Exported ${exportName}. This session has no source notes, so restored chat will use the knowledge map only.`);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && searchMatches[0]) {
      event.preventDefault();
      handleSelectSearchResult(searchMatches[0]);
    }
  };

  return (
    <main className={`dashboard ${editMode ? 'dashboard--editing' : ''}`}>
      <header className={`dashboard__header ${editMode ? 'dashboard__header--editing' : ''}`}>
        <div className="dashboard__header-left">
          <span className="terminal-label">SESSION</span>
          <h1 className="dashboard__title">{props.sessionName}</h1>
        </div>
        <div className="dashboard__header-center">
          <button
            type="button"
            className={`dashboard__mode-btn dashboard__chat-toggle ${sidePanelOpen ? 'dashboard__mode-btn--active' : ''}`}
            onClick={handleChatToggle}
            aria-pressed={sidePanelOpen && !detailNode && !nodeSelection && !selectedConnectionId}
          >
            Chat
          </button>
          <label className="dashboard__theme-picker">
            <span className="sr-only">Accent color</span>
            <select
              aria-label="Accent color"
              value={accentTheme}
              onChange={(event) => setAccentTheme(event.target.value as ThemeName)}
            >
              {(Object.keys(THEMES) as ThemeName[]).map((theme) => (
                <option key={theme} value={theme}>{theme[0].toUpperCase() + theme.slice(1)}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`dashboard__edit-btn ${editMode ? 'dashboard__edit-btn--active' : ''}`}
            onClick={handleEditModeToggle}
            aria-pressed={editMode}
          >
            {editMode ? 'View' : 'Edit'}
          </button>
          <div className="dashboard__export">
            <button
              type="button"
              className="dashboard__export-btn"
              aria-expanded={exportMenuOpen}
              onClick={() => setExportMenuOpen((open) => !open)}
            >
              Export
            </button>
            {exportMenuOpen && (
              <div className="dashboard__export-menu" role="menu" aria-label="Export session JSON">
                <button type="button" role="menuitem" onClick={() => handleExport('original')}>Original JSON</button>
                <button type="button" role="menuitem" onClick={() => handleExport('working')}>Modified JSON</button>
                <button type="button" role="menuitem" onClick={() => handleExport('both')}>Both JSON files</button>
                <p>Includes source notes and local embeddings when available.</p>
              </div>
            )}
          </div>
        </div>
      </header>
      {exportNotice && <div className="dashboard__export-notice" role="status">{exportNotice}</div>}

      <div className={`dashboard__content ${controlsOpen ? '' : 'dashboard__content--controls-collapsed'} ${sidePanelOpen ? '' : 'dashboard__content--chat-closed'} ${editMode ? 'dashboard__content--editing' : ''}`}>
        <aside className={`dashboard__controls-panel ${controlsOpen ? '' : 'dashboard__controls-panel--collapsed'}`}>
          <button
            type="button"
            className="controls-panel__collapse"
            onClick={() => setControlsOpen((open) => !open)}
            aria-label={controlsOpen ? 'Collapse controls panel' : 'Expand controls panel'}
            aria-expanded={controlsOpen}
          >
            {controlsOpen ? '‹' : '☷'}
          </button>

          {controlsOpen && (
            <div className="controls-panel__body">
              <div className="controls-panel__title">
                <span className="terminal-label">EXPLORE</span>
                <strong>View & controls</strong>
              </div>

              <section className="controls-panel__section">
                <h2>View</h2>
                <div className="controls-panel__view-options" role="group" aria-label="Select view">
                  {(['graph', 'tree', 'doc'] as const).map((view) => (
                    <button
                      type="button"
                      key={view}
                      className={`controls-panel__view-btn ${viewMode === view ? 'controls-panel__view-btn--active' : ''}`}
                      onClick={() => setViewMode(view)}
                      aria-pressed={viewMode === view}
                    >
                      {view === 'doc' ? 'Doc' : view[0].toUpperCase() + view.slice(1)}
                    </button>
                  ))}
                </div>
              </section>

              <section className="controls-panel__section">
                <h2>All views</h2>
                <label className="controls-panel__check">
                  <input type="checkbox" checked={showSubtopics} onChange={(event) => setShowSubtopics(event.target.checked)} />
                  <span>Show subtopics</span>
                </label>
                <label className="controls-panel__check">
                  <input type="checkbox" checked={showConnections} onChange={(event) => setShowConnections(event.target.checked)} />
                  <span>Show cross-topic connections</span>
                </label>
                <div className="controls-panel__field">
                  <label htmlFor="node-search">Find a node</label>
                  <input
                    id="node-search"
                    type="search"
                    value={nodeSearch}
                    onChange={(event) => {
                      setNodeSearch(event.target.value);
                      setFocusNodeId(null);
                    }}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Search topics..."
                  />
                  {searchMatches.length > 0 && !focusNodeId && (
                    <div className="controls-panel__search-results" role="listbox" aria-label="Matching nodes">
                      {searchMatches.map((node) => (
                        <button
                          type="button"
                          role="option"
                          key={node.id}
                          onClick={() => handleSelectSearchResult(node)}
                        >
                          <span>{node.name}</span>
                          <small>{node.type}</small>
                        </button>
                      ))}
                    </div>
                  )}
                  {focusNodeId && (
                    <button type="button" className="controls-panel__text-btn" onClick={() => {
                      setFocusNodeId(null);
                      setNodeSearch('');
                    }}>
                      Clear focus
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className="controls-panel__button"
                  onClick={() => setFitRequest((request) => request + 1)}
                  disabled={viewMode === 'doc'}
                >
                  Fit / reset view
                </button>
              </section>

              {viewMode === 'graph' && (
                <section className="controls-panel__section">
                  <h2>Graph</h2>
                  <label className="controls-panel__check">
                    <input type="checkbox" checked={dimUnrelated} onChange={(event) => setDimUnrelated(event.target.checked)} />
                    <span>Focus node; dim unrelated</span>
                  </label>
                  <div className="controls-panel__button-row">
                    <button type="button" className="controls-panel__button" onClick={() => setPhysicsPaused((paused) => !paused)}>
                      {physicsPaused ? 'Resume physics' : 'Pause physics'}
                    </button>
                    <button type="button" className="controls-panel__button" onClick={() => setReheatRequest((request) => request + 1)} disabled={physicsPaused}>
                      Reheat
                    </button>
                  </div>
                  <div className="controls-panel__field">
                    <label htmlFor="node-size">Node size</label>
                    <select id="node-size" value={nodeScale} onChange={(event) => setNodeScale(Number(event.target.value))}>
                      <option value={0.8}>Small</option>
                      <option value={1}>Default</option>
                      <option value={1.3}>Large</option>
                    </select>
                  </div>
                </section>
              )}

              {viewMode === 'tree' && (
                <section className="controls-panel__section">
                  <h2>Tree</h2>
                  <div className="controls-panel__field">
                    <label htmlFor="tree-layout">Layout</label>
                    <select id="tree-layout" value={treeLayout} onChange={(event) => setTreeLayout(event.target.value as TreeLayout)}>
                      <option value="left-right">Root left → branches right</option>
                      <option value="top-down">Root top → branches down</option>
                      <option value="radial">Radial around root</option>
                    </select>
                  </div>
                  <button type="button" className="controls-panel__button" onClick={handleToggleAllTreeTopics}>
                    {workingStructure.topics.every((topic) => expandedTopics.has(graphNodeId('topic', topic.id)))
                      ? 'Collapse all branches'
                      : 'Expand all branches'}
                  </button>
                  <div className="controls-panel__field">
                    <label htmlFor="tree-focus">Focus a branch</label>
                    <select id="tree-focus" value={focusedBranchId} onChange={(event) => setFocusedBranchId(event.target.value)}>
                      <option value="">All topics</option>
                      {workingStructure.topics.map((topic) => (
                        <option key={topic.id} value={graphNodeId('topic', topic.id)}>{topic.name}</option>
                      ))}
                    </select>
                  </div>
                  <p className="controls-panel__hint">Use About and Points on each card to expand details. Dragging works in both modes and is not included in JSON.</p>
                </section>
              )}

              {viewMode === 'doc' && (
                <section className="controls-panel__section">
                  <h2>Document</h2>
                  <label className="controls-panel__check">
                    <input type="checkbox" checked={collapsibleSections} onChange={(event) => setCollapsibleSections(event.target.checked)} />
                    <span>Foldable reading sections</span>
                  </label>
                  <div className="controls-panel__field">
                    <label htmlFor="doc-search">Search document</label>
                    <input
                      id="doc-search"
                      type="search"
                      value={docSearch}
                      onChange={(event) => setDocSearch(event.target.value)}
                      placeholder="Search document..."
                    />
                  </div>
                </section>
              )}

              {editMode && (
                <section className="controls-panel__section controls-panel__edit-section">
                  <h2>Edit working copy</h2>
                  <p className="controls-panel__hint">Changes autosave to the modified copy. Dragging only changes this view.</p>
                  <div className="controls-panel__button-row">
                    <button type="button" className="controls-panel__button" onClick={handleAddTopic}>Add topic</button>
                    <button type="button" className="controls-panel__button" onClick={handleAddSubtopic} disabled={!getSelectedParentTopic()}>
                      Add subtopic
                    </button>
                    <button type="button" className="controls-panel__button" onClick={handleAddInsight} disabled={!getSelectedParentTopic()}>
                      Add insight
                    </button>
                  </div>
                  {!getSelectedParentTopic() && (
                    <p className="controls-panel__hint">Select a topic or one of its children to add a subtopic or insight.</p>
                  )}
                  <div className="node-editor__connection-form">
                    <strong>Add cross-topic connection</strong>
                    <label className="node-editor__field">
                      <span>From</span>
                      <select value={connectionSource} onChange={(event) => setConnectionSource(event.target.value)}>
                        <option value="">Choose a node</option>
                        {searchableNodes.map((node) => <option key={`${node.type}-${node.schemaId}`} value={node.schemaId}>{node.name}</option>)}
                      </select>
                    </label>
                    <label className="node-editor__field">
                      <span>To</span>
                      <select value={connectionTarget} onChange={(event) => setConnectionTarget(event.target.value)}>
                        <option value="">Choose a node</option>
                        {searchableNodes.map((node) => <option key={`${node.type}-${node.schemaId}`} value={node.schemaId}>{node.name}</option>)}
                      </select>
                    </label>
                    <label className="node-editor__field">
                      <span>Why they connect</span>
                      <input value={connectionReason} onChange={(event) => setConnectionReason(event.target.value)} />
                    </label>
                    {connectionError && <p className="node-editor__error" role="alert">{connectionError}</p>}
                    <button type="button" className="controls-panel__button" onClick={handleAddConnection}>Add connection</button>
                  </div>
                </section>
              )}
            </div>
          )}
        </aside>

        <section className={`dashboard__view ${editMode ? 'dashboard__view--editing' : ''}`} aria-label={`${viewMode} view`}>
          {viewMode === 'graph' && (
            <PhysicsGraph
              structure={workingStructure}
              onNodeDetail={handleNodeDetail}
              editMode={editMode}
              onNodeSelect={handleNodeSelect}
              onConnectionSelect={handleConnectionSelect}
              showSubtopics={showSubtopics}
              showConnections={showConnections}
              fitRequest={fitRequest}
              focusNodeId={focusNodeId}
              dimUnrelated={dimUnrelated}
              physicsPaused={physicsPaused}
              reheatRequest={reheatRequest}
              nodeScale={nodeScale}
            />
          )}
          {viewMode === 'tree' && (
            <TreeView
              structure={workingStructure}
              layout={treeLayout}
              showSubtopics={showSubtopics}
              showConnections={showConnections}
              expandedTopics={expandedTopics}
              onToggleTopic={handleToggleTreeTopic}
              focusedBranchId={focusedBranchId || null}
              focusNodeId={focusNodeId}
              fitRequest={fitRequest}
              onNodeDetail={handleNodeDetail}
              editMode={editMode}
              onNodeSelect={handleNodeSelect}
              onConnectionSelect={handleConnectionSelect}
            />
          )}
          {viewMode === 'doc' && (
            <DocView
              structure={workingStructure}
              showSubtopics={showSubtopics}
              showConnections={showConnections}
              searchTerm={docSearch}
              collapsibleSections={collapsibleSections}
            />
          )}
        </section>

        <aside
          className={`dashboard__side-panel panel ${detailNode || selectedNode || selectedConnection ? 'dashboard__side-panel--detail' : 'dashboard__chat'}`}
          style={{ display: sidePanelOpen ? undefined : 'none' }}
          aria-label="Chat and details panel"
        >
          <div
            className="dashboard__chat-slot"
            hidden={Boolean(detailNode || (editMode && (selectedNode || selectedConnection)))}
          >
            <ChatPanel
              structure={workingStructure}
              chunkStore={props.chunkStore}
              onAddInsight={handleAddChatInsight}
              onSelectSource={handleChatSourceSelect}
            />
          </div>
            {editMode && selectedNode ? (
              <>
                <div className="dashboard__chat-header">
                  <span className="terminal-label">EDIT {selectedNode.type.toUpperCase()}</span>
                  <button
                    type="button"
                    className="detail-panel__close"
                    onClick={() => setNodeSelection(null)}
                    aria-label="Close node editor"
                  >
                    ×
                  </button>
                </div>
                <NodeEditor
                  key={`${selectedNode.type}-${selectedNode.schemaId}`}
                  node={selectedNode}
                  structure={workingStructure}
                  onUpdate={handleNodeFieldUpdate}
                  onReparent={handleNodeReparent}
                  onMove={handleMoveNode}
                  onDelete={handleDeleteNode}
                />
              </>
            ) : editMode && selectedConnection ? (
              <>
                <div className="dashboard__chat-header">
                  <span className="terminal-label">EDIT CONNECTION</span>
                  <button
                    type="button"
                    className="detail-panel__close"
                    onClick={() => setSelectedConnectionId(null)}
                    aria-label="Close connection editor"
                  >
                    ×
                  </button>
                </div>
                <div className="node-editor">
                  <div className="node-editor__context">
                    <span>Changes save to the modified copy as you type.</span>
                  </div>
                  <label className="node-editor__field">
                    <span>From</span>
                    <select value={selectedConnection.source} onChange={(event) => handleConnectionUpdate('source', event.target.value)}>
                      {searchableNodes.map((node) => <option key={`${node.type}-${node.schemaId}`} value={node.schemaId}>{node.name}</option>)}
                    </select>
                  </label>
                  <label className="node-editor__field">
                    <span>To</span>
                    <select value={selectedConnection.target} onChange={(event) => handleConnectionUpdate('target', event.target.value)}>
                      {searchableNodes.map((node) => <option key={`${node.type}-${node.schemaId}`} value={node.schemaId}>{node.name}</option>)}
                    </select>
                  </label>
                  <label className="node-editor__field">
                    <span>Why they connect</span>
                    <textarea value={selectedConnection.link} rows={5} onChange={(event) => handleConnectionUpdate('link', event.target.value)} />
                  </label>
                  {connectionError && <p className="node-editor__error" role="alert">{connectionError}</p>}
                  <button type="button" className="node-editor__danger" onClick={handleDeleteConnection}>Delete connection</button>
                </div>
              </>
            ) : detailNode ? (
              <>
                <div className="dashboard__chat-header">
                  <span className="terminal-label">NODE DETAIL</span>
                  <button
                    type="button"
                    className="detail-panel__close"
                    onClick={() => setDetailNode(null)}
                    aria-label="Close node details"
                  >
                    ×
                  </button>
                </div>
                <div className="dashboard__detail-content">
                  <span className="detail-panel__type">{detailNode.type}</span>
                  <h2 className="detail-panel__name">{detailNode.name}</h2>
                  {detailNode.summary && <p className="detail-panel__summary">{detailNode.summary}</p>}
                  {detailNode.points && detailNode.points.length > 0 && (
                    <ul className="detail-panel__points">
                      {detailNode.points.map((point) => <li key={point}>{point}</li>)}
                    </ul>
                  )}
                </div>
              </>
            ) : null}
        </aside>
      </div>
    </main>
  );
}
