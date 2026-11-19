import { FormEvent, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  formatFirebaseAuthError,
  refreshVerifiedUser,
  resendVerificationEmail,
  signInWithEmailPassword,
  signInWithGoogle,
  signOutAccount,
  signUpWithEmailPassword,
  updateMyPublicProfile,
  UserPublicProfile,
} from '../arena/firebaseService';
import {
  sanitizeDisplayNameInput,
  validateDisplayName,
  validateEmailInput,
  validatePasswordInput,
} from '../arena/accountValidation';
import { arenaSound } from '../arena/soundFx';

interface AuthModalProps {
  open: boolean;
  authUser: User | null;
  profile: UserPublicProfile | null;
  quickPlayMode?: string | null;
  onContinueAsGuest?: () => void;
  onClose: () => void;
}

export function AuthModal({
  open,
  authUser,
  profile,
  quickPlayMode,
  onContinueAsGuest,
  onClose,
}: AuthModalProps) {
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [editName, setEditName] = useState(profile?.displayName ?? '');

  useEffect(() => {
    if (profile?.displayName) {
      setEditName(profile.displayName);
    }
  }, [profile?.displayName]);

  if (!open) return null;

  const handleGoogleSignIn = async () => {
    arenaSound.playUiClick();
    setBusy(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      await signInWithGoogle();
      onClose();
    } catch (err) {
      setErrorMsg(formatFirebaseAuthError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    arenaSound.playUiClick();
    setErrorMsg(null);
    setInfoMsg(null);

    const emailErr = validateEmailInput(email);
    if (emailErr) {
      setErrorMsg(emailErr);
      return;
    }
    const passErr = validatePasswordInput(password);
    if (passErr) {
      setErrorMsg(passErr);
      return;
    }
    if (mode === 'signup') {
      const nameErr = validateDisplayName(displayName);
      if (nameErr) {
        setErrorMsg(nameErr);
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === 'signup') {
        await signUpWithEmailPassword(email, password, displayName);
        setInfoMsg(
          'Account created! We sent a verification link to your email. Click it, then click "I Verified — Refresh Status" below.',
        );
      } else {
        const user = await signInWithEmailPassword(email, password);
        if (user.emailVerified) {
          onClose();
        } else {
          setInfoMsg('Please verify your email address before joining online lobbies.');
        }
      }
    } catch (err) {
      setErrorMsg(formatFirebaseAuthError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const handleRefreshVerification = async () => {
    if (!authUser) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const updated = await refreshVerifiedUser(authUser);
      if (updated.emailVerified) {
        setInfoMsg('Email verified! Your profile is active.');
        onClose();
      } else {
        setErrorMsg('Email is still unverified. Check your inbox (and spam folder) for the link.');
      }
    } catch (err) {
      setErrorMsg(formatFirebaseAuthError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const handleResendVerification = async () => {
    if (!authUser) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await resendVerificationEmail(authUser);
      setInfoMsg('Verification email re-sent!');
    } catch (err) {
      setErrorMsg(formatFirebaseAuthError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveProfileName = async (e: FormEvent) => {
    e.preventDefault();
    if (!authUser) return;
    const clean = sanitizeDisplayNameInput(editName);
    const err = validateDisplayName(clean);
    if (err) {
      setErrorMsg(err);
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      await updateMyPublicProfile(authUser.uid, { displayName: clean });
      setEditName(clean);
      setInfoMsg('Trooper handle updated!');
    } catch (e2) {
      setErrorMsg(e2 instanceof Error ? e2.message : 'Failed to update name.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    arenaSound.playUiClick();
    setBusy(true);
    try {
      await signOutAccount();
      setInfoMsg(null);
      setErrorMsg(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Player Account Sign Up and Login"
      data-testid="auth-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,8,13,0.88)] p-4 text-[#f6f1e9]"
    >
      <div className="w-full max-w-[440px] rounded-2xl border border-white/20 bg-[linear-gradient(160deg,rgba(26,28,38,0.99),rgba(14,15,22,0.99))] p-6 shadow-[0_28px_72px_rgba(0,0,0,0.82)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#5eeeff]">
              Save It Online Account
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold tracking-wide text-white">
              {authUser
                ? authUser.emailVerified
                  ? 'Trooper Profile'
                  : 'Verify Your Email'
                : mode === 'signup'
                  ? 'Create Trooper Account'
                  : 'Log In to Save It'}
            </h2>
          </div>
          <button
            type="button"
            data-testid="auth-close-btn"
            onClick={() => {
              arenaSound.playUiClick();
              onClose();
            }}
            className="rounded-lg border border-white/20 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
          >
            Close
          </button>
        </div>

        {quickPlayMode && (!authUser || !authUser.emailVerified) && (
          <div className="mt-4 rounded-xl border border-cyan-400/40 bg-cyan-950/40 px-3.5 py-2.5 text-xs leading-relaxed text-cyan-100">
            Sign in or continue as a Guest to immediately enter the{' '}
            <strong className="uppercase text-white">{quickPlayMode}</strong> Quick Play queue.
          </div>
        )}

        {errorMsg && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-400/40 bg-red-950/60 px-3.5 py-2.5 text-xs leading-relaxed text-red-100"
          >
            {errorMsg}
          </div>
        )}

        {infoMsg && (
          <div className="mt-4 rounded-xl border border-cyan-400/40 bg-cyan-950/50 px-3.5 py-2.5 text-xs leading-relaxed text-cyan-100">
            {infoMsg}
          </div>
        )}

        {authUser && !authUser.emailVerified && (
          <div className="mt-5 space-y-3">
            <p className="text-xs leading-relaxed text-slate-300">
              Signed in as <strong className="text-white">{authUser.email}</strong>. Click the
              verification link in your email to unlock multiplayer database writes, or switch to
              Google Sign-In for instant verified play.
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={handleRefreshVerification}
                className="w-full rounded-xl bg-[linear-gradient(100deg,#30f0ff,#7dd3fc)] py-2.5 text-xs font-black tracking-[0.12em] uppercase text-[#07161d] hover:brightness-110 disabled:opacity-50"
              >
                I Verified — Refresh Status
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleResendVerification}
                className="w-full rounded-xl border border-white/20 bg-white/5 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50"
              >
                Resend Verification Email
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleGoogleSignIn}
                className="w-full rounded-xl border border-amber-300/40 bg-amber-500/15 py-2.5 text-xs font-bold tracking-[0.08em] uppercase text-amber-100 hover:bg-amber-500/25 disabled:opacity-50"
              >
                Continue Instantly with Google
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleSignOut}
                className="w-full rounded-xl py-2 text-xs font-medium text-slate-400 hover:text-white"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}

        {authUser && authUser.emailVerified && (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-3 gap-2.5 rounded-xl border border-white/10 bg-black/30 p-3 text-center">
              <div>
                <div className="font-display text-xl font-bold text-[#38efff] tabular-nums">
                  {profile?.matchesPlayed ?? 0}
                </div>
                <div className="text-[10px] font-semibold tracking-wider uppercase text-slate-400">
                  Matches
                </div>
              </div>
              <div>
                <div className="font-display text-xl font-bold text-[#ffd147] tabular-nums">
                  {profile?.wins ?? 0}
                </div>
                <div className="text-[10px] font-semibold tracking-wider uppercase text-slate-400">
                  Series Wins
                </div>
              </div>
              <div>
                <div className="font-display text-xl font-bold text-[#ff8347] tabular-nums">
                  {profile?.roundsWon ?? 0}
                </div>
                <div className="text-[10px] font-semibold tracking-wider uppercase text-slate-400">
                  Rounds Won
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveProfileName} className="space-y-2">
              <label className="block text-[11px] font-bold tracking-[0.12em] uppercase text-slate-300">
                Trooper Handle (Visible to Friends)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={24}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="AquaHero"
                  className="flex-1 rounded-lg border border-white/20 bg-black/45 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#08161d] hover:brightness-110 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </form>

            <div className="flex items-center justify-between border-t border-white/10 pt-3 text-xs text-slate-400">
              <span className="truncate pr-2">{authUser.email}</span>
              <button
                type="button"
                disabled={busy}
                onClick={handleSignOut}
                className="shrink-0 rounded-lg border border-red-400/35 bg-red-500/15 px-3 py-1.5 font-semibold text-red-200 hover:bg-red-500/25"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}

        {!authUser && (
          <div className="mt-4 space-y-3.5">
            {/* Instant Google Sign-In */}
            <button
              type="button"
              data-testid="google-signin-btn"
              disabled={busy}
              onClick={handleGoogleSignIn}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-white/25 bg-white text-[#111827] py-2.5 text-sm font-bold shadow-lg hover:bg-slate-100 disabled:opacity-60 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M12 10.2v3.9h5.5c-.2 1.2-1.4 3.6-5.5 3.6-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12S6.6 21.8 12 21.8c6.9 0 9.6-4.8 9.6-7.3 0-.5-.1-.9-.1-1.3H12Z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>

            {onContinueAsGuest && (
              <button
                type="button"
                data-testid="guest-signin-btn"
                disabled={busy}
                onClick={() => {
                  arenaSound.playUiClick();
                  onContinueAsGuest();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/45 bg-cyan-500/15 py-2.5 text-xs font-bold tracking-[0.1em] uppercase text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-60 transition-colors"
              >
                <span>Continue as Guest (Instant Matchmaking)</span>
              </button>
            )}

            <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              <span className="h-px flex-1 bg-white/15" />
              <span>Or Email &amp; Password</span>
              <span className="h-px flex-1 bg-white/15" />
            </div>

            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-black/40 p-1 border border-white/10">
              <button
                type="button"
                data-testid="auth-tab-signup"
                onClick={() => {
                  setMode('signup');
                  setErrorMsg(null);
                  setInfoMsg(null);
                }}
                className={`rounded-lg py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                  mode === 'signup'
                    ? 'bg-cyan-400 text-[#07161d]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Sign Up
              </button>
              <button
                type="button"
                data-testid="auth-tab-login"
                onClick={() => {
                  setMode('login');
                  setErrorMsg(null);
                  setInfoMsg(null);
                }}
                className={`rounded-lg py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                  mode === 'login'
                    ? 'bg-amber-400 text-[#1b1206]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Log In
              </button>
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-3">
              {mode === 'signup' && (
                <div>
                  <label className="block text-[11px] font-bold tracking-[0.12em] uppercase text-slate-300">
                    Trooper Name
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={24}
                    data-testid="auth-name-input"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="WaveRider"
                    className="mt-1 w-full rounded-lg border border-white/20 bg-black/45 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold tracking-[0.12em] uppercase text-slate-300">
                  Email
                </label>
                <input
                  type="email"
                  required
                  data-testid="auth-email-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="trooper@example.com"
                  className="mt-1 w-full rounded-lg border border-white/20 bg-black/45 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold tracking-[0.12em] uppercase text-slate-300">
                  Password
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  data-testid="auth-password-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="mt-1 w-full rounded-lg border border-white/20 bg-black/45 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                data-testid="auth-submit-btn"
                className="w-full rounded-xl bg-[linear-gradient(100deg,#30f0ff_0%,#ffd147_100%)] py-2.5 font-display text-sm font-black uppercase tracking-[0.1em] text-[#09131a] hover:brightness-110 disabled:opacity-50"
              >
                {busy
                  ? 'Connecting...'
                  : mode === 'signup'
                    ? 'Create Account & Play'
                    : 'Log In'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
