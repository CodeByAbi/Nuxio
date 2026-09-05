"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { WalletCard } from "@/components/wallet/WalletCard";
import { WalletForm } from "@/components/wallet/WalletForm";
import { ConfirmArchiveDialog } from "@/components/wallet/ConfirmArchiveDialog";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import type { Wallet, CreateWalletInput } from "@/types/wallet";
import type { ApiResponse } from "@/types/api";

/**
 * WalletPage displays and manages wallets for the current workspace.
 * 
 * Features:
 * - List all active wallets (default: exclude archived)
 * - Create new wallet via form dialog
 * - Archive wallet with confirmation
 * - Real-time synchronization with database via TanStack Query
 * - Loading/error/empty states
 * 
 * Data flow:
 * - Fetch wallets from GET /api/wallet
 * - Create wallet via POST /api/wallet
 * - Archive wallet via PATCH /api/wallet/[id]/archive
 * - After mutation: invalidate query → refetch → render fresh DB state
 */
export default function WalletPage() {
  // TODO: Get workspace_id from workspace context/state
  // For now, using a placeholder. This will be replaced with actual workspace state.
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [walletToArchive, setWalletToArchive] = useState<Wallet | null>(null);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);

  const queryClient = useQueryClient();

  // Simulate getting workspace from somewhere (header, context, etc.)
  useEffect(() => {
    // TODO: Replace with actual workspace retrieval logic
    // For now, fetch from localStorage or use a default
    const storedWorkspaceId = localStorage.getItem("current_workspace_id");
    if (storedWorkspaceId) {
      setWorkspaceId(storedWorkspaceId);
    }
  }, []);

  // Query: List wallets
  const {
    data: wallets,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["wallets", workspaceId, false], // [entity, workspaceId, includeArchived]
    queryFn: async () => {
      if (!workspaceId) return [];

      const response = await fetch(
        `/api/wallet?workspace_id=${workspaceId}&include_archived=false`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Failed to fetch wallets");
      }

      const json: ApiResponse<Wallet[]> = await response.json();
      return json.data || [];
    },
    enabled: !!workspaceId, // Only run query when workspace is available
  });

  // Mutation: Create wallet
  const createWalletMutation = useMutation({
    mutationFn: async (input: CreateWalletInput) => {
      const response = await fetch("/api/wallet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Failed to create wallet");
      }

      const json: ApiResponse<Wallet> = await response.json();
      return json.data;
    },
    onSuccess: () => {
      // Invalidate and refetch wallets
      queryClient.invalidateQueries({ queryKey: ["wallets", workspaceId, false] });
      toast.success("Wallet berhasil dibuat");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal membuat wallet");
    },
  });

  // Mutation: Archive wallet
  const archiveWalletMutation = useMutation({
    mutationFn: async ({ walletId, workspaceId }: { walletId: string; workspaceId: string }) => {
      const response = await fetch(`/api/wallet/${walletId}/archive`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workspace_id: workspaceId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Failed to archive wallet");
      }

      const json: ApiResponse<{ id: string; archived: boolean }> = await response.json();
      return json.data;
    },
    onSuccess: () => {
      // Invalidate and refetch wallets
      queryClient.invalidateQueries({ queryKey: ["wallets", workspaceId, false] });
      toast.success("Wallet berhasil diarsipkan");
      setShowArchiveDialog(false);
      setWalletToArchive(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Gagal mengarsipkan wallet");
    },
  });

  const handleCreateWallet = (input: CreateWalletInput) => {
    createWalletMutation.mutate(input);
  };

  const handleArchiveClick = (wallet: Wallet) => {
    setWalletToArchive(wallet);
    setShowArchiveDialog(true);
  };

  const handleConfirmArchive = () => {
    if (walletToArchive && workspaceId) {
      archiveWalletMutation.mutate({
        walletId: walletToArchive.id,
        workspaceId,
      });
    }
  };

  // Loading state
  if (!workspaceId) {
    return (
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <Alert>
            <AlertCircle className="size-4" />
            <AlertDescription>Loading workspace...</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Wallet</h1>
              <p className="text-muted-foreground mt-1">Kelola sumber dana Anda</p>
            </div>
          </div>
          <LoadingSkeleton variant="card" count={3} />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Wallet</h1>
              <p className="text-muted-foreground mt-1">Kelola sumber dana Anda</p>
            </div>
          </div>
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>
              {error instanceof Error ? error.message : "Wallet gagal dimuat"}
            </AlertDescription>
          </Alert>
          <button
            onClick={() => refetch()}
            className="text-sm text-primary hover:underline"
          >
            Coba lagi
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (!wallets || wallets.length === 0) {
    return (
      <div className="p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Wallet</h1>
              <p className="text-muted-foreground mt-1">Kelola sumber dana Anda</p>
            </div>
            <WalletForm
              workspaceId={workspaceId}
              onSubmit={handleCreateWallet}
              isSubmitting={createWalletMutation.isPending}
              error={createWalletMutation.error?.message}
            />
          </div>
          <EmptyState
            title="Belum ada wallet"
            description="Mulai dengan membuat wallet pertama Anda untuk mengelola keuangan."
            icon="👛"
          />
        </div>
      </div>
    );
  }

  // Success state with wallets
  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Wallet</h1>
            <p className="text-muted-foreground mt-1">Kelola sumber dana Anda</p>
          </div>
          <WalletForm
            workspaceId={workspaceId}
            onSubmit={handleCreateWallet}
            isSubmitting={createWalletMutation.isPending}
            error={createWalletMutation.error?.message}
          />
        </div>

        {/* Wallet Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {wallets.map((wallet) => (
            <WalletCard
              key={wallet.id}
              wallet={wallet}
              onArchive={handleArchiveClick}
              showArchiveButton={true}
            />
          ))}
        </div>

        {/* Archive Confirmation Dialog */}
        <ConfirmArchiveDialog
          open={showArchiveDialog}
          onOpenChange={setShowArchiveDialog}
          wallet={walletToArchive}
          onConfirm={handleConfirmArchive}
        />
      </div>
    </div>
  );
}
