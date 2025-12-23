/**
 * @fileoverview Tests for SyncSourcesClient component
 * Tests the sync sources display including repository details
 * Uses Vitest with React Testing Library
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SyncSourcesClient from '../app/dashboard/sync-sources-client';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }) => <a href={href}>{children}</a>,
}));

describe('SyncSourcesClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Source Display', () => {
    it('should render all sync sources', () => {
      render(<SyncSourcesClient subscription={null} connectedSources={[]} />);

      expect(screen.getByText('GitHub')).toBeInTheDocument();
      expect(screen.getByText('Dropbox')).toBeInTheDocument();
      expect(screen.getByText('Google Drive')).toBeInTheDocument();
      expect(screen.getByText('MarkSyncr Cloud')).toBeInTheDocument();
    });

    it('should show Connect button for disconnected sources', () => {
      render(<SyncSourcesClient subscription={null} connectedSources={[]} />);

      const connectButtons = screen.getAllByText('Connect');
      // GitHub, Dropbox, Google Drive should have Connect buttons
      expect(connectButtons.length).toBeGreaterThanOrEqual(3);
    });

    it('should show Connected status for connected sources', () => {
      const connectedSources = [
        { provider: 'github', repository: 'user/marksyncr-bookmarks' },
      ];

      render(<SyncSourcesClient subscription={null} connectedSources={connectedSources} />);

      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('should show Disconnect button for connected sources', () => {
      const connectedSources = [
        { provider: 'github', repository: 'user/marksyncr-bookmarks' },
      ];

      render(<SyncSourcesClient subscription={null} connectedSources={connectedSources} />);

      expect(screen.getByText('Disconnect')).toBeInTheDocument();
    });
  });

  describe('Repository Details Display', () => {
    it('should display repository name when connected', () => {
      const connectedSources = [
        {
          provider: 'github',
          repository: 'testuser/marksyncr-bookmarks',
          branch: 'main',
          file_path: 'bookmarks.json',
        },
      ];

      render(<SyncSourcesClient subscription={null} connectedSources={connectedSources} />);

      expect(screen.getByText('testuser/marksyncr-bookmarks')).toBeInTheDocument();
    });

    it('should display file path when connected', () => {
      const connectedSources = [
        {
          provider: 'github',
          repository: 'testuser/marksyncr-bookmarks',
          branch: 'main',
          file_path: 'bookmarks.json',
        },
      ];

      render(<SyncSourcesClient subscription={null} connectedSources={connectedSources} />);

      expect(screen.getByText('bookmarks.json')).toBeInTheDocument();
    });

    it('should display branch name when connected', () => {
      const connectedSources = [
        {
          provider: 'github',
          repository: 'testuser/marksyncr-bookmarks',
          branch: 'main',
          file_path: 'bookmarks.json',
        },
      ];

      render(<SyncSourcesClient subscription={null} connectedSources={connectedSources} />);

      expect(screen.getByText('Branch: main')).toBeInTheDocument();
    });

    it('should display View on GitHub link for GitHub sources', () => {
      const connectedSources = [
        {
          provider: 'github',
          repository: 'testuser/marksyncr-bookmarks',
          branch: 'main',
          file_path: 'bookmarks.json',
        },
      ];

      render(<SyncSourcesClient subscription={null} connectedSources={connectedSources} />);

      const link = screen.getByText('View on GitHub');
      expect(link).toBeInTheDocument();
      expect(link.closest('a')).toHaveAttribute(
        'href',
        'https://github.com/testuser/marksyncr-bookmarks'
      );
    });

    it('should not display repository details when not connected', () => {
      render(<SyncSourcesClient subscription={null} connectedSources={[]} />);

      expect(screen.queryByText('bookmarks.json')).not.toBeInTheDocument();
      expect(screen.queryByText('Branch: main')).not.toBeInTheDocument();
      expect(screen.queryByText('View on GitHub')).not.toBeInTheDocument();
    });

    it('should not display repository details when repository is null', () => {
      const connectedSources = [
        {
          provider: 'github',
          repository: null,
          branch: null,
          file_path: null,
        },
      ];

      render(<SyncSourcesClient subscription={null} connectedSources={connectedSources} />);

      expect(screen.queryByText('View on GitHub')).not.toBeInTheDocument();
    });
  });

  describe('MarkSyncr Cloud', () => {
    it('should be available for free users', () => {
      render(<SyncSourcesClient subscription={{ plan: 'free' }} connectedSources={[]} />);

      // MarkSyncr Cloud is now available on free tier
      expect(screen.queryByText('Pro plan required')).not.toBeInTheDocument();
      expect(screen.queryByText('Upgrade')).not.toBeInTheDocument();
    });

    it('should allow connection for free users', () => {
      render(<SyncSourcesClient subscription={{ plan: 'free' }} connectedSources={[]} />);

      // All 4 sources should have Connect buttons (GitHub, Dropbox, Google Drive, MarkSyncr Cloud)
      const connectButtons = screen.getAllByText('Connect');
      expect(connectButtons.length).toBe(4);
    });

    it('should allow connection for Pro users', () => {
      render(
        <SyncSourcesClient
          subscription={{ plan: 'pro', status: 'active' }}
          connectedSources={[]}
        />
      );

      // Should not show Pro plan required
      expect(screen.queryByText('Pro plan required')).not.toBeInTheDocument();
    });

    it('should allow connection for Team users', () => {
      render(
        <SyncSourcesClient
          subscription={{ plan: 'team', status: 'active' }}
          connectedSources={[]}
        />
      );

      // Should not show Pro plan required
      expect(screen.queryByText('Pro plan required')).not.toBeInTheDocument();
    });
  });

  describe('Multiple Connected Sources', () => {
    it('should display details for multiple connected sources', () => {
      const connectedSources = [
        {
          provider: 'github',
          repository: 'user/marksyncr-bookmarks',
          branch: 'main',
          file_path: 'bookmarks.json',
        },
        {
          provider: 'dropbox',
          repository: '/Apps/MarkSyncr',
          branch: null,
          file_path: 'bookmarks.json',
        },
      ];

      render(<SyncSourcesClient subscription={null} connectedSources={connectedSources} />);

      // Both should show Connected
      const connectedLabels = screen.getAllByText('Connected');
      expect(connectedLabels.length).toBe(2);

      // GitHub repo should be displayed
      expect(screen.getByText('user/marksyncr-bookmarks')).toBeInTheDocument();

      // Dropbox path should be displayed
      expect(screen.getByText('/Apps/MarkSyncr')).toBeInTheDocument();
    });
  });

  describe('getSourceDetails helper', () => {
    it('should return correct source details for connected provider', () => {
      const connectedSources = [
        {
          provider: 'github',
          repository: 'testuser/repo',
          branch: 'develop',
          file_path: 'data/bookmarks.json',
        },
      ];

      render(<SyncSourcesClient subscription={null} connectedSources={connectedSources} />);

      // Verify the details are displayed correctly
      expect(screen.getByText('testuser/repo')).toBeInTheDocument();
      expect(screen.getByText('Branch: develop')).toBeInTheDocument();
      expect(screen.getByText('data/bookmarks.json')).toBeInTheDocument();
    });
  });
});

describe('SyncSourcesClient Edge Cases', () => {
  it('should handle empty connectedSources array', () => {
    render(<SyncSourcesClient subscription={null} connectedSources={[]} />);

    // Should render without errors
    expect(screen.getByText('Sync Sources')).toBeInTheDocument();
  });

  it('should handle undefined connectedSources', () => {
    render(<SyncSourcesClient subscription={null} />);

    // Should render without errors (default to empty array)
    expect(screen.getByText('Sync Sources')).toBeInTheDocument();
  });

  it('should handle null subscription', () => {
    render(<SyncSourcesClient subscription={null} connectedSources={[]} />);

    // Should render without errors
    expect(screen.getByText('Sync Sources')).toBeInTheDocument();
  });

  it('should handle source with partial data', () => {
    const connectedSources = [
      {
        provider: 'github',
        repository: 'user/repo',
        // branch and file_path are undefined
      },
    ];

    render(<SyncSourcesClient subscription={null} connectedSources={connectedSources} />);

    // Should display repository but not branch/file_path
    expect(screen.getByText('user/repo')).toBeInTheDocument();
    expect(screen.queryByText('Branch:')).not.toBeInTheDocument();
  });
});
