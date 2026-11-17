import { useRef } from 'react';

export function useLibraryDraft<T>(draft: T, setDraft: (next: T) => void, discardMessage: string) {
  const savedDraft = useRef(draft);
  const acceptReplacement = () =>
    JSON.stringify(draft) === JSON.stringify(savedDraft.current) || window.confirm(discardMessage);

  const replaceDraft = (next: T) => {
    savedDraft.current = next;
    setDraft(next);
  };

  return { acceptReplacement, replaceDraft };
}
