import { describe, expect, it } from 'vitest';
import {
  countProposalActions,
  resolveCalendarCreatePlan,
  resolveTaskCreatePlan,
} from './batchActions';
import { applyOfflineActionsToBlocks } from '../../app/applyOfflineActionsHelper';
import type {
  CalendarActionProposal,
  CalendarExecutionResult,
  TaskActionProposal,
} from '../../types/dayrhythm';

const makeCreate = (title: string, startTime24: string): CalendarActionProposal => ({
  operation: 'create',
  title,
  calendarId: 'primary',
  dateIso: '2026-11-28',
  startTime24,
  durationMinutes: 30,
});

describe('batch calendar actions', () => {
  it('gives every one of N same-title creates its own id (no collapse to a single row)', () => {
    const actions = [
      makeCreate('تمارين', '07:00'),
      makeCreate('تمارين', '12:00'),
      makeCreate('تمارين', '18:00'),
    ];
    const results: CalendarExecutionResult[] = [
      { operation: 'create', status: 'ok', title: 'تمارين', id: 'evt_a' },
      { operation: 'create', status: 'ok', title: 'تمارين', id: 'evt_b' },
      { operation: 'create', status: 'ok', title: 'تمارين', id: 'evt_c' },
    ];

    const plans = resolveCalendarCreatePlan(actions, results, 'created_base');
    expect(plans).toHaveLength(3);
    expect(plans.map((p) => p.id)).toEqual(['evt_a', 'evt_b', 'evt_c']);
    expect(new Set(plans.map((p) => p.id)).size).toBe(3);
    expect(plans.map((p) => p.actionIndex)).toEqual([0, 1, 2]);
  });

  it('keeps fallback ids unique when the executor reports no result ids', () => {
    const actions = [makeCreate('A', '08:00'), makeCreate('B', '09:00'), makeCreate('C', '10:00')];
    const plans = resolveCalendarCreatePlan(actions, [], 'created_base');
    expect(plans.map((p) => p.id)).toEqual([
      'created_base_0',
      'created_base_1',
      'created_base_2',
    ]);
    expect(new Set(plans.map((p) => p.id)).size).toBe(3);
  });

  it('never reuses a duplicated result id across two actions', () => {
    const actions = [makeCreate('A', '08:00'), makeCreate('B', '09:00')];
    const plans = resolveCalendarCreatePlan(
      actions,
      [
        { operation: 'create', status: 'ok', title: 'A', id: 'same' },
        { operation: 'create', status: 'ok', title: 'B', id: 'same' },
      ],
      'created_base'
    );
    expect(plans[0].id).toBe('same');
    expect(plans[1].id).toBe('created_base_1');
  });

  it('applies all five created events (and deletes) to the schedule in one batch', () => {
    const created = applyOfflineActionsToBlocks([], [
      makeCreate('حدث 1', '08:00'),
      makeCreate('حدث 2', '09:00'),
      makeCreate('حدث 3', '10:00'),
      makeCreate('حدث 4', '11:00'),
      makeCreate('حدث 5', '12:00'),
    ]);
    expect(created).toHaveLength(5);
    expect(new Set(created.map((b) => b.id)).size).toBe(5);
    expect(created.map((b) => b.startMin)).toEqual([480, 540, 600, 660, 720]);

    const afterDelete = applyOfflineActionsToBlocks(created, [
      { operation: 'delete', title: 'حدث 3' },
    ]);
    expect(afterDelete.filter((b) => !b.deleted)).toHaveLength(4);
  });
});

describe('batch task actions', () => {
  it('maps N task creates to N distinct ids', () => {
    const actions: TaskActionProposal[] = [
      { operation: 'create', title: 'مهمة 1' },
      { operation: 'create', title: 'مهمة 2' },
    ];
    const plans = resolveTaskCreatePlan(actions, [], 'task_base');
    expect(plans.map((p) => p.id)).toEqual(['task_base_0', 'task_base_1']);
  });

  it('counts every structured action type in a proposal', () => {
    expect(
      countProposalActions({
        actions: [{}, {}],
        taskActions: [{}],
        medicationActions: [{}],
        creativeActions: [],
        habitActions: [{}],
      })
    ).toBe(5);
    expect(countProposalActions({})).toBe(0);
  });
});
