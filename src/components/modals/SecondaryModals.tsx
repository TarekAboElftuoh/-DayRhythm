import React, { Suspense } from 'react';
import type { PomodoroState } from '../../types/dayrhythm';
import { TravelModeModal, SmartCatchUpModal, PomodoroModal, LogoPickerModal, type AppModalsProps } from './types';

export const SecondaryModals: React.FC<{ p: AppModalsProps }> = ({ p }) => {
  const {
    isTravelModalOpen, setIsTravelModalOpen, travelState, liveBlocks, medications,
    activeLocation, lifeProfile, todayCairoIso, handleApplyTravel, handleDisableTravel,
    isCatchUpModalOpen, setIsCatchUpModalOpen, activeTimeZone, undoSnapshot,
    handleCommitReflow, handleUndoReflow,
    isPomodoroModalOpen, setIsPomodoroModalOpen, pomodoro, setPomodoro, pushToTasksVaultImmediately,
    isLogoPickerOpen, setIsLogoPickerOpen, selectedLogoId, handleSelectBrandLogo, handleResetBrandLogo,
  } = p;
  return (
    <>
      {isTravelModalOpen && (
        <Suspense fallback={null}>
          <TravelModeModal
            isOpen={isTravelModalOpen}
            onClose={() => setIsTravelModalOpen(false)}
            travelState={travelState}
            scheduleBlocks={liveBlocks}
            medications={medications}
            currentLocation={activeLocation}
            adhanLeadMinutes={lifeProfile.adhanLeadMinutes}
            todayIso={todayCairoIso}
            onApplyTravel={handleApplyTravel}
            onDisableTravel={handleDisableTravel}
          />
        </Suspense>
      )}

      {isCatchUpModalOpen && (
        <Suspense fallback={null}>
          <SmartCatchUpModal
            isOpen={isCatchUpModalOpen}
            onClose={() => setIsCatchUpModalOpen(false)}
            blocks={liveBlocks}
            activeTimeZone={activeTimeZone}
            hasUndoSnapshot={!!undoSnapshot}
            onCommitReflow={handleCommitReflow}
            onUndoToOriginal={handleUndoReflow}
          />
        </Suspense>
      )}

      {isPomodoroModalOpen && (
        <Suspense fallback={null}>
          <PomodoroModal
            isOpen={isPomodoroModalOpen}
            onClose={() => setIsPomodoroModalOpen(false)}
            state={pomodoro}
            onToggleRun={() =>
              setPomodoro((p) => {
                const next = { ...p, isRunning: !p.isRunning };
                void pushToTasksVaultImmediately({ pomodoro: next });
                return next;
              })
            }
            onReset={() =>
              setPomodoro((p) => {
                const next: PomodoroState = {
                  ...p,
                  phase: 'focus',
                  remainingSeconds: p.presetMinutes * 60,
                  totalSeconds: p.presetMinutes * 60,
                  isRunning: false,
                };
                void pushToTasksVaultImmediately({ pomodoro: next });
                return next;
              })
            }
            onSelectPreset={(minutes) =>
              setPomodoro((p) => {
                const next: PomodoroState = {
                  ...p,
                  phase: minutes === 5 ? 'break' : 'focus',
                  presetMinutes: minutes,
                  remainingSeconds: minutes * 60,
                  totalSeconds: minutes * 60,
                  isRunning: false,
                };
                void pushToTasksVaultImmediately({ pomodoro: next });
                return next;
              })
            }
            onFastForwardTest={() =>
              setPomodoro((p) => ({
                ...p,
                phase: 'focus',
                remainingSeconds: 3,
                totalSeconds: p.presetMinutes * 60,
                isRunning: true,
              }))
            }
          />
        </Suspense>
      )}

      {isLogoPickerOpen && (
        <Suspense fallback={null}>
          <LogoPickerModal
            isOpen={isLogoPickerOpen}
            selectedLogoId={selectedLogoId}
            onSelectLogo={handleSelectBrandLogo}
            onResetDefault={handleResetBrandLogo}
            onClose={() => setIsLogoPickerOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
};
