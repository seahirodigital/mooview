import React, {StrictMode, type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

class AppErrorBoundary extends React.Component<
  {children: ReactNode},
  {error: Error | null}
> {
  declare props: {children: ReactNode};
  state = {error: null};

  static getDerivedStateFromError(error: Error) {
    return {error};
  }

  componentDidCatch(error: Error) {
    console.error('MooView render error', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-black text-gray-200 p-6 font-sans">
        <div className="max-w-2xl border border-red-900/70 bg-red-950/30 p-4">
          <h1 className="text-base font-bold text-red-200">MooViewの表示でエラーが発生しました</h1>
          <p className="mt-2 text-sm text-gray-300">
            画面が真っ黒になる代わりに、ここへ原因を表示しています。ページを再読み込みしても続く場合は、この内容を共有してください。
          </p>
          <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-red-100">
            {this.state.error.message}
          </pre>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
