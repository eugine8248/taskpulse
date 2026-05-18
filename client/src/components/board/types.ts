export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface LabelLite {
  id: number;
  name: string;
}

export interface Card {
  id: number;
  columnId: number;
  title: string;
  description: string;
  priority: Priority;
  dueDate: string | null;
  pinnedAt: string | null;
  order: number;
  labels: LabelLite[];
  createdAt: string;
  updatedAt: string;
}

export interface CardComment {
  id: number;
  cardId: number;
  body: string;
  authorUserId: number;
  createdAt: string;
  updatedAt: string;
}

export interface CardEventDTO {
  id: number;
  cardId: number;
  kind:
    | 'created'
    | 'moved'
    | 'priority_changed'
    | 'pinned'
    | 'unpinned'
    | 'completed'
    | 'commented'
    | 'time_logged'
    | 'attached'
    | 'tagged';
  meta: unknown;
  actorUserId: number;
  createdAt: string;
}

export interface PinnedCard extends Card {
  boardId: number;
  boardName: string;
  columnName: string;
}

export interface TimeEntryDTO {
  id: number;
  cardId: number;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  note: string | null;
  authorUserId: number;
  createdAt: string;
}

export interface AttachmentDTO {
  id: number;
  cardId: number;
  fileUrl: string;
  fileKey: string;
  mimeType: string;
  byteSize: number;
  originalName: string;
  authorUserId: number;
  uploadedAt: string;
}

export interface Column {
  id: number;
  name: string;
  order: number;
  wipLimit: number | null;
  cards: Card[];
}

export interface BoardData {
  board: { id: number; name: string };
  columns: Column[];
}
