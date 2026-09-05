"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PlusIcon } from "lucide-react";
import { parseMoney, formatMoney } from "@/lib/client/money";
import type { CreateWalletInput } from "@/types/wallet";

export interface WalletFormProps {
  workspaceId: string;
  onSubmit: (input: CreateWalletInput) => void;
  isSubmitting?: boolean;
  error?: string | null;
}

/**
 * WalletForm provides a dialog form for creating new wallets.
 * 
 * Features:
 * - Name input (1-50 characters)
 * - Initial balance input (integer >= 0, formatted as IDR)
 * - Optional wallet type selection
 * - Client-side validation
 * - Loading state during submission
 * - Error display
 */
export function WalletForm({ workspaceId, onSubmit, isSubmitting, error }: WalletFormProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [initialBalanceInput, setInitialBalanceInput] = useState("");
  const [walletType, setWalletType] = useState<"personal" | "business" | "">("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // Validate name
    if (name.trim().length === 0) {
      setValidationError("Nama wallet wajib diisi");
      return;
    }

    if (name.trim().length > 50) {
      setValidationError("Nama wallet maksimal 50 karakter");
      return;
    }

    // Validate initial balance
    const initialBalance = parseMoney(initialBalanceInput);
    if (initialBalance === null) {
      setValidationError("Saldo awal harus berupa angka valid");
      return;
    }

    if (initialBalance < 0) {
      setValidationError("Saldo awal tidak boleh negatif");
      return;
    }

    if (!Number.isInteger(initialBalance)) {
      setValidationError("Saldo awal harus berupa bilangan bulat");
      return;
    }

    // Prepare input
    const input: CreateWalletInput = {
      workspace_id: workspaceId,
      name: name.trim(),
      initial_balance: initialBalance,
      wallet_type: walletType || null,
      currency: "IDR",
    };

    onSubmit(input);
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Reset form when closing
      setName("");
      setInitialBalanceInput("");
      setWalletType("");
      setValidationError(null);
    }
  };

  const handleBalanceChange = (value: string) => {
    setInitialBalanceInput(value);
    
    // Auto-format as user types (optional enhancement)
    const parsed = parseMoney(value);
    if (parsed !== null && value.length > 3) {
      // Only format if valid and has enough digits
      const formatted = formatMoney(parsed);
      // Only update if it's different to avoid cursor jumping
      if (formatted !== value) {
        setInitialBalanceInput(parsed.toString());
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon className="size-4" />
          Tambah Wallet
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Buat Wallet Baru</DialogTitle>
            <DialogDescription>
              Tambahkan wallet untuk mengelola sumber dana Anda.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Name Input */}
            <div className="space-y-2">
              <Label htmlFor="wallet-name">Nama Wallet *</Label>
              <Input
                id="wallet-name"
                placeholder="Contoh: BCA, Cash, E-Wallet"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
                required
                disabled={isSubmitting}
              />
            </div>

            {/* Initial Balance Input */}
            <div className="space-y-2">
              <Label htmlFor="initial-balance">Saldo Awal *</Label>
              <Input
                id="initial-balance"
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={initialBalanceInput}
                onChange={(e) => handleBalanceChange(e.target.value)}
                required
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                Masukkan saldo awal dalam Rupiah (contoh: 5000000 atau 5.000.000)
              </p>
            </div>

            {/* Wallet Type (Optional) */}
            <div className="space-y-2">
              <Label htmlFor="wallet-type">Tipe Wallet (Opsional)</Label>
              <select
                id="wallet-type"
                value={walletType}
                onChange={(e) => setWalletType(e.target.value as any)}
                disabled={isSubmitting}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Pilih tipe...</option>
                <option value="personal">Personal</option>
                <option value="business">Bisnis</option>
              </select>
            </div>

            {/* Error Messages */}
            {(validationError || error) && (
              <div className="rounded-md bg-critical/10 p-3 text-sm text-critical">
                {validationError || error}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Batal
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Menyimpan..." : "Buat Wallet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
