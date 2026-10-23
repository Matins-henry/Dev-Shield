'use client';

import React, { useState } from 'react';
import { AlertCircle, CheckCircle, Flame, Send, ShieldAlert, Zap } from 'lucide-react';
import { simulateTraffic } from '../lib/api';
import { RouteConfig } from '../lib/types';

interface TrafficSimulatorProps {
  routes: RouteConfig[];
  onBurstCompleted: () => void;
}

export function TrafficSimulator({ routes, onBurstCompleted }: TrafficSimulatorProps) {
  const [selectedRoute, setSelectedRoute] = useState(routes[0]?.pathPrefix || '/api/v1/echo');
  const [burstCount, setBurstCount] = useState(15);
  const [isLoading, setIsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<{
    success: number;
    blocked: number;
    errors: number;
  } | null>(null);

  const handleSimulate = async () => {
    setIsLoading(true);
    setLastResult(null);

    const result = await simulateTraffic(selectedRoute, burstCount);
    setLastResult(result);
    setIsLoading(false);
    onBurstCompleted();
  };

  return (
    <div className="rounded-xl border border-indigo-500/20 bg-gradient-to-r from-indigo-950/40 via-slate-900/60 to-purple-950/30 p-5 backdrop-blur-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-400">
              <Flame className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-bold text-white">Live Traffic & 429 Burst Simulator</h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Dispatch concurrent requests to test the sliding-window limiter and observe real-time mitigation.
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Target:</span>
            <select
              value={selectedRoute}
              onChange={(e) => setSelectedRoute(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-850 px-2.5 py-1.5 text-xs text-white bg-slate-900 focus:border-indigo-500 focus:outline-none font-mono"
            >
              {routes.map((r) => (
                <option key={r.id} value={r.pathPrefix}>
                  {r.id} ({r.pathPrefix})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Burst:</span>
            <div className="flex rounded-lg border border-slate-700 bg-slate-900 p-0.5 text-xs">
              {[5, 15, 30].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setBurstCount(num)}
                  className={`px-2.5 py-1 rounded-md font-mono text-xs transition ${
                    burstCount === num
                      ? 'bg-indigo-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {num}x
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleSimulate}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition active:scale-95 disabled:opacity-50"
          >
            <Zap className={`h-3.5 w-3.5 ${isLoading ? 'animate-bounce text-amber-300' : ''}`} />
            {isLoading ? 'Bursting...' : 'Fire Burst'}
          </button>
        </div>
      </div>

      {/* Simulator Results Pill */}
      {lastResult && (
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-4 text-xs font-mono">
          <span className="text-slate-400 font-sans font-medium">Burst Outcome:</span>
          <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md">
            <CheckCircle className="h-3.5 w-3.5" />
            <span>{lastResult.success} Allowed (200 OK)</span>
          </div>
          <div className="flex items-center gap-1.5 text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-md">
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>{lastResult.blocked} Blocked (429 Rate Limit)</span>
          </div>
          {lastResult.errors > 0 && (
            <div className="flex items-center gap-1.5 text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-md">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>{lastResult.errors} Errors</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
