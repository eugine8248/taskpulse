import { useParams, Navigate } from 'react-router-dom';
import BoardView from '../components/board/BoardView';

export default function BoardPage() {
  const { id } = useParams<{ id: string }>();
  const boardId = id ? parseInt(id, 10) : NaN;
  if (!Number.isFinite(boardId)) return <Navigate to="/" replace />;
  return <BoardView boardId={boardId} />;
}
