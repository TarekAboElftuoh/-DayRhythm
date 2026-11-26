import express from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  PORT,
  getGeminiClient,
  getGoogleCalendarClient,
  getCairoTodayIso,
  formatServerIsoTo12h,
  computeCairoEventRange,
} from './server/config';
import { broadcastUserSync, attachWebSocketServer, syncRooms } from './server/websocket';
import { registerGeminiRoutes } from './server/geminiRoutes';
import { corsMiddleware } from './server/security';

export type {
  CalendarActionProposal,
  TaskActionProposal,
  MedicationActionProposal,
  CreativeActivityActionProposal,
  MemoryActionProposal,
} from './server/config';

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(corsMiddleware);

  let geminiProbeCache: {
    ok: boolean;
    connected: boolean;
    status: 'online' | 'degraded' | 'offline';
    model: string;
    latencyMs: number;
    checkedAtIso: string;
    error?: string;
    expiresAtMs: number;
  } | null = null;

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      wsSyncRooms: syncRooms.size,
      serverTimeIso: new Date().toISOString(),
    });
  });


  app.get('/api/calendar/events', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'يرجى تسجيل الدخول بحساب جوجل لعرض أحداث التقويم.' });
        return;
      }

      const now = new Date();
      const startRange = new Date(now.getTime() - 24 * 60 * 60_000);
      const endRange = new Date(now.getTime() + 14 * 24 * 60 * 60_000);

      const cal = getGoogleCalendarClient(authHeader);

      let calendars: Array<{
        id: string;
        summary: string;
        backgroundColor?: string;
        primary?: boolean;
      }> = [];

      try {
        const calListRes = await cal.calendarList.list({
          minAccessRole: 'reader',
          showHidden: false,
        });
        calendars = (calListRes.data.items ?? [])
          .filter((c) => Boolean(c.id))
          .slice(0, 8)
          .map((c) => ({
            id: String(c.id),
            summary: String(c.summaryOverride ?? c.summary ?? 'التقويم'),
            backgroundColor: c.backgroundColor ? String(c.backgroundColor) : undefined,
            primary: Boolean(c.primary),
          }));
      } catch {
        // Fallback smoothly if user granted events scope before calendarList scope
        calendars = [];
      }

      if (calendars.length === 0) {
        calendars = [{ id: 'primary', summary: 'التقويم الأساسي', primary: true }];
      }

      const fetchedLists = await Promise.allSettled(
        calendars.map(async (cInfo) => {
          const response = await cal.events.list({
            calendarId: cInfo.id,
            singleEvents: true,
            orderBy: 'startTime',
            timeMin: startRange.toISOString(),
            timeMax: endRange.toISOString(),
            maxResults: 120,
          });
          const items = response.data.items ?? [];
          return items.map((ev) => ({
            id: String(ev.id ?? ''),
            calendarId: cInfo.id,
            calendarTitle: cInfo.summary,
            calendarColor: cInfo.backgroundColor,
            summary: String(ev.summary ?? '(بدون عنوان)'),
            start: String(ev.start?.dateTime ?? ev.start?.date ?? ''),
            end: String(ev.end?.dateTime ?? ev.end?.date ?? ''),
            isAllDay: Boolean(ev.start?.date && !ev.start?.dateTime),
            description: String(ev.description ?? ''),
            location: ev.location ? String(ev.location) : undefined,
            htmlLink: ev.htmlLink ? String(ev.htmlLink) : undefined,
            status: ev.status ? String(ev.status) : undefined,
            isRecurring: Boolean(ev.recurringEventId),
            recurringEventId: ev.recurringEventId ? String(ev.recurringEventId) : undefined,
          }));
        })
      );

      const merged: Array<{
        id: string;
        calendarId: string;
        calendarTitle: string;
        calendarColor?: string;
        summary: string;
        start: string;
        end: string;
        isAllDay: boolean;
        description: string;
        location?: string;
        htmlLink?: string;
        status?: string;
        isRecurring?: boolean;
        recurringEventId?: string;
      }> = [];
      const seenKeys = new Set<string>();

      for (const result of fetchedLists) {
        if (result.status !== 'fulfilled') continue;
        for (const ev of result.value) {
          const key = `${ev.calendarId}:${ev.id}`;
          if (!ev.id || seenKeys.has(key)) continue;
          seenKeys.add(key);
          merged.push(ev);
        }
      }

      merged.sort((a, b) => a.start.localeCompare(b.start));

      res.json({ calendars, events: merged });
    } catch (err: unknown) {
      const status =
        typeof err === 'object' && err !== null && 'code' in err && Number((err as { code?: unknown }).code) === 401
          ? 401
          : 500;
      const msg = err instanceof Error ? err.message : 'خطأ في قراءة Google Calendar.';
      res.status(status).json({ error: msg });
    }
  });

  // 2. Execute user-confirmed Google Calendar mutations via @googleapis/calendar
  app.post('/api/calendar/execute', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'يرجى تسجيل الدخول بحساب جوجل لتنفيذ التعديلات على التقويم.' });
        return;
      }

      const { actions } = req.body as { actions?: CalendarActionProposal[] };
      if (!Array.isArray(actions) || actions.length === 0) {
        res.status(400).json({ error: 'لا توجد تعديلات لتنفيذها.' });
        return;
      }

      const cal = getGoogleCalendarClient(authHeader);
      const results: Array<{
        title: string;
        operation: string;
        status: string;
        id?: string;
        htmlLink?: string;
        start?: string;
        end?: string;
      }> = [];

      const isLikelyGoogleEventId = (id?: string) =>
        Boolean(id && !id.includes('prayer_') && !id.startsWith('chat-') && id.length >= 6);

      for (const act of actions) {
        const op = act.operation;
        const calendarId = act.calendarId || 'primary';
        const { startDateTime, endDateTime } = computeCairoEventRange(
          act.dateIso,
          act.startTime24,
          act.durationMinutes
        );

        let targetEventId = isLikelyGoogleEventId(act.eventId) ? act.eventId : undefined;
        if (act.applyToAllDays && targetEventId && targetEventId.includes('_')) {
          targetEventId = targetEventId.split('_')[0];
        }

        if ((op === 'delete' || op === 'update' || op === 'shift') && !targetEventId && act.title) {
          const searchRes = await cal.events.list({
            calendarId,
            q: act.title.replace(/[\u{1F300}-\u{1FAFF}]/gu, '').trim() || act.title,
            singleEvents: true,
            maxResults: 5,
            timeMin: new Date(Date.now() - 24 * 60 * 60_000).toISOString(),
            timeMax: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
          });
          const match = searchRes.data.items?.find((item) => item.id);
          if (match?.id) {
            targetEventId = (act.applyToAllDays && match.recurringEventId)
              ? match.recurringEventId
              : (act.applyToAllDays && match.id.includes('_'))
                ? match.id.split('_')[0]
                : match.id;
          }
        }

        if (op === 'delete') {
          if (targetEventId) {
            try {
              await cal.events.delete({
                calendarId,
                eventId: targetEventId,
              });
            } catch (delErr: unknown) {
              const code =
                typeof delErr === 'object' && delErr !== null && 'code' in delErr
                  ? Number((delErr as { code?: unknown }).code)
                  : 0;
              if (code !== 410 && code !== 404) throw delErr;
            }
            results.push({
              title: act.title,
              operation: op,
              status: 'deleted',
              id: targetEventId,
            });
          } else {
            results.push({
              title: act.title,
              operation: op,
              status: 'deleted_in_app_only',
            });
          }
        } else if ((op === 'update' || op === 'shift') && targetEventId) {
          const patchRes = await cal.events.patch({
            calendarId,
            eventId: targetEventId,
            requestBody: {
              summary: act.title,
              description: act.description,
              start: { dateTime: startDateTime, timeZone: 'Africa/Cairo' },
              end: { dateTime: endDateTime, timeZone: 'Africa/Cairo' },
            },
          });
          results.push({
            title: act.title,
            operation: op,
            status: 'updated',
            id: patchRes.data.id ?? targetEventId,
            htmlLink: patchRes.data.htmlLink ?? undefined,
            start: startDateTime,
            end: endDateTime,
          });
        } else {
          const validByDays = Array.isArray(act.byDays)
            ? act.byDays.filter((d) => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].includes(d))
            : [];
          const recurrence =
            act.recurrenceRule === 'DAILY'
              ? ['RRULE:FREQ=DAILY']
              : act.recurrenceRule === 'WEEKLY'
                ? [
                    validByDays.length > 0
                      ? `RRULE:FREQ=WEEKLY;BYDAY=${validByDays.join(',')}`
                      : 'RRULE:FREQ=WEEKLY',
                  ]
                : undefined;

          const insertRes = await cal.events.insert({
            calendarId,
            requestBody: {
              summary: act.title,
              description:
                act.description ?? 'تم الإنشاء والمزامنة عبر شات Gemini · إيقاع اليوم DayRhythm',
              start: { dateTime: startDateTime, timeZone: 'Africa/Cairo' },
              end: { dateTime: endDateTime, timeZone: 'Africa/Cairo' },
              recurrence,
            },
          });
          results.push({
            title: act.title,
            operation: op === 'update' || op === 'shift' ? op : 'create',
            status: 'created',
            id: insertRes.data.id ?? undefined,
            htmlLink: insertRes.data.htmlLink ?? undefined,
            start: startDateTime,
            end: endDateTime,
          });
        }
      }

      const uidHeader = String(req.headers['x-user-uid'] ?? '').trim();
      const clientIdHeader = String(req.headers['x-client-id'] ?? '').trim();
      const opId = `cal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      if (uidHeader) {
        broadcastUserSync(
          uidHeader,
          {
            type: 'sync',
            opId,
            clientId: clientIdHeader || 'server',
            scope: 'calendar',
            action: actions[0]?.operation ?? 'mutate',
            undoSnapshot: (req.body as { undoSnapshot?: unknown }).undoSnapshot,
            timestampMs: Date.now(),
          },
          clientIdHeader || undefined
        );
      }

      res.json({ ok: true, opId, results });
    } catch (err: unknown) {
      const status =
        typeof err === 'object' && err !== null && 'code' in err && Number((err as { code?: unknown }).code) === 401
          ? 401
          : 500;
      const msg = err instanceof Error ? err.message : 'تعذر تنفيذ تعديلات Google Calendar.';
      res.status(status).json({ error: msg });
    }
  });

  // 2b. Read user's real Google Tasks lists and tasks via Tasks REST API
  app.get('/api/tasks', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'يرجى تسجيل الدخول بحساب جوجل لعرض Google Tasks.' });
        return;
      }

      const listsRes = await fetch(
        'https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=20',
        { headers: { Authorization: authHeader } }
      );
      if (listsRes.status === 401 || listsRes.status === 403) {
        const errData = await listsRes.json().catch(() => ({}));
        res.status(listsRes.status).json({
          error:
            (errData as { error?: { message?: string } })?.error?.message ||
            'يرجى إعادة تسجيل الدخول لمنح صلاحية Google Tasks.',
        });
        return;
      }

      const listsJson = (await listsRes.json()) as {
        items?: Array<{ id?: string; title?: string }>;
      };
      const taskLists = (listsJson.items ?? [])
        .filter((l) => Boolean(l.id) && l.title !== '[DayRhythm Sync Vault]')
        .slice(0, 6)
        .map((l) => ({
          id: String(l.id),
          title: String(l.title ?? 'مهامي'),
        }));

      const fetchedTasks = await Promise.allSettled(
        taskLists.map(async (list) => {
          const tRes = await fetch(
            `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(list.id)}/tasks?showCompleted=true&showHidden=false&maxResults=100`,
            { headers: { Authorization: authHeader } }
          );
          if (!tRes.ok) return [];
          const tJson = (await tRes.json()) as {
            items?: Array<{
              id?: string;
              title?: string;
              notes?: string;
              status?: string;
              due?: string;
              completed?: string;
              updated?: string;
            }>;
          };
          return (tJson.items ?? [])
            .filter((t) => Boolean(t.id && t.title) && t.title !== 'sync_state')
            .map((t) => ({
              id: String(t.id),
              taskListId: list.id,
              taskListTitle: list.title,
              title: String(t.title ?? ''),
              notes: t.notes ? String(t.notes) : undefined,
              status: (t.status === 'completed' ? 'completed' : 'needsAction') as
                | 'needsAction'
                | 'completed',
              due: t.due ? String(t.due) : undefined,
              completed: t.completed ? String(t.completed) : undefined,
              updated: t.updated ? String(t.updated) : undefined,
            }));
        })
      );

      const tasks = fetchedTasks.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
      res.json({ taskLists, tasks });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطأ في قراءة Google Tasks.';
      res.status(500).json({ error: msg });
    }
  });

  // 2c. Execute user-confirmed Google Tasks mutations via Tasks REST API
  app.post('/api/tasks/execute', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'يرجى تسجيل الدخول بحساب جوجل لتعديل Google Tasks.' });
        return;
      }

      const { taskActions } = req.body as { taskActions?: TaskActionProposal[] };
      if (!Array.isArray(taskActions) || taskActions.length === 0) {
        res.status(400).json({ error: 'لا توجد تعديلات للمهام لتنفيذها.' });
        return;
      }

      const results: Array<{
        title: string;
        operation: string;
        status: string;
        id?: string;
        taskListId?: string;
      }> = [];

      for (const act of taskActions) {
        const listId = act.taskListId || '@default';
        const op = act.operation;

        if (op === 'create') {
          const payload: Record<string, string> = { title: act.title };
          if (act.notes) payload.notes = act.notes;
          if (act.dueDateIso && /^\d{4}-\d{2}-\d{2}$/.test(act.dueDateIso)) {
            payload.due = `${act.dueDateIso}T09:00:00.000Z`;
          }
          const createRes = await fetch(
            `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks`,
            {
              method: 'POST',
              headers: {
                Authorization: authHeader,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(payload),
            }
          );
          const created = (await createRes.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
          if (!createRes.ok) {
            throw new Error(created?.error?.message || 'تعذر إنشاء المهمة في Google Tasks.');
          }
          results.push({
            title: act.title,
            operation: op,
            status: 'created',
            id: created.id,
            taskListId: listId,
          });
        } else if (op === 'delete' && act.taskId) {
          const delRes = await fetch(
            `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(act.taskId)}`,
            {
              method: 'DELETE',
              headers: { Authorization: authHeader },
            }
          );
          if (!delRes.ok && delRes.status !== 404) {
            throw new Error('تعذر حذف المهمة من Google Tasks.');
          }
          results.push({
            title: act.title,
            operation: op,
            status: 'deleted',
            id: act.taskId,
            taskListId: listId,
          });
        } else if (act.taskId) {
          const patchPayload: Record<string, unknown> = {};
          if (op === 'complete') {
            patchPayload.status = 'completed';
          } else if (op === 'reopen') {
            patchPayload.status = 'needsAction';
            patchPayload.completed = null;
          } else {
            if (act.title) patchPayload.title = act.title;
            if (act.notes !== undefined) patchPayload.notes = act.notes;
            if (act.dueDateIso && /^\d{4}-\d{2}-\d{2}$/.test(act.dueDateIso)) {
              patchPayload.due = `${act.dueDateIso}T09:00:00.000Z`;
            }
          }
          const patchRes = await fetch(
            `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(act.taskId)}`,
            {
              method: 'PATCH',
              headers: {
                Authorization: authHeader,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(patchPayload),
            }
          );
          const patched = (await patchRes.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
          if (!patchRes.ok) {
            throw new Error(patched?.error?.message || 'تعذر تحديث المهمة في Google Tasks.');
          }
          results.push({
            title: act.title,
            operation: op,
            status: op === 'complete' ? 'completed' : op === 'reopen' ? 'reopened' : 'updated',
            id: patched.id ?? act.taskId,
            taskListId: listId,
          });
        }
      }

      const uidHeader = String(req.headers['x-user-uid'] ?? '').trim();
      const clientIdHeader = String(req.headers['x-client-id'] ?? '').trim();
      const opId = `tsk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      if (uidHeader) {
        broadcastUserSync(
          uidHeader,
          {
            type: 'sync',
            opId,
            clientId: clientIdHeader || 'server',
            scope: 'tasks',
            action: taskActions[0]?.operation ?? 'mutate',
            undoSnapshot: (req.body as { undoSnapshot?: unknown }).undoSnapshot,
            timestampMs: Date.now(),
          },
          clientIdHeader || undefined
        );
      }

      res.json({ ok: true, opId, results });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر تعديل Google Tasks.';
      res.status(500).json({ error: msg });
    }
  });

  // 2d. Read-only Smart Gmail Digest (extracts actionable appointments/meetings/travel/deadlines via Gemini)
  app.get('/api/gmail/digest', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          error: 'يرجى تسجيل الدخول بحساب جوجل لقراءة ملخص Gmail.',
          needsReauth: true,
        });
        return;
      }

      const listRes = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=in:inbox+newer_than:7d',
        {
          headers: { Authorization: authHeader },
          signal: AbortSignal.timeout(7000),
        }
      );

      if (listRes.status === 401 || listRes.status === 403) {
        const errData = (await listRes.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        res.status(listRes.status).json({
          error:
            errData?.error?.message ||
            'يرجى إعادة تسجيل الدخول بحساب Google لمنح صلاحية قراءة Gmail (للقراءة فقط).',
          needsReauth: true,
        });
        return;
      }

      if (!listRes.ok) {
        res.status(listRes.status).json({ error: 'تعذر الوصول إلى صندوق وارد Gmail حالياً.' });
        return;
      }

      const listJson = (await listRes.json()) as {
        messages?: Array<{ id?: string }>;
      };
      const messageIds = (listJson.messages ?? [])
        .map((m) => m.id)
        .filter((id): id is string => Boolean(id))
        .slice(0, 10);

      if (messageIds.length === 0) {
        res.json({ scannedCount: 0, digestItems: [] });
        return;
      }

      const detailResults = await Promise.allSettled(
        messageIds.map(async (msgId) => {
          const mRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
              msgId
            )}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
            {
              headers: { Authorization: authHeader },
              signal: AbortSignal.timeout(6000),
            }
          );
          if (!mRes.ok) return null;
          const mJson = (await mRes.json()) as {
            id?: string;
            snippet?: string;
            payload?: { headers?: Array<{ name?: string; value?: string }> };
          };
          const headers = mJson.payload?.headers ?? [];
          const getHeader = (name: string) =>
            headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
          return {
            id: String(mJson.id ?? msgId),
            subject: getHeader('Subject').slice(0, 140),
            from: getHeader('From').slice(0, 100),
            date: getHeader('Date').slice(0, 60),
            snippet: String(mJson.snippet ?? '').slice(0, 180),
          };
        })
      );

      const allEmails = detailResults
        .map((r) => (r.status === 'fulfilled' ? r.value : null))
        .filter((e): e is NonNullable<typeof e> => Boolean(e && (e.subject || e.snippet)));

      // Pre-filter obvious OTP / security-code noise before calling Gemini
      const noiseRegex = /(verification code|one-time password|\botp\b|security alert|رمز التحقق|كود التفعيل|unsubscribe|newsletter)/i;
      const candidateEmails = allEmails.filter(
        (e) => !noiseRegex.test(`${e.subject} ${e.snippet}`)
      );

      if (allEmails.length === 0 || candidateEmails.length === 0) {
        res.json({ scannedCount: allEmails.length, digestItems: [] });
        return;
      }

      const todayCairo = getCairoTodayIso();
      const emailListPrompt = candidateEmails
        .map(
          (e, i) =>
            `[${i + 1}] id=${e.id} | From:${e.from} | Date:${e.date} | Subj:${e.subject} | Text:${e.snippet}`
        )
        .join('\n');

      const ai = getGeminiClient();
      const digestModels = ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'] as const;
      let rawText = '{"items":[]}';
      let lastDigestErr: unknown = null;

      for (const digestModel of digestModels) {
        try {
          const genPromise = ai.models.generateContent({
            model: digestModel,
            contents: `اليوم (القاهرة): ${todayCairo}\nرسائل البريد:\n${emailListPrompt}\nاستخرج فقط المواعيد الحقيقية (اجتماع، مقابلة، سفر، طبي، تسليم مهم، توصيل) وتجاهل الإعلانات والنشرات. أرجع JSON فقط.`,
            config: {
              ...(digestModel === 'gemini-4-hydrogen'
                ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                : {}),
              systemInstruction:
                'محلل سريع لصندوق Gmail. أرجع JSON فقط وفق المخطط. بالعربية، YYYY-MM-DD للتاريخ و HH:MM للوقت. إذا لا توجد مواعيد أرجع items فارغة.',
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  items: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        messageId: { type: Type.STRING },
                        category: {
                          type: Type.STRING,
                          description: 'meeting | travel | medical | deadline | delivery | other',
                        },
                        titleAr: { type: Type.STRING },
                        sender: { type: Type.STRING },
                        summaryAr: { type: Type.STRING },
                        dateIso: { type: Type.STRING },
                        startTime24: { type: Type.STRING },
                        durationMinutes: { type: Type.NUMBER },
                      },
                      required: ['messageId', 'category', 'titleAr', 'sender', 'summaryAr'],
                    },
                  },
                },
                required: ['items'],
              },
            },
          });

          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('انتهت مهلة تحليل Gmail مؤقتاً — أعد المحاولة.')), 14_000)
          );
          const response = await Promise.race([genPromise, timeoutPromise]);
          rawText = response.text ?? '{"items":[]}';
          lastDigestErr = null;
          break;
        } catch (mErr: unknown) {
          lastDigestErr = mErr;
        }
      }

      if (lastDigestErr) {
        throw lastDigestErr;
      }

      const emails = allEmails;
      const parsed = JSON.parse(rawText) as {
        items?: Array<{
          messageId?: string;
          category?: string;
          titleAr?: string;
          sender?: string;
          summaryAr?: string;
          dateIso?: string;
          startTime24?: string;
          durationMinutes?: number;
        }>;
      };

      const validCats = new Set(['meeting', 'travel', 'medical', 'deadline', 'delivery', 'other']);
      const catEmoji: Record<string, string> = {
        meeting: '💼 🤝',
        travel: '🧳 ✈️',
        medical: '🩺 💊',
        deadline: '📌 ⏰',
        delivery: '📦 🚚',
        other: '📧 📅',
      };

      const digestItems = (parsed.items ?? []).slice(0, 8).map((item, idx) => {
        const category = validCats.has(String(item.category))
          ? (item.category as 'meeting' | 'travel' | 'medical' | 'deadline' | 'delivery' | 'other')
          : 'other';
        const dateIso =
          item.dateIso && /^\d{4}-\d{2}-\d{2}$/.test(item.dateIso)
            ? item.dateIso
            : todayCairo;
        const startTime24 =
          item.startTime24 && /^\d{1,2}:\d{2}$/.test(item.startTime24)
            ? item.startTime24.padStart(5, '0')
            : '10:00';
        const durationMinutes =
          typeof item.durationMinutes === 'number' && item.durationMinutes >= 15 && item.durationMinutes <= 360
            ? Math.round(item.durationMinutes)
            : 45;
        const cleanTitle = String(item.titleAr ?? 'موعد من Gmail').trim().slice(0, 100);
        return {
          id: `gmail_${item.messageId ?? idx}_${idx}`,
          messageId: String(item.messageId ?? ''),
          category,
          titleAr: cleanTitle,
          sender: String(item.sender ?? '').slice(0, 80),
          summaryAr: String(item.summaryAr ?? '').slice(0, 200),
          dateIso,
          startTime24,
          durationMinutes,
          suggestedAction: {
            operation: 'create' as const,
            calendarId: 'primary',
            title: `${catEmoji[category] ?? '📧 📅'} ${cleanTitle}`,
            dateIso,
            startTime24,
            durationMinutes,
            description: `مُستخرج من Gmail (${String(item.sender ?? '').slice(0, 60)}): ${String(
              item.summaryAr ?? ''
            ).slice(0, 180)}`,
          },
        };
      });

      res.json({ scannedCount: emails.length, digestItems });
    } catch (err: unknown) {
      res.status(500).json({ error: formatFriendlyGeminiErrorAr(err) });
    }
  });


  registerGeminiRoutes(app);

  const httpServer = http.createServer(app);

  // Real-Time Cross-Device Sync + Ultra-Low-Latency Gemini Chat WebSocket Hub (/ws/sync) on port 3000
  // Disable perMessageDeflate + enable TCP_NODELAY so chat token deltas flush immediately with zero buffering delay
  attachWebSocketServer(httpServer);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
      },
      appType: 'spa',
    });

    if (process.env.DISABLE_HMR === 'true') {
      // Vite 8 still serves /@vite/client with a :24678 WebSocket client in middlewareMode even when hmr:false.
      // Serve a faithful zero-WebSocket shim that preserves CSS injection & HMR exports without WS errors.
      const NO_HMR_VITE_CLIENT = `
const sheetsMap = new Map();
const linkSheetsMap = new Map();
if ("document" in globalThis) {
  document.querySelectorAll("style[data-vite-dev-id]").forEach((el) => {
    sheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
  document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id]').forEach((el) => {
    linkSheetsMap.set(el.getAttribute("data-vite-dev-id"), el);
  });
}
let lastInsertedStyle;
export function updateStyle(id, content) {
  if (linkSheetsMap.has(id)) return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement("style");
    style.setAttribute("type", "text/css");
    style.setAttribute("data-vite-dev-id", id);
    style.textContent = content;
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => { lastInsertedStyle = undefined; }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement("afterend", style);
    }
    lastInsertedStyle = style;
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  if (linkSheetsMap.has(id)) {
    document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id="' + CSS.escape(id) + '"]').forEach((el) => el.remove());
    linkSheetsMap.delete(id);
  }
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  const noop = () => {};
  return {
    data: {},
    accept: noop,
    acceptExports: noop,
    dispose: noop,
    prune: noop,
    decline: noop,
    invalidate: noop,
    on: noop,
    off: noop,
    send: noop,
  };
}
export function injectQuery(url, queryToInject) {
  if (url[0] !== "." && url[0] !== "/") return url;
  const pathname = url.replace(/[?#].*$/, "");
  const { search, hash } = new URL(url, "http://vite.dev");
  return pathname + "?" + queryToInject + (search ? "&" + search.slice(1) : "") + (hash || "");
}
export class ErrorOverlay extends HTMLElement {}
`.trim();

      app.get('/@vite/client', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.send(NO_HMR_VITE_CLIENT);
      });
    }

    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(import.meta.dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`DayRhythm server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start DayRhythm server:', err);
  process.exit(1);
});

