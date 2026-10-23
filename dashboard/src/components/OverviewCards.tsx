'use client';

import React from 'react';
import { Activity, AlertOctagon, CheckCircle2, Clock, Layers, ShieldAlert, Zap } from 'lucide-react';
import { AggregatedMetrics } from '../lib/types';

interface OverviewCardsProps {
  metrics: AggregatedMetrics | null;
  ruleCount: number;
}

export function OverviewCards({ metrics, ruleCount }: OverviewCardsProps) {
  const total = metrics?.totalRequests ?? 0;
  const blocked = metrics?.totalBlocked ?? 0;
  const blockRate = total > 0 ? ((blocked / total) * 100).toFixed(1) : '0.0';
  const p95 = metrics?.p95LatencyMs ?? 0;
  const p99 = metrics?.p99LatencyMs ?? 0;
  const avgLatency = metrics?.avgLatencyMs ?? 0;
  const activeKeys = metrics?.activeRateLimitKeys ?? 0;

  const cards = [
    {
      title: 'Total Requests',
      value: total.toLocaleString(),
      subtitle: `Avg Latency: ${avgLatency}ms`,
      icon: Activity,
      gradient: 'from-blue-500/20 to-indigo-500/10',
      iconColor: 'text-blue-400',
      badge: 'All-time Forwarded',
      badgeColor: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    },
    {
      title: '429 Rate Limit Hits',
      value: blocked.toLocaleString(),
      subtitle: `${blockRate}% Block Rate`,
      icon: ShieldAlert,
      gradient: 'from-rose-500/20 to-red-500/10',
      iconColor: 'text-rose-400',
      badge: blocked > 0 ? 'Threat Mitigation Active' : 'Zero Breaches',
      badgeColor:
        blocked > 0
          ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
          : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    },
    {
      title: 'Active Gateway Rules',
      value: ruleCount.toString(),
      subtitle: `${activeKeys} Active IP Windows in Redis`,
      icon: Layers,
      gradient: 'from-indigo-500/20 to-violet-500/10',
      iconColor: 'text-indigo-400',
      badge: 'Sliding Window',
      badgeColor: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
    },
    {
      title: 'P95 Latency',
      value: `${p95}ms`,
      subtitle: `P99: ${p99}ms | Avg: ${avgLatency}ms`,
      icon: Clock,
      gradient: 'from-emerald-500/20 to-teal-500/10',
      iconColor: 'text-emerald-400',
      badge: p95 < 50 ? 'Sub-50ms Ultra Fast' : 'Normal',
      badgeColor: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, i) => {
        const Icon = card.icon;
        return (
          <div
            key={i}
            className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm transition hover:border-slate-700 hover:shadow-lg hover:shadow-indigo-500/5"
          >
            <div
              className={`absolute -right-4 -top-4 h-24 w-24 rounded-full bg-gradient-to-br ${card.gradient} blur-2xl pointer-events-none`}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">{card.title}</span>
              <div className="rounded-lg bg-slate-800/80 p-2 border border-slate-700/60">
                <Icon className={`h-4 w-4 ${card.iconColor}`} />
              </div>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-mono">
                {card.value}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs">
              <span className="text-slate-400 font-mono text-[11px]">{card.subtitle}</span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${card.badgeColor}`}
              >
                {card.badge}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
