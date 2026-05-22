'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Sparkles, Settings, CheckCircle2, XCircle, ExternalLink, MailCheck,
  Cloud, RefreshCw, Trash2, Database, Play, UploadCloud, DownloadCloud
} from 'lucide-react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useAuth } from '@/lib/firebase/auth-context';
import { getDb, getFirebaseAuth } from '@/lib/firebase/client';
import {
  authorizeGoogleDrive,
  findOrCreateBackupFolder,
  uploadBackupFile,
  listBackupFiles,
  downloadBackupFile,
  deleteBackupFile,
  type GoogleDriveBackupFile
} from '@/lib/google-drive';
import { getUserCampaignsOnce, importCampaign } from '@/lib/firebase/campaigns';

const PRO_PRICE_LABEL = '$2.99 / month';

const PRO_FEATURES = [
  'AI character-sheet parser (PDF / image / text → editable card)',
  'Name generator (cultures, fantasy races, mass batches)',
  'NPC trait inspires powered by Claude',
  'All future AI-backed features',
];

function AccountPageBody() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading, isPro, proSource, subscriptionStatus, currentPeriodEndMs, cancelAtPeriodEnd, isOnWaitlist } = useAuth();
  const [busy, setBusy] = useState<'waitlist' | 'portal' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [gDriveToken, setGDriveToken] = useState<string | null>(null);
  const [backups, setBackups] = useState<GoogleDriveBackupFile[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [backupActionStatus, setBackupActionStatus] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);

  const loadBackups = async (token: string) => {
    setLoadingBackups(true);
    setBackupError(null);
    try {
      const folderId = await findOrCreateBackupFolder(token);
      const list = await listBackupFiles(token, folderId);
      setBackups(list);
    } catch (e: any) {
      setBackupError(e?.message || 'Could not load backups from Google Drive');
    } finally {
      setLoadingBackups(false);
    }
  };

  const connectGoogleDrive = async () => {
    setBackupActionStatus('Connecting to Google Drive…');
    setBackupError(null);
    setBackupSuccess(null);
    try {
      const token = await authorizeGoogleDrive(user?.email || undefined);
      if (!token) throw new Error('Failed to get authorization token');
      setGDriveToken(token);
      await loadBackups(token);
      setBackupSuccess('Connected to Google Drive successfully!');
    } catch (e: any) {
      setBackupError(e?.message || 'Authorization failed');
    } finally {
      setBackupActionStatus(null);
    }
  };

  const handleBackup = async () => {
    if (!user) {
      setBackupError('You must be logged in to back up campaigns.');
      return;
    }
    setBackupActionStatus('Starting backup…');
    setBackupError(null);
    setBackupSuccess(null);
    try {
      let token = gDriveToken;
      if (!token) {
        setBackupActionStatus('Authorizing Google Drive…');
        token = await authorizeGoogleDrive(user.email || undefined);
        if (!token) throw new Error('Authorization failed');
        setGDriveToken(token);
      }

      setBackupActionStatus('Fetching campaigns…');
      const campaignsList = await getUserCampaignsOnce(user.uid);
      if (campaignsList.length === 0) {
        throw new Error('You have no campaigns to backup!');
      }

      setBackupActionStatus('Creating backup folder…');
      const folderId = await findOrCreateBackupFolder(token);

      setBackupActionStatus('Uploading backup…');
      const payload = {
        _format: 'gm_builder_backup_v1',
        _exported: new Date().toISOString(),
        campaigns: campaignsList.map((c) => ({
          name: c.name,
          data: c.data || {},
          done: c.done || {},
        })),
      };

      const result = await uploadBackupFile(token, folderId, payload);
      setBackupSuccess(`Backup created successfully: ${result.name}`);
      await loadBackups(token);
    } catch (e: any) {
      setBackupError(e?.message || 'Backup failed');
    } finally {
      setBackupActionStatus(null);
    }
  };

  const handleRestore = async (fileId: string, filename: string) => {
    if (!user) {
      setBackupError('You must be logged in to restore backups.');
      return;
    }
    if (!confirm(`Are you sure you want to restore campaigns from the backup "${filename}"?\n\nThis will import the campaigns from the backup into your account as new campaigns. It will not overwrite your existing campaigns.`)) {
      return;
    }

    setBackupActionStatus('Downloading backup content…');
    setBackupError(null);
    setBackupSuccess(null);
    try {
      let token = gDriveToken;
      if (!token) {
        token = await authorizeGoogleDrive(user.email || undefined);
        if (!token) throw new Error('Authorization failed');
        setGDriveToken(token);
      }

      const backupContent = await downloadBackupFile(token, fileId);
      if (backupContent._format !== 'gm_builder_backup_v1') {
        throw new Error('Unsupported backup file format or file is corrupted.');
      }

      const backupCampaigns = backupContent.campaigns || [];
      if (backupCampaigns.length === 0) {
        throw new Error('The selected backup file contains no campaigns.');
      }

      setBackupActionStatus(`Restoring ${backupCampaigns.length} campaigns…`);
      await Promise.all(
        backupCampaigns.map((c: any) =>
          importCampaign(user.uid, c.name, c.data || {}, c.done || {})
        )
      );

      setBackupSuccess(`Successfully restored ${backupCampaigns.length} campaigns! They are now available on your Campaigns page.`);
    } catch (e: any) {
      setBackupError(e?.message || 'Restore failed');
    } finally {
      setBackupActionStatus(null);
    }
  };

  const handleDeleteBackup = async (fileId: string, filename: string) => {
    if (!user) {
      setBackupError('You must be logged in to delete backups.');
      return;
    }
    if (!confirm(`Are you sure you want to delete the backup "${filename}" from Google Drive?\n\nThis action cannot be undone.`)) {
      return;
    }

    setBackupActionStatus('Deleting backup file…');
    setBackupError(null);
    setBackupSuccess(null);
    try {
      let token = gDriveToken;
      if (!token) {
        token = await authorizeGoogleDrive(user.email || undefined);
        if (!token) throw new Error('Authorization failed');
        setGDriveToken(token);
      }

      await deleteBackupFile(token, fileId);
      setBackupSuccess(`Backup file "${filename}" deleted successfully.`);
      await loadBackups(token);
    } catch (e: any) {
      setBackupError(e?.message || 'Delete failed');
    } finally {
      setBackupActionStatus(null);
    }
  };

  // Support triggering backup via query param immediately on load
  useEffect(() => {
    const action = params.get('action');
    if (action === 'backup' && user && !backupActionStatus && !backupSuccess && !backupError) {
      // Clean query params so we don't loop
      router.replace('/account');
      handleBackup();
    }
  }, [params, user]);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  const checkoutFlag = params.get('checkout');
  const periodEnd = currentPeriodEndMs ? new Date(currentPeriodEndMs) : null;

  if (loading || !user) {
    return (
      <main className="min-h-screen flex items-center justify-center text-sm text-ink-mute italic font-serif">
        Loading…
      </main>
    );
  }

  const joinWaitlist = async () => {
    setBusy('waitlist');
    setError(null);
    try {
      if (!user?.email) throw new Error('Not signed in');
      await setDoc(doc(getDb(), 'proWaitlist', user.uid), {
        uid: user.uid,
        email: user.email.toLowerCase(),
        displayName: user.displayName ?? null,
        createdAtMs: Date.now(),
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join waitlist');
    } finally {
      setBusy(null);
    }
  };

  const openPortal = async () => {
    setBusy('portal');
    setError(null);
    try {
      const idToken = await getFirebaseAuth().currentUser?.getIdToken();
      if (!idToken) throw new Error('Not signed in');
      const res = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Could not open billing portal');
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open billing portal');
      setBusy(null);
    }
  };

  return (
    <main className="min-h-screen p-3 sm:p-5 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-parchment-soft border border-rule rounded-lg shadow-page p-3 sm:p-5 md:p-8 space-y-5">
          <header className="pb-4 border-b border-rule">
            <div className="flex items-center justify-between gap-2 mb-3">
              <Link href="/campaign" className="text-xs text-brass-deep hover:text-crimson font-display uppercase tracking-wider flex items-center gap-1">
                <ArrowLeft size={12} /> Campaigns
              </Link>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl text-crimson tracking-wide">Account</h1>
            <p className="text-sm text-ink-soft italic font-serif mt-1 break-all">{user.email}</p>
          </header>

          {checkoutFlag === 'success' && (
            <div className="rounded border border-crimson/40 bg-crimson/5 p-3 flex items-start gap-2">
              <CheckCircle2 size={16} className="text-crimson flex-shrink-0 mt-0.5" />
              <div className="text-sm font-serif text-ink">
                <p className="font-display uppercase tracking-wider text-xs text-crimson mb-1">Welcome to Pro</p>
                <p className="italic text-ink-soft">
                  Your subscription is active. Pro features will unlock as soon as Stripe&apos;s confirmation reaches us
                  (usually a few seconds).
                </p>
              </div>
            </div>
          )}
          {checkoutFlag === 'cancel' && (
            <div className="rounded border border-rule bg-parchment p-3 flex items-start gap-2">
              <XCircle size={16} className="text-ink-soft flex-shrink-0 mt-0.5" />
              <div className="text-sm font-serif text-ink-soft italic">
                Checkout cancelled — nothing was charged.
              </div>
            </div>
          )}

          <section className="space-y-3">
            <h2 className="font-display tracking-wide text-lg text-ink flex items-center gap-2">
              <Sparkles size={16} className="text-crimson" /> Subscription
            </h2>

            {isPro ? (
              <div className="rounded border border-crimson/40 bg-crimson/5 p-4 space-y-2">
                <div className="font-display uppercase tracking-wider text-xs text-crimson">
                  Pro {proSource === 'comped' ? '(comped account)' : 'subscriber'}
                </div>
                {proSource === 'subscription' && periodEnd && (
                  <p className="text-sm font-serif text-ink-soft">
                    {cancelAtPeriodEnd
                      ? `Your subscription cancels on ${periodEnd.toLocaleDateString()}.`
                      : `Renews on ${periodEnd.toLocaleDateString()}.`}
                    {subscriptionStatus === 'past_due' && (
                      <span className="block text-crimson mt-1">
                        Payment is past due — manage your subscription to retry.
                      </span>
                    )}
                  </p>
                )}
                {proSource === 'comped' && (
                  <p className="text-sm font-serif italic text-ink-soft">
                    You&apos;re on the comped allowlist — no subscription needed.
                  </p>
                )}
                {proSource === 'subscription' && (
                  <button
                    type="button"
                    onClick={openPortal}
                    disabled={busy !== null}
                    className="text-xs px-3 py-1.5 rounded border border-rule bg-parchment hover:bg-parchment-deep font-display uppercase tracking-wider inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Settings size={11} />
                    {busy === 'portal' ? 'Opening…' : 'Manage subscription'}
                    <ExternalLink size={10} className="opacity-60" />
                  </button>
                )}
              </div>
            ) : isOnWaitlist ? (
              <div className="rounded border border-brass/40 bg-brass/5 p-4 space-y-2">
                <div className="font-display uppercase tracking-wider text-xs text-brass-deep flex items-center gap-1.5">
                  <MailCheck size={13} /> You&apos;re on the waitlist
                </div>
                <p className="text-sm font-serif italic text-ink-soft">
                  Pro will be {PRO_PRICE_LABEL} when it launches. We&apos;ll email{' '}
                  <span className="not-italic">{user.email}</span> as soon as it opens up.
                </p>
              </div>
            ) : (
              <div className="rounded border border-brass/40 bg-brass/5 p-4 space-y-3">
                <p className="text-sm font-serif text-ink-soft">
                  Pro will be {PRO_PRICE_LABEL} when it launches. Join the waitlist and we&apos;ll
                  email you the moment it opens.
                </p>
                <ul className="text-sm font-serif text-ink space-y-1 list-disc list-inside marker:text-brass-deep">
                  {PRO_FEATURES.map((f) => <li key={f}>{f}</li>)}
                </ul>
                <button
                  type="button"
                  onClick={joinWaitlist}
                  disabled={busy !== null}
                  className="text-sm px-4 py-2 rounded bg-crimson hover:bg-wine text-parchment font-display uppercase tracking-wider inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Sparkles size={13} />
                  {busy === 'waitlist' ? 'Joining…' : 'Join the Pro waitlist'}
                </button>
              </div>
            )}

            {error && <p className="text-sm text-crimson font-serif italic">{error}</p>}
          </section>

          <section className="space-y-3 pt-5 border-t border-rule">
            <h2 className="font-display tracking-wide text-lg text-ink flex items-center gap-2">
              <Cloud size={16} className="text-brass-deep" /> Google Drive Backups
            </h2>

            {backupActionStatus && (
              <div className="rounded border border-brass/40 bg-brass/5 p-3 flex items-center gap-2">
                <div className="gm-spinner border-t-brass animate-spin w-4 h-4 rounded-full border-2 border-r-transparent" />
                <span className="text-sm font-serif italic text-brass-deep">{backupActionStatus}</span>
              </div>
            )}

            {backupError && (
              <div className="rounded border border-crimson/40 bg-crimson/5 p-3 flex items-start gap-2">
                <XCircle size={16} className="text-crimson flex-shrink-0 mt-0.5" />
                <span className="text-sm font-serif text-crimson">{backupError}</span>
              </div>
            )}

            {backupSuccess && (
              <div className="rounded border border-moss/45 bg-moss/5 p-3 flex items-start gap-2">
                <CheckCircle2 size={16} className="text-moss flex-shrink-0 mt-0.5" />
                <span className="text-sm font-serif text-moss">{backupSuccess}</span>
              </div>
            )}

            {!gDriveToken ? (
              <div className="rounded border border-rule bg-parchment p-4 text-center space-y-3">
                <p className="text-sm font-serif text-ink-soft italic">
                  Connect your Google Drive to back up all your campaigns to the cloud and restore them anytime.
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  <button
                    type="button"
                    onClick={connectGoogleDrive}
                    disabled={backupActionStatus !== null}
                    className="text-xs px-3 py-1.5 rounded border border-rule hover:bg-parchment-deep font-display uppercase tracking-wider inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors"
                  >
                    <Cloud size={12} className="text-brass-deep" />
                    Connect Google Drive
                  </button>
                  <button
                    type="button"
                    onClick={handleBackup}
                    disabled={backupActionStatus !== null}
                    className="text-xs px-3 py-1.5 rounded bg-crimson hover:bg-wine text-parchment font-display uppercase tracking-wider inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors"
                  >
                    <UploadCloud size={12} />
                    Quick Backup Now
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2 items-center justify-between">
                  <div className="text-xs font-serif text-moss flex items-center gap-1">
                    <CheckCircle2 size={12} /> Google Drive connected
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => loadBackups(gDriveToken)}
                      disabled={loadingBackups || backupActionStatus !== null}
                      className="text-[11px] px-2 py-1 rounded border border-rule hover:bg-parchment-deep font-display uppercase tracking-wider inline-flex items-center gap-1 disabled:opacity-50 transition-colors"
                      title="Reload backup list"
                    >
                      <RefreshCw size={10} className={loadingBackups ? 'animate-spin' : ''} />
                      Refresh
                    </button>
                    <button
                      type="button"
                      onClick={handleBackup}
                      disabled={backupActionStatus !== null}
                      className="text-[11px] px-2 py-1.5 rounded bg-crimson hover:bg-wine text-parchment font-display uppercase tracking-wider inline-flex items-center gap-1 disabled:opacity-50 transition-colors"
                    >
                      <UploadCloud size={11} />
                      Backup Campaigns
                    </button>
                  </div>
                </div>

                {loadingBackups ? (
                  <p className="text-sm text-ink-mute italic font-serif text-center py-6">Checking your scrolls on Google Drive…</p>
                ) : backups.length === 0 ? (
                  <p className="text-sm text-ink-mute italic font-serif text-center py-6 border border-dashed border-rule rounded bg-parchment-deep/10">
                    No backups found in your "GM Builder Backups" Google Drive folder yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto border border-rule rounded bg-parchment text-ink">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-parchment-deep border-b border-rule font-display uppercase tracking-wider text-brass-deep text-[10px]">
                          <th className="p-2 sm:p-3">File Name</th>
                          <th className="p-2 sm:p-3 hidden sm:table-cell">Created Date</th>
                          <th className="p-2 sm:p-3 hidden sm:table-cell">File Size</th>
                          <th className="p-2 sm:p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rule font-serif text-ink-soft">
                        {backups.map((file) => {
                          const sizeKb = file.size ? `${(Number(file.size) / 1024).toFixed(1)} KB` : 'Unknown';
                          const createdDate = new Date(file.createdTime).toLocaleString();
                          return (
                            <tr key={file.id} className="hover:bg-parchment-deep/20 transition-colors">
                              <td className="p-2 sm:p-3 font-mono font-medium truncate max-w-[150px] sm:max-w-[200px]" title={file.name}>
                                {file.name}
                                <span className="block sm:hidden text-[10px] text-ink-mute font-serif italic mt-0.5">
                                  {createdDate} · {sizeKb}
                                </span>
                              </td>
                              <td className="p-2 sm:p-3 hidden sm:table-cell">{createdDate}</td>
                              <td className="p-2 sm:p-3 hidden sm:table-cell">{sizeKb}</td>
                              <td className="p-2 sm:p-3 text-right">
                                <div className="inline-flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleRestore(file.id, file.name)}
                                    disabled={backupActionStatus !== null}
                                    className="text-[10px] px-2 py-1 rounded border border-moss/45 text-moss hover:bg-moss hover:text-parchment font-display uppercase tracking-wider disabled:opacity-50 transition-colors"
                                    title="Restore campaigns from this backup"
                                  >
                                    Restore
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteBackup(file.id, file.name)}
                                    disabled={backupActionStatus !== null}
                                    className="text-[10px] px-2 py-1 rounded border border-crimson/50 text-crimson hover:bg-crimson hover:text-parchment font-display uppercase tracking-wider disabled:opacity-50 transition-colors"
                                    title="Delete backup file"
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center text-sm text-ink-mute italic font-serif">Loading…</main>
    }>
      <AccountPageBody />
    </Suspense>
  );
}
