'use client';

import React from 'react';
import {
  Bike,
  LogOut,
  Moon,
  RefreshCw,
  Sun,
  Truck,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { AuthenticatedUser, VehicleType } from '@/domain/types';
import type { FieldTheme } from './techTypes';

interface TechTopStatusBarProps {
  user: AuthenticatedUser;
  vehicleType: VehicleType;
  theme: FieldTheme;
  deadZone: boolean;
  pendingSyncCount: number;
  onToggleTheme: () => void;
  onToggleDeadZone: () => void;
  onOpenSyncTab: () => void;
  onLogout: () => void;
}

export function TechTopStatusBar({
  user,
  vehicleType,
  theme,
  deadZone,
  pendingSyncCount,
  onToggleTheme,
  onToggleDeadZone,
  onOpenSyncTab,
  onLogout,
}: TechTopStatusBarProps) {
  const vehicleLabel =
    vehicleType === 'l300_van' ? 'L300 Splice Van' : '2-Wheeler';

  return (
    <header
      className="border-b px-3 py-2.5 space-y-2 shrink-0"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm truncate">{user.fullName}</span>
            <span
              className="font-mono-tabular text-[11px] font-semibold"
              style={{ color: 'var(--text-muted)' }}
            >
              {user.employeeCode}
            </span>
          </div>
          <div
            className="inline-flex items-center gap-1.5 text-xs font-medium"
            style={{ color: 'var(--text-secondary)' }}
          >
            {vehicleType === 'l300_van' ? (
              <Truck className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Bike className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>{vehicleLabel}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            aria-label={
              theme === 'field-light'
                ? 'Switch to Dark 3D Cockpit mode'
                : 'Switch to Sunlight High-Contrast mode'
            }
            onClick={onToggleTheme}
            className="min-h-12 min-w-12 inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            {theme === 'field-light' ? (
              <Moon className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Sun className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">
              {theme === 'field-light' ? 'Dark 3D' : 'Sunlight'}
            </span>
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="min-h-12 inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* 1-Click Dead-Zone Offline Toggle + Pending Sync Queue Strip */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-pressed={deadZone}
          onClick={onToggleDeadZone}
          className="min-h-12 inline-flex items-center justify-center gap-2 rounded-lg border px-3 text-xs font-bold transition-colors"
          style={{
            backgroundColor: deadZone
              ? 'var(--status-warn-soft)'
              : 'var(--status-ok-soft)',
            borderColor: deadZone
              ? 'var(--status-warn)'
              : 'var(--status-ok)',
            color: deadZone ? 'var(--status-warn)' : 'var(--status-ok)',
          }}
        >
          {deadZone ? (
            <>
              <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>DEAD-ZONE OFFLINE</span>
            </>
          ) : (
            <>
              <Wifi className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>CELLULAR ONLINE</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onOpenSyncTab}
          className="min-h-12 inline-flex items-center justify-center gap-2 rounded-lg border px-3 text-xs font-bold font-mono-tabular"
          style={{
            backgroundColor:
              pendingSyncCount > 0
                ? 'var(--accent-blaze-soft)'
                : 'var(--bg-elevated)',
            borderColor:
              pendingSyncCount > 0
                ? 'var(--accent-blaze)'
                : 'var(--border-subtle)',
            color:
              pendingSyncCount > 0
                ? 'var(--accent-blaze)'
                : 'var(--text-secondary)',
          }}
        >
          <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>SYNC QUEUE ({pendingSyncCount})</span>
        </button>
      </div>
    </header>
  );
}
