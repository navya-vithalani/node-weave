import { useState } from 'react';
import type { WorkingStructure } from '../types/schema';
import type { GraphNode } from './PhysicsGraph';

type EditableField = 'name' | 'summary' | 'points';

interface NodeEditorProps {
  node: GraphNode;
  structure: WorkingStructure;
  onUpdate: (field: EditableField, value: string | string[]) => void;
  onReparent: (topicId: string) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}

function findParentTopic(structure: WorkingStructure, node: GraphNode) {
  if (node.type === 'topic') return undefined;
  if (node.type === 'customInsight') {
    const anchorId = structure.customInsights.find((insight) => insight.id === node.schemaId)?.anchorTopicId;
    return structure.topics.find((topic) =>
      topic.id === anchorId || topic.subtopics.some((subtopic) => subtopic.id === anchorId)
    );
  }
  return structure.topics.find((topic) => topic.subtopics.some((subtopic) => subtopic.id === node.schemaId));
}

export default function NodeEditor({
  node,
  structure,
  onUpdate,
  onReparent,
  onMove,
  onDelete,
}: NodeEditorProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const parentTopic = findParentTopic(structure, node);
  const siblingList = node.type === 'subtopic'
    ? parentTopic?.subtopics
    : node.type === 'customInsight'
      ? structure.customInsights.filter((insight) => insight.anchorTopicId === parentTopic?.id)
      : undefined;
  const siblingIndex = siblingList?.findIndex((item) => item.id === node.schemaId) ?? -1;
  const currentParentId = parentTopic?.id;

  return (
    <div className="node-editor">
      <div className="node-editor__context">
        <span className="terminal-label">{node.type} · modified copy</span>
        <span>Changes save as you type.</span>
      </div>
      <label className="node-editor__field">
        <span>Title</span>
        <input value={node.name} onChange={(event) => onUpdate('name', event.target.value)} />
      </label>
      <label className="node-editor__field">
        <span>Description</span>
        <textarea value={node.summary} rows={6} onChange={(event) => onUpdate('summary', event.target.value)} />
      </label>
      {node.type === 'subtopic' && (
        <label className="node-editor__field">
          <span>Points (one per line)</span>
          <textarea
            value={(node.points ?? []).join('\n')}
            rows={6}
            onChange={(event) => onUpdate('points', event.target.value.split('\n'))}
          />
        </label>
      )}
      {node.type !== 'topic' && (
        <label className="node-editor__field">
          <span>Parent topic</span>
          <select
            value={currentParentId ?? ''}
            onChange={(event) => onReparent(event.target.value)}
          >
            {structure.topics.map((topic) => (
              <option key={topic.id} value={topic.id}>{topic.name}</option>
            ))}
          </select>
        </label>
      )}
      {siblingIndex >= 0 && (
        <div className="node-editor__actions">
          <button type="button" onClick={() => onMove(-1)} disabled={siblingIndex === 0}>Move up</button>
          <button type="button" onClick={() => onMove(1)} disabled={siblingIndex === siblingList!.length - 1}>Move down</button>
        </div>
      )}
      <div className="node-editor__delete">
        {confirmingDelete ? (
          <>
            <span>Delete this {node.type} and its attached links?</span>
            <button type="button" className="node-editor__danger" onClick={onDelete}>Confirm delete</button>
            <button type="button" onClick={() => setConfirmingDelete(false)}>Cancel</button>
          </>
        ) : (
          <button type="button" className="node-editor__danger" onClick={() => setConfirmingDelete(true)}>
            Delete {node.type}
          </button>
        )}
      </div>
    </div>
  );
}
