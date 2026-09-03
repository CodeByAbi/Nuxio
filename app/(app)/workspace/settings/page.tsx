'use client';

/**
 * Workspace Settings Page
 * 
 * Allows workspace admins to:
 * - Edit workspace name
 * - View workspace type (read-only)
 * - View workspace details (currency, timezone, plan)
 */

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import type { Workspace } from '@/types/workspace';

export default function WorkspaceSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace_id');

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Fetch workspace data
  useEffect(() => {
    if (!workspaceId) {
      setError('Workspace ID tidak ditemukan');
      setIsLoading(false);
      return;
    }

    fetchWorkspace();
  }, [workspaceId]);

  const fetchWorkspace = async () => {
    try {
      const response = await fetch(`/api/workspace/${workspaceId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Gagal memuat workspace');
      }

      setWorkspace(data.data);
      setName(data.data.name);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!workspaceId || !name.trim()) return;

    setError(null);
    setSuccess(false);
    setIsSaving(true);

    try {
      // Validate name length
      if (name.length < 3 || name.length > 50) {
        throw new Error('Nama workspace harus 3-50 karakter');
      }

      const response = await fetch(`/api/workspace/${workspaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Anda harus admin untuk mengubah pengaturan');
        }
        throw new Error(data.error?.message || 'Gagal menyimpan perubahan');
      }

      setWorkspace(data.data);
      setSuccess(true);
      
      // Hide success message after 2.5 seconds
      setTimeout(() => setSuccess(false), 2500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container max-w-2xl py-8 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error && !workspace) {
    return (
      <div className="container max-w-2xl py-8">
        <Alert variant="destructive">
          {error}
        </Alert>
        <Button
          className="mt-4"
          onClick={() => router.back()}
        >
          Kembali
        </Button>
      </div>
    );
  }

  const hasChanges = workspace && name !== workspace.name;

  return (
    <div className="container max-w-2xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pengaturan Workspace</h1>
        <p className="text-muted-foreground">
          Kelola informasi workspace Anda
        </p>
      </div>

      {/* Success Alert */}
      {success && (
        <Alert className="bg-safe text-safe-foreground border-safe">
          ✓ Perubahan berhasil disimpan!
        </Alert>
      )}

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          {error}
        </Alert>
      )}

      {/* Workspace Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Informasi Workspace</CardTitle>
          <CardDescription>
            Informasi dasar workspace Anda
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Workspace Name (Editable) */}
          <div className="space-y-2">
            <Label htmlFor="name">Nama Workspace</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={3}
              maxLength={50}
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">
              {name.length}/50 karakter (minimal 3)
            </p>
          </div>

          {/* Workspace Type (Read-only) */}
          <div className="space-y-2">
            <Label>Tipe Workspace</Label>
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted">
              <span className="text-sm">
                {workspace?.type === 'personal' ? '👤 Personal' : '🏢 Business'}
              </span>
              <span className="text-xs text-muted-foreground ml-auto">
                (tidak bisa diubah)
              </span>
            </div>
          </div>

          {/* Workspace Details (Read-only) */}
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Mata Uang</Label>
              <p className="text-sm font-medium">{workspace?.currency}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Zona Waktu</Label>
              <p className="text-sm font-medium">{workspace?.timezone}</p>
            </div>
          </div>

          {/* Save Button */}
          <Button
            className="w-full"
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
          >
            {isSaving ? 'Menyimpan...' : hasChanges ? 'Simpan Perubahan' : 'Tidak Ada Perubahan'}
          </Button>
        </CardContent>
      </Card>

      {/* Danger Zone (Future: Delete workspace) */}
      <Card className="border-critical">
        <CardHeader>
          <CardTitle className="text-critical">Danger Zone</CardTitle>
          <CardDescription>
            Aksi berbahaya yang tidak dapat dibatalkan
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" disabled className="border-critical text-critical">
            Hapus Workspace (Coming Soon)
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Fitur ini akan tersedia di versi mendatang
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
