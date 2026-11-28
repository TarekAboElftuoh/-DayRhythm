import React from 'react';
import { ExternalLink } from 'lucide-react';
import type { AppLanguage, GeoLocation, GoogleCalendarEventItem, GoogleTaskItem, LifeProfile } from '../../types/dayrhythm';
import { formatIsoTo12h } from '../../engines/prayerEngine';
import { cleanCalendarText } from '../../services/apiClient';

export const WorkspaceSidebarLists: React.FC<{
  sidebarTab: 'events' | 'tasks' | 'memories';
  calendarEvents: GoogleCalendarEventItem[];
  googleTasks: GoogleTaskItem[];
  language: AppLanguage;
  activeLocation: GeoLocation;
  lifeProfile: LifeProfile;
}> = ({ sidebarTab, calendarEvents, googleTasks, language, activeLocation, lifeProfile }) => {
  if (sidebarTab === 'events') {
    if (calendarEvents.length === 0) {
      return <p className="text-xs text-zinc-500 py-6 text-center">لا توجد أحداث مسجلة في الأيام السبعة القادمة.</p>;
    }
    return (
      <ul className="divide-y divide-white/[0.06] max-h-[420px] overflow-y-auto pl-1">
        {calendarEvents.map((ev) => {
          const descClean = cleanCalendarText(ev.description);
          const tz = activeLocation.timeZone || lifeProfile.currentTimeZone || 'Africa/Cairo';
          return (
            <li key={`${ev.calendarId ?? 'primary'}-${ev.id}`} className="py-2.5 first:pt-0 text-xs space-y-1">
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-white leading-snug">{ev.summary}</span>
                {ev.htmlLink && (
                  <a href={ev.htmlLink} target="_blank" rel="noopener noreferrer" className="text-[#7FFFD4] hover:text-white shrink-0" title="فتح في Google Calendar">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
              {descClean && <p className="text-[11px] text-zinc-400 line-clamp-2">{descClean}</p>}
              <div className="font-mono-tabular text-[11px] text-[#7FFFD4] whitespace-nowrap">
                {formatIsoTo12h(ev.start, language, { timeZone: tz })}
                {ev.end && !ev.isAllDay ? ` – ${formatIsoTo12h(ev.end, language, { includeDate: false, timeZone: tz })}` : ''}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  if (googleTasks.length === 0) {
    return <p className="text-xs text-zinc-500 py-6 text-center">لا توجد مهام في Google Tasks حالياً.</p>;
  }

  return (
    <ul className="divide-y divide-white/10 max-h-[420px] overflow-y-auto pl-1">
      {googleTasks.map((tk) => (
        <li key={`${tk.taskListId}-${tk.id}`} className={`py-2.5 first:pt-0 text-xs ${tk.status === 'completed' ? 'opacity-50' : ''}`}>
          <div className="font-medium text-white">{tk.status === 'completed' ? '✓ ' : '○ '}{tk.title}</div>
          <div className="text-[11px] text-zinc-500 mt-1 flex items-center justify-between gap-2">
            <span className="truncate">{tk.taskListTitle}</span>
            {tk.due && <span className="font-mono-tabular text-[#7FFFD4] shrink-0">{tk.due.slice(0, 10)}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
};
