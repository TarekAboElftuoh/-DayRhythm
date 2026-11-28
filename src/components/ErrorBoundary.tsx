import React from 'react';
import { AlertTriangle, ChevronDown, RefreshCw } from 'lucide-react';

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  sectionTitle?: string;
  compact?: boolean;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  errorDetails: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
      errorDetails: '',
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      errorMessage: error?.message || 'حدث خطأ غير متوقع أثناء التشغيل.',
      errorDetails: error?.stack || '',
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const details = [error?.stack, errorInfo?.componentStack].filter(Boolean).join('\n\n');
    if (details) {
      this.setState({ errorDetails: details });
    }
    console.error('[ErrorBoundary]', this.props.sectionTitle || 'root', error, errorInfo);
  }

  private handleReset = (): void => {
    this.setState({
      hasError: false,
      errorMessage: '',
      errorDetails: '',
    });
    this.props.onReset?.();
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { sectionTitle, compact = false } = this.props;
    const card = (
      <div
        dir="rtl"
        role="alert"
        className={`w-full rounded-2xl border border-amber-500/25 bg-[var(--bg-card,#090C11)]/95 p-5 space-y-3.5 text-zinc-100 shadow-lg ${
          compact ? '' : 'max-w-md'
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center shrink-0 text-amber-300">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="text-sm sm:text-base font-bold text-zinc-100">
              حدث خطأ غير متوقع في هذا الجزء
            </h2>
            {sectionTitle && (
              <p className="text-xs text-zinc-400">القسم المتأثر: {sectionTitle}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={this.handleReset}
            className="min-h-[38px] px-4 py-1.5 rounded-xl bg-[#7FFFD4] text-black text-xs font-bold hover:bg-[#66eec2] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>إعادة المحاولة</span>
          </button>
        </div>

        {(this.state.errorMessage || this.state.errorDetails) && (
          <details className="group rounded-xl border border-white/[0.07] bg-black/35 px-3 py-2 text-xs">
            <summary className="cursor-pointer select-none list-none flex items-center justify-between text-zinc-400 hover:text-zinc-200">
              <span>تفاصيل الخطأ</span>
              <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" />
            </summary>
            <pre
              dir="ltr"
              className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-zinc-400"
            >
              {this.state.errorDetails || this.state.errorMessage}
            </pre>
          </details>
        )}
      </div>
    );

    if (compact) {
      return card;
    }

    return (
      <div
        dir="rtl"
        className="min-h-screen bg-[#070A0F] text-zinc-100 flex items-center justify-center p-6"
      >
        {card}
      </div>
    );
  }
}
