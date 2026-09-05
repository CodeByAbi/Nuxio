"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArchiveIcon, WalletIcon } from "lucide-react";
import { formatMoney } from "@/lib/client/money";
import type { Wallet } from "@/types/wallet";

export interface WalletCardProps {
  wallet: Wallet;
  onArchive?: (wallet: Wallet) => void;
  showArchiveButton?: boolean;
}

/**
 * WalletCard displays wallet information including name, type, and balance.
 * 
 * Design:
 * - Shows wallet name as title
 * - Displays wallet type badge if present
 * - Shows current cached balance (formatted as IDR)
 * - Optional archive button
 * - Responsive card layout
 */
export function WalletCard({ wallet, onArchive, showArchiveButton = true }: WalletCardProps) {
  const handleArchive = () => {
    if (onArchive) {
      onArchive(wallet);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <WalletIcon className="size-5 text-muted-foreground" />
            <CardTitle>{wallet.name}</CardTitle>
          </div>
          {showArchiveButton && !wallet.archived && onArchive && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleArchive}
              title="Arsipkan wallet"
            >
              <ArchiveIcon className="size-4" />
              <span className="sr-only">Arsipkan</span>
            </Button>
          )}
        </div>
        {wallet.wallet_type && (
          <CardDescription>
            <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium">
              {wallet.wallet_type === "personal" ? "Personal" : "Bisnis"}
            </span>
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div>
            <div className="text-xs text-muted-foreground">Saldo Saat Ini</div>
            <div className="text-2xl font-semibold">
              {formatMoney(wallet.cached_balance as number, wallet.currency)}
            </div>
          </div>
          {wallet.initial_balance !== wallet.cached_balance && (
            <div>
              <div className="text-xs text-muted-foreground">Saldo Awal</div>
              <div className="text-sm">
                {formatMoney(wallet.initial_balance as number, wallet.currency)}
              </div>
            </div>
          )}
          {wallet.archived && (
            <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              Wallet ini telah diarsipkan
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
