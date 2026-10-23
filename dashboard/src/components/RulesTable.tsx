'use client';

import React, { useState } from 'react';
import {
  Check,
  Globe,
  Key,
  Layers,
  Network,
  Plus,
  Power,
  Shield,
  Sliders,
  X,
} from 'lucide-react';
import { RouteConfig } from '../lib/types';

interface RulesTableProps {
  rules: RouteConfig[];
  onAddRule: (newRule: RouteConfig) => Promise<boolean>;
  onToggleRule: (ruleId: string, currentEnabled: boolean) => Promise<void>;
}

export function RulesTable({ rules, onAddRule, onToggleRule }: RulesTableProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New rule form state
  const [id, setId] = useState('');
  const [pathPrefix, setPathPrefix] = useState('');
  const [upstreamUrl, setUpstreamUrl] = useState('');
  const [maxRequests, setMaxRequests] = useState('60');
  const [windowSeconds, setWindowSeconds] = useState('60');
  const [keyStrategy, setKeyStrategy] = useState<'routeAndIp' | 'ip' | 'apiKey'>('routeAndIp');
  const [stripPrefix, setStripPrefix] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!id.trim() || !pathPrefix.trim() || !upstreamUrl.trim()) {
      setErrorMsg('Please complete all required fields.');
      return;
    }

    if (!pathPrefix.startsWith('/')) {
      setErrorMsg('Path prefix must start with a slash (e.g. /api/users)');
      return;
    }

    try {
      new URL(upstreamUrl);
    } catch {
      setErrorMsg('Upstream URL must be a valid URL (e.g. http://localhost:8081)');
      return;
    }

    setIsSubmitting(true);
    const newRule: RouteConfig = {
      id: id.trim(),
      pathPrefix: pathPrefix.trim(),
      upstreamUrl: upstreamUrl.trim(),
      stripPrefix,
      rateLimit: {
        enabled: true,
        windowMs: Number(windowSeconds) * 1000,
        maxRequests: Number(maxRequests),
        keyStrategy,
      },
    };

    const success = await onAddRule(newRule);
    setIsSubmitting(false);

    if (success) {
      setIsModalOpen(false);
      // Reset form
      setId('');
      setPathPrefix('');
      setUpstreamUrl('');
      setMaxRequests('60');
      setWindowSeconds('60');
      setStripPrefix(false);
    } else {
      setErrorMsg('Failed to create rule. Verify gateway connectivity.');
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Sliders className="h-4 w-4 text-indigo-400" />
            Dynamic Route & Rate Limit Policies
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure upstream reverse proxy targets, sliding window capacities, and rate-limiting keys
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition active:scale-95"
        >
          <Plus className="h-4 w-4" />
          Add Rate Limit Rule
        </button>
      </div>

      {/* Rules Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/70 text-slate-400 font-semibold border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">Route ID & Path</th>
              <th className="px-4 py-3">Upstream Target</th>
              <th className="px-4 py-3">Sliding Window</th>
              <th className="px-4 py-3">Key Strategy</th>
              <th className="px-4 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {rules.map((rule) => {
              const windowSec = Math.round(rule.rateLimit.windowMs / 1000);
              const isEnabled = rule.rateLimit.enabled;

              return (
                <tr key={rule.id} className="hover:bg-slate-800/30 transition">
                  {/* Route ID & Path */}
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-white text-xs">{rule.id}</span>
                      {rule.stripPrefix && (
                        <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
                          strip prefix
                        </span>
                      )}
                    </div>
                    <div className="text-slate-400 font-mono text-[11px] mt-0.5">
                      {rule.pathPrefix}
                    </div>
                  </td>

                  {/* Upstream */}
                  <td className="px-4 py-3 font-mono text-slate-400 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Network className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                      <span className="truncate max-w-[200px]">{rule.upstreamUrl}</span>
                    </div>
                  </td>

                  {/* Window Limit */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 font-mono text-xs">
                      <span className="text-indigo-300 font-bold">
                        {rule.rateLimit.maxRequests} req
                      </span>
                      <span className="text-slate-500">/</span>
                      <span className="text-slate-400">{windowSec}s</span>
                    </div>
                  </td>

                  {/* Key Strategy */}
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 border border-slate-700 text-slate-300">
                      {rule.rateLimit.keyStrategy === 'apiKey' ? (
                        <Key className="h-2.5 w-2.5 text-amber-400" />
                      ) : (
                        <Globe className="h-2.5 w-2.5 text-cyan-400" />
                      )}
                      {rule.rateLimit.keyStrategy}
                    </span>
                  </td>

                  {/* Toggle Status */}
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onToggleRule(rule.id, isEnabled)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition ${
                        isEnabled
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                          : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      <Power className="h-3 w-3" />
                      {isEnabled ? 'Enabled' : 'Bypassed'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add Rule Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-base font-bold text-white flex items-center gap-2 mb-1">
              <Shield className="h-5 w-5 text-indigo-400" />
              Register Rate Limit Policy
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Dynamically maps an HTTP path prefix to an upstream target with sliding window limits.
            </p>

            {errorMsg && (
              <div className="mb-4 rounded-lg bg-rose-500/10 border border-rose-500/30 p-2.5 text-xs text-rose-300">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Rule Identifier</label>
                <input
                  type="text"
                  placeholder="e.g. auth-service"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Path Prefix</label>
                <input
                  type="text"
                  placeholder="e.g. /api/v1/auth"
                  value={pathPrefix}
                  onChange={(e) => setPathPrefix(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Upstream URL</label>
                <input
                  type="text"
                  placeholder="e.g. http://127.0.0.1:8085"
                  value={upstreamUrl}
                  onChange={(e) => setUpstreamUrl(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none font-mono"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Max Requests</label>
                  <input
                    type="number"
                    min="1"
                    value={maxRequests}
                    onChange={(e) => setMaxRequests(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Window (Seconds)</label>
                  <input
                    type="number"
                    min="1"
                    value={windowSeconds}
                    onChange={(e) => setWindowSeconds(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Rate Limit Key Strategy</label>
                <select
                  value={keyStrategy}
                  onChange={(e) =>
                    setKeyStrategy(e.target.value as 'routeAndIp' | 'ip' | 'apiKey')
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value="routeAndIp">Route + Client IP (Recommended)</option>
                  <option value="ip">Global Client IP</option>
                  <option value="apiKey">API Key Header (x-api-key)</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="stripPrefixCheckbox"
                  checked={stripPrefix}
                  onChange={(e) => setStripPrefix(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-0"
                />
                <label htmlFor="stripPrefixCheckbox" className="text-slate-300 cursor-pointer">
                  Strip path prefix before forwarding to upstream
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md shadow-indigo-600/20 disabled:opacity-50"
                >
                  {isSubmitting ? 'Registering...' : 'Register Policy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
