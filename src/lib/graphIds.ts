import type { CustomInsight, OriginalStructure, Topic } from '../types/schema'

export type KnowledgeNodeType = 'topic' | 'subtopic' | 'customInsight'

export function graphNodeId(type: KnowledgeNodeType, schemaId: string): string {
  return `${type}:${encodeURIComponent(schemaId)}`
}

export function getTopicInsights(structure: OriginalStructure, topic: Topic): CustomInsight[] {
  const topLevel = (structure.customInsights ?? []).filter((insight) =>
    insight.anchorTopicId === topic.id
    || topic.subtopics.some((subtopic) => subtopic.id === insight.anchorTopicId)
  )
  return [...new Map([...(topic.customInsights ?? []), ...topLevel].map((insight) => [insight.id, insight])).values()]
}
