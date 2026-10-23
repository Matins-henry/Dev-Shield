'use client';

import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { PieChart as PieChartIcon } from 'lucide-react';
import { StatusCodeCounts } from '../lib/types';

interface StatusCodeDistributionProps {
  statusCodes: StatusCodeCounts | undefined;
}

export function StatusCodeDistribution({ statusCodes }: StatusCodeDistributionProps) {
  const codes = statusCodes || { '2xx': 0, '4xx': 0, '429': 0, '5xx': 0, other: 0 };
  const total = Object.values(codes).reduce((a, b) => a + b, 0);

  const data = [
    { name: '2xx Success', count: codes['2xx'], color: '#10b981', code: '2xx' },
    { name: '429 Rate Limited', count: codes['429'], color: '#f43f5e', code: '429' },
    { name: '4xx Client Errors', count: codes['4xx'], color: '#f59e0b', code: '4xx' },
    { name: '5xx Server Errors', count: codes['5xx'], color: '#8b5cf6', code: '5xx' },
  ];

  const getPercentage = (count: number) => {
    if (total === 0) return '0.0%';
    return `${((count / total) * 100).toFixed(1)}%`;
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm flex flex-col justify-between">
      <div>
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <PieChartIcon className="h-4 w-4 text-indigo-400" />
          HTTP Status Code Distribution
        </h3>
        <p className="text-xs text-slate-400 mt-0.5">Gateway & Downstream Response Breakdown</p>
      </div>

      <div className="my-3 flex items-center justify-center h-44">
        {total > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data.filter((d) => d.count > 0)}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={75}
                paddingAngle={4}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="#0f172a" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0];
                    return (
                      <div className="rounded-lg border border-slate-700 bg-slate-900/95 p-2 shadow-lg text-xs">
                        <span className="font-medium text-slate-200">{item?.name}:</span>{' '}
                        <span className="font-mono font-bold text-white">
                          {Number(item?.value).toLocaleString()} ({getPercentage(Number(item?.value))})
                        </span>
                      </div>
                    );
                  }
                  return null;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-500 text-xs">
            <span>Awaiting incoming traffic...</span>
          </div>
        )}
      </div>

      {/* Legend & Breakdown bars */}
      <div className="space-y-2 text-xs">
        {data.map((item) => (
          <div key={item.code} className="space-y-1">
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                {item.name}
              </span>
              <span className="font-mono text-slate-400">
                {item.count.toLocaleString()}{' '}
                <span className="text-[11px] text-slate-500">({getPercentage(item.count)})</span>
              </span>
            </div>
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: total > 0 ? `${(item.count / total) * 100}%` : '0%',
                  backgroundColor: item.color,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
