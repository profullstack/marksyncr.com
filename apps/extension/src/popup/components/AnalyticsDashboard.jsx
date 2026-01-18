/**
 * @fileoverview Analytics Dashboard component for Pro users
 * Displays bookmark statistics, insights, and visualizations
 */

import { useState, useEffect, useMemo } from 'react';
import {
  calculateBookmarkStats,
  getTopDomains,
  getBookmarksByAge,
  getBookmarksByFolder,
  getTagDistribution,
  generateInsights,
  calculateHealthScore,
} from '@marksyncr/core';

/**
 * Progress bar component for health scores
 */
const ProgressBar = ({ value, color = 'blue', label }) => (
  <div className="mb-3">
    <div className="flex justify-between text-xs mb-1">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium">{value}%</span>
    </div>
    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
      <div
        className={`h-full bg-${color}-500 rounded-full transition-all duration-500`}
        style={{ width: `${value}%` }}
      />
    </div>
  </div>
);

/**
 * Stat card component
 */
const StatCard = ({ icon, label, value, subtext }) => (
  <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
    <div className="flex items-center gap-2 mb-1">
      <span className="text-lg">{icon}</span>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
    <div className="text-xl font-bold text-gray-900">{value}</div>
    {subtext && <div className="text-xs text-gray-500 mt-1">{subtext}</div>}
  </div>
);

/**
 * Insight card component
 */
const InsightCard = ({ insight }) => {
  const severityColors = {
    info: 'blue',
    warning: 'yellow',
    error: 'red',
  };
  const color = severityColors[insight.severity] || 'gray';

  return (
    <div className={`p-3 rounded-lg bg-${color}-50 border border-${color}-200`}>
      <p className={`text-sm text-${color}-800`}>{insight.message}</p>
      {insight.action && (
        <p className={`text-xs text-${color}-600 mt-1 font-medium`}>💡 {insight.action}</p>
      )}
    </div>
  );
};

/**
 * Domain list item
 */
