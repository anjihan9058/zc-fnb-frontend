import { useLayoutEffect } from 'react';

// iOS pans the visual viewport as well as resizing it when an input is focused.
// Position the complete chat inside that visible rectangle, not the layout viewport.
export function useChatViewport() {
  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    const mobile = window.matchMedia('(max-width: 760px)');
    let frame = 0;
    let restingHeight = viewport?.height ?? window.innerHeight;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!mobile.matches || (viewport && Math.abs(viewport.scale - 1) > 0.02)) return;
        const height = viewport?.height ?? window.innerHeight;
        const active = document.activeElement;
        const inputFocused = active instanceof HTMLElement && active.matches('input, textarea, [contenteditable="true"]');
        if (!inputFocused) restingHeight = Math.max(restingHeight, height, window.innerHeight);
        const keyboard = inputFocused && restingHeight - height > 120;
        root.style.setProperty('--chat-viewport-height', `${Math.round(height)}px`);
        root.style.setProperty('--chat-viewport-top', `${Math.max(0, Math.round(viewport?.offsetTop ?? 0))}px`);
        root.dataset.chatKeyboard = String(keyboard);
      });
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
      root.style.removeProperty('--chat-viewport-height');
      root.style.removeProperty('--chat-viewport-top');
      delete root.dataset.chatKeyboard;
    };
  }, []);
}
