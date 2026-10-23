'use client';

import React, { useEffect, useState } from 'react';
import { Navbar } from '../components/Navbar';
import { OverviewCards } from '../components/OverviewCards';
import { RulesTable } from '../components/RulesTable';
import { StatusCodeDistribution } from '../components/StatusCodeDistribution';
import { TrafficChart } from '../components/TrafficChart';
import { TrafficSimulator } from '../components/TrafficSimulator';
import {
  createOrUpdateRule,
  fetchHealth,
  fetchMetrics,
  fetchRules,
} from '../lib/api';
import {
  AggregatedMetrics,
  HealthStatus,
  RouteConfig,
  TrafficDataPoint,
} from '../lib/types';

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [metrics, setMetrics] = useState<AggregatedMetrics | null>(null);
  const [rules, setRules] = useState<RouteConfig[]>([]);
  const [trafficHistory, setTrafficHistory] = useState<TrafficDataPoint[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastTotalRequests, setLastTotalRequests] = useState<number | null>(null);
  const [lastTotalBlocked, setLastTotalBlocked] = useState<number | null>(null);

  // Initial load & Polling
  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const [healthData, metricsData, rulesData] = await Promise.all([
        fetchHealth(),
        fetchMetrics(),
        fetchRules(),
      ]);

      setHealth(healthData);
      setMetrics(metricsData);
      setRules(rulesData);

      // Compute rolling delta for the time-series chart
      const nowStr = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      const currentTotal = metricsData.totalRequests;
      const currentBlocked = metricsData.totalBlocked;

      let deltaRequests = 0;
      let deltaBlocked = 0;

      if (lastTotalRequests !== null && lastTotalBlocked !== null) {
        deltaRequests = Math.max(0, currentTotal - lastTotalRequests);
        deltaBlocked = Math.max(0, currentBlocked - lastTotalBlocked);
      } else {
        // First tick initial baseline
        deltaRequests = Math.floor(Math.random() * 8) + 2;
        deltaBlocked = Math.floor(Math.random() * 2);
      }

      setLastTotalRequests(currentTotal);
      setLastTotalBlocked(currentBlocked);

      setTrafficHistory((prev) => {
        const nextPoint: TrafficDataPoint = {
          time: nowStr,
          requests: deltaRequests,
          blocked: deltaBlocked,
          latency: metricsData.avgLatencyMs,
        };
        const updated = [...prev, nextPoint];
        return updated.slice(-15); // Keep last 15 intervals
      });
    } catch (err) {
      console.error('Failed to load dashboard telemetry', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    // Populate initial historical curve
    const initialPoints: TrafficDataPoint[] = [];
    const now = Date.now();
    for (let i = 10; i >= 1; i--) {
      const timeStr = new Date(now - i * 3000).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      initialPoints.push({
        time: timeStr,
        requests: Math.floor(Math.random() * 15) + 5,
        blocked: Math.random() > 0.7 ? Math.floor(Math.random() * 3) + 1 : 0,
        latency: Math.floor(Math.random() * 20) + 10,
      });
    }
    setTrafficHistory(initialPoints);

    void loadData();

    // Auto-refresh every 3.5 seconds
    const interval = setInterval(() => {
      void loadData();
    }, 3500);

    return () => clearInterval(interval);
  }, []);

  const handleAddRule = async (newRule: RouteConfig): Promise<boolean> => {
    const success = await createOrUpdateRule(newRule);
    if (success) {
      setRules((prev) => [...prev.filter((r) => r.id !== newRule.id), newRule]);
      void loadData();
    }
    return success;
  };

  const handleToggleRule = async (ruleId: string, currentEnabled: boolean): Promise<void> => {
    const target = rules.find((r) => r.id === ruleId);
    if (!target) return;

    const updated: RouteConfig = {
      ...target,
      rateLimit: {
        ...target.rateLimit,
        enabled: !currentEnabled,
      },
    };

    // Optimistic UI update
    setRules((prev) => prev.map((r) => (r.id === ruleId ? updated : r)));
    await createOrUpdateRule(updated);
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans selection:bg-indigo-500/20">
      {/* Top Navigation */}
      <Navbar health={health} onRefresh={() => void loadData()} isRefreshing={isRefreshing} />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Banner / Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-slate-800/80">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Observability & Security Console
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Sliding-window Redis log inspection, traffic governance, and latency telemetry
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto text-xs text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Telemetry streaming every 3.5s</span>
          </div>
        </div>

        {/* 1. Overview Metric Cards */}
        <OverviewCards metrics={metrics} ruleCount={rules.length} />

        {/* 2. Interactive Burst Simulator */}
        <TrafficSimulator routes={rules} onBurstCompleted={() => void loadData()} />

        {/* 3. Analytics Section: Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <TrafficChart data={trafficHistory} />
          </div>
          <div className="lg:col-span-1">
            <StatusCodeDistribution statusCodes={metrics?.statusCodes} />
          </div>
        </div>

        {/* 4. Rate Limiting Rules Table */}
        <RulesTable
          rules={rules}
          onAddRule={handleAddRule}
          onToggleRule={handleToggleRule}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-4 text-center text-xs text-slate-500">
        DevShield API Gateway • sliding-window rate limiting engine with Fastify, Redis 7 & Next.js
      </footer>
    </div>
  );
}
