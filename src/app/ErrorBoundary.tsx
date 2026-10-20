import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("HLAO dashboard render error", error, info);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="boot">
        <div className="boot__mark" aria-hidden="true">
          <span />
        </div>
        <div className="boot__title">The dashboard could not render</div>
        <div className="boot__text boot__text--error" role="alert">
          {this.state.error.message}
        </div>
        <div className="boot__text">
          The supervisor was not changed. Reload to rebuild the client view; if this
          repeats, inspect the browser console.
        </div>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => window.location.reload()}
        >
          Reload the dashboard
        </button>
      </div>
    );
  }
}
