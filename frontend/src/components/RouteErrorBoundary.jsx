import { Component } from "react";

// Catches lazy-loaded route chunk failures (e.g. stale build after a deploy)
// and offers a retry instead of leaving the customer on a blank page.
export default class RouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {}

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] w-full text-center px-4">
          <p className="text-[var(--ink)] font-medium">Something went wrong while loading this page.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-6 py-2.5 rounded-full bg-[var(--brand)] text-white text-sm font-medium hover:bg-[var(--brand-hover)] transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
