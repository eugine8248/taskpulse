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
  order: number;
  labels: LabelLite[];
  createdAt: string;
  updatedAt: string;
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
