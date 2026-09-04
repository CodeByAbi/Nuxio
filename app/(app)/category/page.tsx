'use client';

/**
 * Category Management Page
 * 
 * List, create, and archive categories.
 * Default categories cannot be archived.
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import type { Category, CategoryDirection } from '@/types/category';

export default function CategoryPage() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get('workspace_id');

  const [categories, setCategories] = useState<Category[]>([]);
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDirection, setNewCategoryDirection] = useState<CategoryDirection>('expense');
  const [isCreating, setIsCreating] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; name: string } | null>(null);

  // Written as a .then()/.catch() chain rather than calling the
  // fetchCategories() helper below — calling a named async function that
  // eventually calls setState from inside a useEffect gets flagged by the
  // React Compiler's set-state-in-effect check even though the actual
  // setState calls happen after an await; see the identical pattern in
  // app/(app)/profile/page.tsx. fetchCategories() itself stays available for
  // the post-mutation refreshes below (handleCreate/handleArchive), which
  // run from event handlers, not effects.
  useEffect(() => {
    if (!workspaceId) return;

    const params = new URLSearchParams({ workspace_id: workspaceId });
    if (filter !== 'all') {
      params.append('direction', filter);
    }
    if (includeArchived) {
      params.append('include_archived', 'true');
    }

    fetch(`/api/category?${params.toString()}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error?.message || 'Gagal memuat kategori');
        }
        setCategories(data.data);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Gagal memuat kategori');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [workspaceId, filter, includeArchived]);

  const fetchCategories = async () => {
    if (!workspaceId) return;

    setIsLoading(true);
    try {
      const params = new URLSearchParams({ workspace_id: workspaceId });
      if (filter !== 'all') {
        params.append('direction', filter);
      }
      if (includeArchived) {
        params.append('include_archived', 'true');
      }

      const response = await fetch(`/api/category?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Gagal memuat kategori');
      }

      setCategories(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat kategori');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!workspaceId || !newCategoryName.trim()) return;

    setError(null);
    setIsCreating(true);

    try {
      const response = await fetch('/api/category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          name: newCategoryName,
          direction: newCategoryDirection,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error('Kategori dengan nama dan arah yang sama sudah ada');
        }
        throw new Error(data.error?.message || 'Gagal membuat kategori');
      }

      // Success - close dialog and refresh
      setShowCreateDialog(false);
      setNewCategoryName('');
      setNewCategoryDirection('expense');
      fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat kategori');
    } finally {
      setIsCreating(false);
    }
  };

  const handleArchive = async (categoryId: string) => {
    if (!workspaceId) return;

    setError(null);

    try {
      const response = await fetch(`/api/category/${categoryId}/archive`, {
        method: 'PATCH',
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 422) {
          throw new Error('Kategori default tidak dapat diarsipkan');
        }
        throw new Error(data.error?.message || 'Gagal mengarsipkan kategori');
      }

      // Success - refresh
      fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengarsipkan kategori');
    }
  };

  if (!workspaceId) {
    return (
      <div className="container max-w-4xl py-8">
        <Alert variant="destructive">
          Workspace ID tidak ditemukan. Silakan pilih workspace terlebih dahulu.
        </Alert>
      </div>
    );
  }

  const incomeCategories = categories.filter((c) => c.direction === 'income');
  const expenseCategories = categories.filter((c) => c.direction === 'expense');

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kategori</h1>
          <p className="text-muted-foreground">
            Kelola kategori transaksi Anda
          </p>
        </div>

        {/* Create Button */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>+ Tambah Kategori</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Buat Kategori Baru</DialogTitle>
              <DialogDescription>
                Tambahkan kategori kustom untuk mengorganisir transaksi
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nama Kategori</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Contoh: Freelance"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  maxLength={30}
                  disabled={isCreating}
                />
                <p className="text-xs text-muted-foreground">
                  {newCategoryName.length}/30 karakter
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="direction">Tipe</Label>
                <select
                  id="direction"
                  className="w-full px-3 py-2 rounded-md border bg-background"
                  value={newCategoryDirection}
                  onChange={(e) => setNewCategoryDirection(e.target.value as CategoryDirection)}
                  disabled={isCreating}
                >
                  <option value="income">📈 Pemasukan</option>
                  <option value="expense">📉 Pengeluaran</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
                disabled={isCreating}
              >
                Batal
              </Button>
              <Button onClick={handleCreate} disabled={isCreating || !newCategoryName.trim()}>
                {isCreating ? 'Membuat...' : 'Buat Kategori'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">{error}</Alert>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            {/* Direction Filter */}
            <div className="flex items-center gap-2">
              <Label className="text-sm">Filter:</Label>
              <div className="flex gap-1">
                <Button
                  variant={filter === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilter('all')}
                >
                  Semua
                </Button>
                <Button
                  variant={filter === 'income' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilter('income')}
                >
                  📈 Pemasukan
                </Button>
                <Button
                  variant={filter === 'expense' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilter('expense')}
                >
                  📉 Pengeluaran
                </Button>
              </div>
            </div>

            {/* Archived Toggle */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="includeArchived"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="includeArchived" className="text-sm cursor-pointer">
                Tampilkan yang diarsipkan
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {/* Categories List */}
      {!isLoading && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Income Categories */}
          {(filter === 'all' || filter === 'income') && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span>📈</span>
                  <span>Pemasukan</span>
                  <span className="ml-auto text-sm font-normal text-muted-foreground">
                    {incomeCategories.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {incomeCategories.map((category) => (
                  <div
                    key={category.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      category.archived ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex-1">
                      <p className="font-medium">{category.name}</p>
                      {category.is_default && (
                        <p className="text-xs text-muted-foreground">Default</p>
                      )}
                      {category.archived && (
                        <p className="text-xs text-warning">Diarsipkan</p>
                      )}
                    </div>
                    {!category.is_default && !category.archived && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setArchiveTarget({ id: category.id, name: category.name })}
                      >
                        Arsipkan
                      </Button>
                    )}
                  </div>
                ))}
                {incomeCategories.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">
                    Belum ada kategori
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Expense Categories */}
          {(filter === 'all' || filter === 'expense') && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span>📉</span>
                  <span>Pengeluaran</span>
                  <span className="ml-auto text-sm font-normal text-muted-foreground">
                    {expenseCategories.length}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {expenseCategories.map((category) => (
                  <div
                    key={category.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      category.archived ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex-1">
                      <p className="font-medium">{category.name}</p>
                      {category.is_default && (
                        <p className="text-xs text-muted-foreground">Default</p>
                      )}
                      {category.archived && (
                        <p className="text-xs text-warning">Diarsipkan</p>
                      )}
                    </div>
                    {!category.is_default && !category.archived && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setArchiveTarget({ id: category.id, name: category.name })}
                      >
                        Arsipkan
                      </Button>
                    )}
                  </div>
                ))}
                {expenseCategories.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">
                    Belum ada kategori
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Info Note */}
      <Alert>
        <p className="text-sm">
          💡 <strong>Catatan:</strong> Kategori default tidak dapat diarsipkan.
          Kategori yang diarsipkan masih tersimpan di transaksi historis.
        </p>
      </Alert>

      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
        title="Arsipkan Kategori?"
        description={
          archiveTarget
            ? `Kategori "${archiveTarget.name}" akan diarsipkan. Transaksi yang sudah ada tetap menggunakan kategori ini.`
            : ''
        }
        confirmLabel="Arsipkan"
        variant="default"
        onConfirm={() => {
          if (archiveTarget) handleArchive(archiveTarget.id);
        }}
      />
    </div>
  );
}
