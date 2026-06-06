'use client';

import { Component, type ReactNode } from 'react';

interface StageBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface StageBoundaryState {
  failed: boolean;
}

/**
 * Isolates the Live2D stage so a renderer failure (WebGL unavailable, model
 * load error, chunk eval error) degrades to no-face instead of taking down the
 * surrounding chat.
 */
export class StageBoundary extends Component<StageBoundaryProps, StageBoundaryState> {
  state: StageBoundaryState = { failed: false };

  static getDerivedStateFromError(): StageBoundaryState {
    return { failed: true };
  }

  render(): ReactNode {
    if (this.state.failed) return this.props.fallback ?? null;
    return this.props.children;
  }
}
