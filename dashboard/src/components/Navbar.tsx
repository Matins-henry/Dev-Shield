'use client';

import React from 'react';
import { Activity, Database, RefreshCw, ShieldCheck, Zap } from 'lucide-react';
import { HealthStatus } from '../lib/types';

interface NavbarProps {
  health: HealthStatus | null;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function Navbar({ health, onRefresh, isRefreshing }: NavbarProps) {
  const isHealthy = health?.status === 'ok';
  const isDegraded = health?.status === 'degraded';
  const redisConnected = health?.redis.status === 'connected';

  return (
    <header className="border-b border-slate-800 bg-[#0b1120]/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 p-0.5 shadow-lg shadow-indigo-500/20">
            <div className="h-full w-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-indigo-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-white tracking-tight">DevShield</span>
              <span className="text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                v1.0.0
              </span>
            </div>
            <p className="text-xs text-slate-400">Sliding-Window Rate Limiter & Gateway</p>
          </div>
        </div>

        {/* Status Indicators & Controls */}
        <div className="flex items-center gap-3">
          {/* Gateway Status Badge */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs">
            <span
              className={`h-2 w-2 rounded-full ${
                isHealthy
                  ? 'bg-emerald-500 animate-pulse'
                  : isDegraded
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
              }`}
            />
            <span className="text-slate-300 font-medium">Gateway:</span>
            <span
              className={
                isHealthy
                  ? 'text-emerald-400 font-semibold'
                  : isDegraded
                  ? 'text-amber-400 font-semibold'
                  : 'text-rose-400 font-semibold'
              }
            >
              {health ? health.status.toUpperCase() : 'CONNECTING...'}
            </span>
          </div>

          {/* Redis Status Badge */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs text-slate-300">
            <Database className="h-3.5 w-3.5 text-indigo-400" />
            <span>Redis 7:</span>
            <span
              className={`font-semibold ${
                redisConnected ? 'text-emerald-400' : 'text-slate-500'
              }`}
            >
              {redisConnected ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>

          {/* Refresh Action */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 text-xs font-medium transition active:scale-95 disabled:opacity-50"
            title="Refresh telemetry"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`}
            />
            <span className="hidden sm:inline">Sync</span>
          </button>
        </div>
      </div>
    </header>
  );
}
