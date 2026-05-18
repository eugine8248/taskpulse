// Shared running-timer context. We pull it once at the top-level and let
// children read it through a context so we don't trigger a re-render storm.
import { createContext, useContext } from 'react';

export interface RunningTimer {
  id: number;
  cardId: number;
  startedAt: string;
  card?: { id: number; title: string; columnId: number };
}

export const RunningTimerContext = createContext<RunningTimer | null>(null);
export function useRunningTimer(): RunningTimer | null {
  return useContext(RunningTimerContext);
}