const DomainItem = ({ domain, count, totalVisits, maxCount }) => {
  const percentage = (count / maxCount) * 100;

  return (
    <div className="flex items-center gap-2 py-1">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{domain}</div>
        <div className="h-1.5 bg-gray-100 rounded-full mt-1">
          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${percentage}%` }} />
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-medium text-gray-900">{count}</div>
        <div className="text-xs text-gray-500">{totalVisits} visits</div>
      </div>
    </div>
  );
};

/**
 * Tag distribution item
 */
const TagItem = ({ tag, count, percentage }) => (
  <div className="flex items-center justify-between py-1">
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
      {tag}
    </span>
    <span className="text-xs text-gray-500">
      {count} ({Math.round(percentage)}%)
    </span>
  </div>
);

/**
 * Age distribution chart (simple bar chart)
 */
const AgeChart = ({ data }) => {
  const categories = [
    { key: 'thisWeek', label: 'This Week', color: 'green' },
    { key: 'thisMonth', label: 'This Month', color: 'blue' },
    { key: 'thisYear', label: 'This Year', color: 'yellow' },
    { key: 'older', label: 'Older', color: 'gray' },
  ];

  const maxValue = Math.max(data.thisWeek, data.thisMonth, data.thisYear, data.older, 1);

  return (
    <div className="space-y-2">
      {categories.map(({ key, label, color }) => (
        <div key={key} className="flex items-center gap-2">
          <span className="text-xs text-gray-600 w-20">{label}</span>
          <div className="flex-1 h-4 bg-gray-100 rounded">
            <div
              className={`h-full bg-${color}-500 rounded`}
              style={{ width: `${(data[key] / maxValue) * 100}%` }}
            />
          </div>
          <span className="text-xs font-medium w-8 text-right">{data[key]}</span>
        </div>
      ))}
    </div>
  );
};

/**
 * Main Analytics Dashboard component
 */
export default function AnalyticsDashboard({ bookmarks, folders, isPro, onUpgrade }) {
  const [activeTab, setActiveTab] = useState('overview');

  // Calculate all analytics data
  const analytics = useMemo(() => {
    if (!bookmarks || bookmarks.length === 0) {
      return null;
    }

    const folderMap =
      folders?.reduce((acc, f) => {
        acc[f.id] = f;
        return acc;
      }, {}) || {};

    return {
      stats: calculateBookmarkStats(bookmarks, folderMap),
      topDomains: getTopDomains(bookmarks, 10),
      ageDistribution: getBookmarksByAge(bookmarks),
      folderDistribution: getBookmarksByFolder(bookmarks, folderMap),
      tagDistribution: getTagDistribution(bookmarks, 10),
      insights: generateInsights(bookmarks, folderMap),
      healthScore: calculateHealthScore(bookmarks),
    };
  }, [bookmarks, folders]);

  // Show upgrade prompt for non-Pro users
  if (!isPro) {
    return (
      <div className="p-4 text-center">
        <div className="text-4xl mb-3">📊</div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Bookmark Analytics</h3>
        <p className="text-sm text-gray-600 mb-4">
          Get insights into your bookmark collection with detailed statistics, health scores, and
          actionable recommendations.
        </p>
        <button
          onClick={onUpgrade}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
        >
          Upgrade to Pro
        </button>
      </div>
    );
  }

  // Show empty state
  if (!analytics) {
    return (
      <div className="p-4 text-center text-gray-500">
        <div className="text-4xl mb-2">📭</div>
        <p className="text-sm">No bookmarks to analyze yet.</p>
      </div>
    );
  }

  const { stats, topDomains, ageDistribution, tagDistribution, insights, healthScore } = analytics;

  return (
    <div className="p-4 space-y-4 max-h-[500px] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">📊 Analytics</h2>
        <div className="flex gap-1">
          {['overview', 'domains', 'insights'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-2 py-1 text-xs rounded ${
                activeTab === tab ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          {/* Health Score */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-900">Collection Health</h3>
              <div className="text-2xl font-bold text-blue-600">{healthScore.overall}%</div>
            </div>
            <ProgressBar value={healthScore.organization} color="green" label="Organization" />
            <ProgressBar value={healthScore.freshness} color="blue" label="Freshness" />
            <ProgressBar value={healthScore.engagement} color="purple" label="Engagement" />
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-2">
            <StatCard icon="🔖" label="Total Bookmarks" value={stats.totalBookmarks} />
            <StatCard icon="🌐" label="Unique Domains" value={stats.uniqueDomains} />
            <StatCard
              icon="🏷️"
              label="Tags Used"
              value={stats.totalTags}
              subtext={`${Math.round(stats.taggedPercentage)}% tagged`}
            />
            <StatCard icon="👁️" label="Total Visits" value={stats.totalVisits} />
          </div>

          {/* Age Distribution */}
          <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
            <h3 className="font-medium text-gray-900 mb-3">📅 Bookmark Age</h3>
            <AgeChart data={ageDistribution} />
          </div>

          {/* Top Tags */}
          {tagDistribution.length > 0 && (
            <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
              <h3 className="font-medium text-gray-900 mb-2">🏷️ Top Tags</h3>
              <div className="space-y-1">
                {tagDistribution.slice(0, 5).map((item) => (
                  <TagItem key={item.tag} {...item} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Domains Tab */}
      {activeTab === 'domains' && (
        <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
          <h3 className="font-medium text-gray-900 mb-3">🌐 Top Domains</h3>
          {topDomains.length > 0 ? (
            <div className="space-y-2">
              {topDomains.map((domain) => (
                <DomainItem key={domain.domain} {...domain} maxCount={topDomains[0].count} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-4">No domain data available</p>
          )}
        </div>
      )}

      {/* Insights Tab */}
      {activeTab === 'insights' && (
        <div className="space-y-3">
          <h3 className="font-medium text-gray-900">💡 Insights & Recommendations</h3>

          {/* Health Recommendations */}
          {healthScore.recommendations.length > 0 && (
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
              <h4 className="text-sm font-medium text-blue-800 mb-2">Recommendations</h4>
              <ul className="space-y-1">
                {healthScore.recommendations.map((rec, i) => (
                  <li key={i} className="text-sm text-blue-700 flex items-start gap-2">
                    <span>•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Generated Insights */}
          {insights.length > 0 ? (
            <div className="space-y-2">
              {insights.map((insight, i) => (
                <InsightCard key={i} insight={insight} />
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <div className="text-3xl mb-2">✨</div>
              <p className="text-sm text-gray-600">
                Your bookmark collection looks great! No issues detected.
              </p>
            </div>
          )}

          {/* Most Visited */}
          {stats.mostVisited && stats.mostVisited.visitCount > 0 && (
            <div className="bg-green-50 rounded-lg p-3 border border-green-200">
              <h4 className="text-sm font-medium text-green-800 mb-1">🏆 Most Visited</h4>
              <p className="text-sm text-green-700 truncate">{stats.mostVisited.title}</p>
              <p className="text-xs text-green-600">{stats.mostVisited.visitCount} visits</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
