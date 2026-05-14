import { type RefObject, useEffect } from 'react';

export function useSettingsMenuDismiss(
  open: boolean,
  menuRef: RefObject<HTMLDivElement>,
  buttonRef: RefObject<HTMLButtonElement>,
  setOpen: (value: boolean) => void,
): void {
  useEffect(() => {
    if (!open) return;
    function onDocumentClick(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocumentClick);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onDocumentClick);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open, menuRef, buttonRef, setOpen]);
}
