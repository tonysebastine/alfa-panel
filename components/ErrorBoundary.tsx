'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw, ShieldAlert, Bug } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  sectionName?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  resetAttempts: number;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    resetAttempts: 0,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled exception:', error, errorInfo);
    this.setState({ errorInfo });

    // Try to safely store crash log for diagnostics
    try {
      const crashLog = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        section: this.props.sectionName || 'global',
      };
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('panel_last_crash', JSON.stringify(crashLog));
      }
    } catch {
      // Ignore localStorage write failures
    }
  }

  private handleTryAgain = () => {
    this.setState(prevState => ({
      hasError: false,
      error: null,
      errorInfo: null,
      resetAttempts: prevState.resetAttempts + 1,
    }));
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private handleHardReset = () => {
    try {
      if (typeof window !== 'undefined') {
        // Clean potentially corrupted ephemeral UI state
        window.sessionStorage.clear();
      }
    } catch {
      // Ignore
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const isSection = Boolean(this.props.sectionName);

      return (
        <div
          className={`w-full ${
            isSection
              ? 'p-6 bg-slate-900/90 border border-red-500/30 rounded-2xl'
              : 'min-h-screen bg-slate-950 p-6 flex items-center justify-center'
          } font-mono`}
        >
          <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl">
            {/* Header */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-red-400 bg-red-950/60 border border-red-800/40 px-2 py-0.5 rounded-md">
                    Self-Healing Intercepted Fault
                  </span>
                  {this.props.sectionName && (
                    <span className="text-xs text-slate-400">· {this.props.sectionName}</span>
                  )}
                </div>
                <h2 className="text-lg font-bold text-white tracking-tight">
                  {this.props.fallbackTitle || 'Component Runtime Exception Prevented'}
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  The panel error boundary isolated this failure to preserve host stability and
                  prevent full interface crash.
                </p>
              </div>
            </div>

            {/* Error detail */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-slate-400">
                <Bug className="w-3.5 h-3.5 text-red-400" />
                <span className="font-semibold text-slate-300">Exception:</span>
                <span className="text-red-300 truncate">
                  {this.state.error?.name || 'Error'}: {this.state.error?.message || 'Unknown runtime error'}
                </span>
              </div>
              {this.state.error?.stack && (
                <div className="max-h-32 overflow-y-auto text-[11px] text-slate-500 font-mono bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60 whitespace-pre-wrap select-all">
                  {this.state.error.stack.split('\n').slice(0, 5).join('\n')}
                </div>
              )}
            </div>

            {/* Recovery actions */}
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={this.handleTryAgain}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-colors shadow-lg shadow-emerald-950/50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Recover Component</span>
              </button>
              <button
                type="button"
                onClick={this.handleHardReset}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors border border-slate-700"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reload Session</span>
              </button>
              {this.state.resetAttempts > 0 && (
                <span className="text-xs text-amber-400/80">
                  Attempt {this.state.resetAttempts}
                </span>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
