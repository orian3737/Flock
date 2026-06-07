import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Lock } from 'lucide-react';

import { supabase } from '../../services/supabaseClient';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [stage, setStage] = useState('waiting');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setStage('ready');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setStage((current) => current === 'waiting' ? 'error' : current);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  async function handleReset(e) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setStage('loading');
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

    if (updateError) {
      setError(updateError.message);
      setStage('ready');
      return;
    }

    setStage('success');
    setTimeout(() => navigate('/dashboard'), 2000);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg-base)] p-6">
      <section className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-8 w-full max-w-sm">
        <header className="flex flex-col items-center mb-6">
          <Lock size={32} className="text-[var(--accent-primary)] mb-3" />
          <h1 className="display-font text-2xl text-[var(--text-primary)] m-0">Reset Password</h1>
        </header>

        {stage === 'waiting' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <span className="loading loading-spinner text-[var(--accent-primary)]" />
            <p className="font-mono text-sm text-[var(--text-muted)] text-center m-0">
              Verifying reset link...
            </p>
          </div>
        )}

        {stage === 'error' && (
          <div className="grid gap-4 text-center">
            <h2 className="display-font text-xl text-[var(--text-primary)] m-0">
              Reset link expired or invalid
            </h2>
            <p className="font-mono text-sm text-[var(--text-muted)] m-0">
              Reset links expire after 1 hour. Request a new one.
            </p>
            <button
              type="button"
              className="btn w-full font-mono bg-[var(--accent-primary)] text-[var(--bg-base)] border-none hover:bg-[var(--accent-muted)]"
              onClick={() => navigate('/login')}
            >
              Back to Login
            </button>
          </div>
        )}

        {(stage === 'ready' || stage === 'loading') && (
          <form onSubmit={handleReset}>
            <div className="form-control mb-4">
              <label className="label pb-1">
                <span className="label-text font-mono text-xs font-semibold text-[#e8f5e9]">
                  New Password
                </span>
              </label>
              <input
                type="password"
                className="input input-bordered w-full font-mono bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-primary)] focus:border-[var(--accent-primary)]"
                value={newPassword}
                minLength={8}
                required
                disabled={stage === 'loading'}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            <div className="form-control mb-4">
              <label className="label pb-1">
                <span className="label-text font-mono text-xs font-semibold text-[#e8f5e9]">
                  Confirm New Password
                </span>
              </label>
              <input
                type="password"
                className="input input-bordered w-full font-mono bg-[var(--bg-base)] border-[var(--border)] text-[var(--text-primary)] focus:border-[var(--accent-primary)]"
                value={confirmPassword}
                required
                disabled={stage === 'loading'}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            {error && (
              <p className="font-mono text-xs text-[var(--accent-danger)] bg-[var(--bg-elevated)] rounded-lg p-3 mb-4">
                {error}
              </p>
            )}

            <button
              type="submit"
              className={`btn w-full font-mono font-bold bg-[var(--accent-primary)] text-[var(--bg-base)] border-none hover:bg-[var(--accent-muted)]${stage === 'loading' ? ' loading' : ''}`}
              disabled={stage === 'loading'}
            >
              {stage === 'loading' ? 'Updating...' : 'Set New Password'}
            </button>
          </form>
        )}

        {stage === 'success' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle size={48} className="text-[var(--accent-primary)]" />
            <h2 className="display-font text-xl text-[var(--text-primary)] text-center m-0">
              Password updated successfully
            </h2>
            <p className="font-mono text-sm text-[var(--text-muted)] text-center m-0 mt-2">
              Redirecting to your dashboard...
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
