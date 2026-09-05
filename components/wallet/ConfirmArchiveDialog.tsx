"use client";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import type { Wallet } from "@/types/wallet";

export interface ConfirmArchiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallet: Wallet | null;
  onConfirm: () => void;
}

/**
 * ConfirmArchiveDialog asks for confirmation before archiving a wallet.
 * 
 * Note: Wallet archiving is a soft delete (reversible by admin in future phases).
 * This confirmation exists to prevent accidental archiving, as archived wallets
 * will not accept new transactions in Phase 5/6.
 */
export function ConfirmArchiveDialog({
  open,
  onOpenChange,
  wallet,
  onConfirm,
}: ConfirmArchiveDialogProps) {
  if (!wallet) return null;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Arsipkan Wallet?"
      description={`Wallet "${wallet.name}" akan diarsipkan dan tidak dapat digunakan untuk transaksi baru. Histori transaksi akan tetap tersimpan. Anda dapat mengaktifkannya kembali nanti.`}
      confirmLabel="Arsipkan"
      cancelLabel="Batal"
      onConfirm={onConfirm}
      variant="destructive"
    />
  );
}
