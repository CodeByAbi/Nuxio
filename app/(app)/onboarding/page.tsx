'use client';

/**
 * Onboarding Page - Step 1: Workspace Selection
 * 
 * Personal workspace is auto-created by handle_new_user trigger.
 * This page allows user to:
 * 1. Start with their Personal workspace (already created)
 * 2. Create a Business workspace
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';

type WorkspaceChoice = 'personal' | 'business' | null;

export default function OnboardingPage() {
  const router = useRouter();
  const [choice, setChoice] = useState<WorkspaceChoice>(null);
  const [businessName, setBusinessName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    setError(null);
    setIsLoading(true);

    try {
      if (choice === 'personal') {
        // Personal workspace already created by trigger
        // Just redirect to home/dashboard
        router.push('/home');
      } else if (choice === 'business') {
        // Validate business name
        if (!businessName.trim() || businessName.length < 3) {
          setError('Nama workspace minimal 3 karakter');
          setIsLoading(false);
          return;
        }

        // Create Business workspace
        const response = await fetch('/api/workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: businessName,
            type: 'business',
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error?.message || 'Gagal membuat workspace');
        }

        // Success - redirect to home
        router.push('/home');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat workspace');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl">Selamat Datang di Nuxio! 🎉</CardTitle>
          <CardDescription>
            Mari setup workspace pertama Anda untuk mulai merencanakan keuangan
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              {error}
            </Alert>
          )}

          {/* Workspace Choice Cards */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Personal Workspace Option */}
            <Card
              className={`cursor-pointer transition-all hover:border-primary ${
                choice === 'personal' ? 'border-primary border-2 bg-primary/5' : ''
              }`}
              onClick={() => setChoice('personal')}
            >
              <CardHeader>
                <CardTitle className="text-lg">👤 Personal</CardTitle>
                <CardDescription>
                  Untuk pengelolaan keuangan pribadi
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>✓ Gratis selamanya</li>
                  <li>✓ Sudah disiapkan untuk Anda</li>
                  <li>✓ Kategori default tersedia</li>
                </ul>
              </CardContent>
            </Card>

            {/* Business Workspace Option */}
            <Card
              className={`cursor-pointer transition-all hover:border-primary ${
                choice === 'business' ? 'border-primary border-2 bg-primary/5' : ''
              }`}
              onClick={() => setChoice('business')}
            >
              <CardHeader>
                <CardTitle className="text-lg">🏢 Business</CardTitle>
                <CardDescription>
                  Untuk pengelolaan keuangan usaha
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li>✓ Kolaborasi dengan tim</li>
                  <li>✓ Role admin & member</li>
                  <li>✓ Kategori bisnis default</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Business Name Input (only shown when Business selected) */}
          {choice === 'business' && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
              <Label htmlFor="businessName">Nama Workspace Business</Label>
              <Input
                id="businessName"
                type="text"
                placeholder="PT. Contoh Usaha"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                minLength={3}
                maxLength={50}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                {businessName.length}/50 karakter (minimal 3)
              </p>
            </div>
          )}

          {/* Continue Button */}
          <Button
            className="w-full"
            size="lg"
            onClick={handleContinue}
            disabled={!choice || isLoading}
          >
            {isLoading ? 'Memproses...' : 'Lanjutkan'}
          </Button>

          {/* Skip Link (for demo/testing) */}
          <p className="text-center text-sm text-muted-foreground">
            Sudah punya workspace?{' '}
            <button
              className="text-primary hover:underline"
              onClick={() => router.push('/home')}
              disabled={isLoading}
            >
              Lewati onboarding
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
