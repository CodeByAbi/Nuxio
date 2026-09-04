'use client';

/**
 * Workspace Switcher Component
 * 
 * Only appears if user has >1 workspace.
 * Shows dropdown to switch between workspaces.
 */

import { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface WorkspaceInfo {
  id: string;
  name: string;
  type: 'personal' | 'business';
  role: 'admin' | 'member';
  created_at: string;
}

interface WorkspaceSwitcherProps {
  currentWorkspaceId?: string;
}

export function WorkspaceSwitcher({ currentWorkspaceId }: WorkspaceSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  // TODO(Phase 4): there is no GET /api/workspace list endpoint yet, so this
  // always stays empty and the switcher stays hidden (see the
  // `workspaces.length <= 1` guard below). Wiring this up is frontend
  // feature work tracked separately from this backend/DB repair — see
  // docs/Phase-3-Workspace-Category.md "Known Gaps".
  const [workspaces] = useState<WorkspaceInfo[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const handleSwitchWorkspace = (workspaceId: string) => {
    // Update query param workspace_id in current route
    const params = new URLSearchParams(searchParams.toString());
    params.set('workspace_id', workspaceId);
    
    router.push(`${pathname}?${params.toString()}`);
    setIsOpen(false);
  };

  // Don't show switcher if only 1 workspace
  if (workspaces.length <= 1) {
    return null;
  }

  const currentWorkspace = workspaces.find((w) => w.id === currentWorkspaceId);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          <span className="flex items-center gap-2 truncate">
            <span className="text-lg">
              {currentWorkspace?.type === 'personal' ? '👤' : '🏢'}
            </span>
            <span className="truncate">
              {currentWorkspace?.name || 'Pilih Workspace'}
            </span>
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="ml-2 shrink-0"
          >
            <path d="m7 15 5 5 5-5" />
            <path d="m7 9 5-5 5 5" />
          </svg>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pilih Workspace</DialogTitle>
          <DialogDescription>
            Switch ke workspace lain untuk melihat data yang berbeda
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-4">
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              onClick={() => handleSwitchWorkspace(workspace.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors hover:bg-accent ${
                workspace.id === currentWorkspaceId
                  ? 'bg-primary/5 border-primary'
                  : ''
              }`}
            >
              <span className="text-2xl">
                {workspace.type === 'personal' ? '👤' : '🏢'}
              </span>
              <div className="flex-1 text-left">
                <p className="font-medium">{workspace.name}</p>
                <p className="text-xs text-muted-foreground">
                  {workspace.type === 'personal' ? 'Personal' : 'Business'} •{' '}
                  {workspace.role === 'admin' ? 'Admin' : 'Member'}
                </p>
              </div>
              {workspace.id === currentWorkspaceId && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-primary"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
