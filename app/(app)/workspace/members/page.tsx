'use client';

/**
 * Workspace Members Page
 * 
 * ONLY rendered for Business workspaces (hidden completely for Personal).
 * 
 * Allows workspace admins to:
 * - View all members
 * - Invite new members
 * - Remove members (except last admin)
 * - Change member roles
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import type { Workspace, WorkspaceMember } from '@/types/workspace';

export default function WorkspaceMembersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace_id');

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite dialog state
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [isInviting, setIsInviting] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      // Fetch workspace to check type
      const workspaceRes = await fetch(`/api/workspace/${workspaceId}`);
      const workspaceData = await workspaceRes.json();

      if (!workspaceRes.ok) {
        throw new Error(workspaceData.error?.message || 'Gagal memuat workspace');
      }

      const ws = workspaceData.data;
      setWorkspace(ws);

      // Redirect if Personal workspace (this page should not be accessible)
      if (ws.type === 'personal') {
        router.push(`/workspace/settings?workspace_id=${workspaceId}`);
        return;
      }

      // Fetch members
      const membersRes = await fetch(`/api/workspace/${workspaceId}/members`);
      const membersData = await membersRes.json();

      if (!membersRes.ok) {
        throw new Error(membersData.error?.message || 'Gagal memuat anggota');
      }

      setMembers(membersData.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data');
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, router]);

  // Mount-time load, written as a .then() chain rather than calling the
  // fetchData() helper above — calling a named async function that
  // eventually calls setState from inside a useEffect gets flagged by the
  // React Compiler's set-state-in-effect check even though the actual
  // setState calls happen after an await; see the identical pattern in
  // app/(app)/profile/page.tsx. fetchData() itself stays available for the
  // post-mutation refreshes below (handleInvite/handleRemoveMember), which
  // run from event handlers, not effects.
  useEffect(() => {
    if (!workspaceId) return;

    fetch(`/api/workspace/${workspaceId}`)
      .then(async (workspaceRes) => {
        const workspaceData = await workspaceRes.json();
        if (!workspaceRes.ok) {
          throw new Error(workspaceData.error?.message || 'Gagal memuat workspace');
        }

        const ws = workspaceData.data;
        setWorkspace(ws);

        if (ws.type === 'personal') {
          router.push(`/workspace/settings?workspace_id=${workspaceId}`);
          return null;
        }

        const membersRes = await fetch(`/api/workspace/${workspaceId}/members`);
        const membersData = await membersRes.json();
        if (!membersRes.ok) {
          throw new Error(membersData.error?.message || 'Gagal memuat anggota');
        }
        return membersData.data;
      })
      .then((members) => {
        if (members) setMembers(members);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Gagal memuat data');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [workspaceId, router]);

  const handleInvite = async () => {
    if (!workspaceId || !inviteEmail.trim()) return;

    setError(null);
    setIsInviting(true);

    try {
      const response = await fetch(`/api/workspace/${workspaceId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Hanya admin yang dapat mengundang anggota');
        }
        if (response.status === 409) {
          throw new Error('User sudah menjadi anggota workspace ini');
        }
        throw new Error(data.error?.message || 'Gagal mengundang anggota');
      }

      // Success - refresh members list
      setShowInviteDialog(false);
      setInviteEmail('');
      setInviteRole('member');
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengundang anggota');
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!workspaceId) return;

    setError(null);

    try {
      const response = await fetch(
        `/api/workspace/${workspaceId}/members/${memberId}`,
        { method: 'DELETE' }
      );

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 422) {
          throw new Error('Tidak dapat menghapus admin terakhir. Promosikan anggota lain ke admin terlebih dahulu.');
        }
        throw new Error(data.error?.message || 'Gagal menghapus anggota');
      }

      // Success - refresh members list
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus anggota');
    }
  };

  if (!workspaceId) {
    return (
      <div className="container max-w-3xl py-8">
        <Alert variant="destructive">Workspace ID tidak ditemukan</Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container max-w-3xl py-8 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error && !workspace) {
    return (
      <div className="container max-w-3xl py-8">
        <Alert variant="destructive">{error}</Alert>
        <Button className="mt-4" onClick={() => router.back()}>
          Kembali
        </Button>
      </div>
    );
  }

  const adminCount = members.filter((m) => m.role === 'admin').length;

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Anggota Workspace</h1>
          <p className="text-muted-foreground">
            Kelola anggota workspace <strong>{workspace?.name}</strong>
          </p>
        </div>
        
        {/* Invite Button */}
        <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
          <DialogTrigger asChild>
            <Button>+ Undang Anggota</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Undang Anggota Baru</DialogTitle>
              <DialogDescription>
                Kirim undangan ke email untuk bergabung ke workspace
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="nama@email.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  disabled={isInviting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <select
                  id="role"
                  className="w-full px-3 py-2 rounded-md border bg-background"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
                  disabled={isInviting}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  Admin dapat mengelola workspace dan anggota
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowInviteDialog(false)}
                disabled={isInviting}
              >
                Batal
              </Button>
              <Button onClick={handleInvite} disabled={isInviting || !inviteEmail}>
                {isInviting ? 'Mengundang...' : 'Kirim Undangan'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">{error}</Alert>
      )}

      {/* Members List */}
      <Card>
        <CardHeader>
          <CardTitle>Anggota ({members.length})</CardTitle>
          <CardDescription>
            Daftar semua anggota workspace
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between p-3 rounded-lg border"
              >
                <div className="flex-1">
                  <p className="font-medium">
                    {member.display_name || 'User'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {member.user_id}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      member.role === 'admin'
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {member.role === 'admin' ? '👑 Admin' : 'Member'}
                  </span>
                  
                  {/* Remove Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-critical hover:text-critical"
                    disabled={member.role === 'admin' && adminCount === 1}
                    onClick={() =>
                      setRemoveTarget({ id: member.id, name: member.display_name || 'anggota ini' })
                    }
                  >
                    Hapus
                  </Button>
                </div>
              </div>
            ))}

            {members.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                Belum ada anggota
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Info Note */}
      <Alert>
        <p className="text-sm">
          💡 <strong>Catatan:</strong> Admin terakhir tidak dapat dihapus.
          Promosikan anggota lain ke admin terlebih dahulu jika ingin menghapus diri sendiri.
        </p>
      </Alert>

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        title="Hapus Anggota?"
        description={
          removeTarget
            ? `Apakah Anda yakin ingin menghapus ${removeTarget.name}? Tindakan ini tidak dapat dibatalkan.`
            : ''
        }
        variant="destructive"
        onConfirm={() => {
          if (removeTarget) handleRemoveMember(removeTarget.id);
        }}
      />
    </div>
  );
}
