/**
 * Batch tool execution: N create actions in one turn must materialize as N distinct items.
 * A shared fallback id (e.g. `created_${Date.now()}`) made every item collapse into one schedule
 * row, so the confirmation card showed 5 events while the timeline showed 1.
 */
import type {
  CalendarActionProposal,
  CalendarExecutionResult,
  TaskActionProposal,
  TaskExecutionResult,
} from '../../types/dayrhythm';

export interface CreateResultPlan {
  actionIndex: number;
  id: string;
  htmlLink?: string;
}

interface CreateCapableAction {
  operation: string;
  title: string;
}

interface CreateCapableResult {
  operation: string;
  title: string;
  id?: string;
  htmlLink?: string;
}

/** One unique id per create action; results are consumed once, never reused across actions. */
export function matchCreateResults(
  actions: CreateCapableAction[],
  results: CreateCapableResult[],
  fallbackBase: string
): CreateResultPlan[] {
  const usedResultIndexes = new Set<number>();
  const usedIds = new Set<string>();
  const plans: CreateResultPlan[] = [];

  actions.forEach((action, actionIndex) => {
    if (action.operation !== 'create') return;

    let matchIndex = results.findIndex(
      (result, index) =>
        !usedResultIndexes.has(index) &&
        result.operation === 'create' &&
        result.title === action.title &&
        Boolean(result.id) &&
        !usedIds.has(String(result.id))
    );
    if (matchIndex === -1) {
      matchIndex = results.findIndex(
        (result, index) =>
          !usedResultIndexes.has(index) &&
          result.operation === 'create' &&
          Boolean(result.id) &&
          !usedIds.has(String(result.id))
      );
    }

    const match = matchIndex >= 0 ? results[matchIndex] : undefined;
    if (matchIndex >= 0) usedResultIndexes.add(matchIndex);

    const id = match?.id && !usedIds.has(match.id) ? match.id : `${fallbackBase}_${actionIndex}`;
    usedIds.add(id);
    plans.push({ actionIndex, id, htmlLink: match?.htmlLink });
  });

  return plans;
}

export function resolveCalendarCreatePlan(
  actions: CalendarActionProposal[],
  results: CalendarExecutionResult[],
  fallbackBase: string
): CreateResultPlan[] {
  return matchCreateResults(actions, results, fallbackBase);
}

export function resolveTaskCreatePlan(
  actions: TaskActionProposal[],
  results: TaskExecutionResult[],
  fallbackBase: string
): CreateResultPlan[] {
  return matchCreateResults(actions, results, fallbackBase);
}

/** True only when the proposal actually carries structured actions to execute. */
export function countProposalActions(proposal: {
  actions?: unknown[];
  taskActions?: unknown[];
  medicationActions?: unknown[];
  creativeActions?: unknown[];
  habitActions?: unknown[];
}): number {
  return (
    (proposal.actions?.length ?? 0) +
    (proposal.taskActions?.length ?? 0) +
    (proposal.medicationActions?.length ?? 0) +
    (proposal.creativeActions?.length ?? 0) +
    (proposal.habitActions?.length ?? 0)
  );
}
