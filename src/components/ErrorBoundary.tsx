import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Save It UI ErrorBoundary caught:', error, info);
  }

  private parseErrorDetails(raw: string): { summary: string; detail?: string } {
    try {
      const parsed = JSON.parse(raw) as { error?: string; operationType?: string; path?: string };
      if (parsed && parsed.error) {
        return {
          summary: parsed.error,
          detail: parsed.path ? `${parsed.operationType ?? 'op'} · ${parsed.path}` : undefined,
        };
      }
    } catch {
      // non-JSON runtime error
    }
    return { summary: raw || 'Unexpected application error.' };
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    const parsed = this.parseErrorDetails(this.state.error.message);
    return (
      <div
        role="alert"
        className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b0e14] p-6 text-[#f6f1e9]"
      >
        <div className="w-full max-w-md rounded-2xl border border-red-400/35 bg-[#151a24] p-6 shadow-2xl">
          <h2 className="font-display text-xl font-bold tracking-wide text-red-300 uppercase">
            Connection / Data Error
          </h2>
          <p className="mt-2 text-sm text-slate-200 break-words">{parsed.summary}</p>
          {parsed.detail && (
            <p className="mt-1.5 text-xs font-mono text-slate-400 break-all">{parsed.detail}</p>
          )}
          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="px-4 py-2 rounded-lg bg-cyan-400 text-[#07161d] text-xs font-bold uppercase tracking-wider hover:brightness-110"
            >
              Dismiss &amp; Continue
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg border border-white/20 bg-white/5 text-xs font-semibold text-slate-200 hover:bg-white/10"
            >
              Reload App
            </button>
          </div>
        </div>
      </div>
    );
  }
}
