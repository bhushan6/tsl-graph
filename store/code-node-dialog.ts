import { create } from 'zustand';

type CodeNodeDialogState = {
    isOpen: boolean;
};

type CodeNodeDialogActions = {
    open: () => void;
    close: () => void;
};

export const useCodeNodeDialogStore = create<CodeNodeDialogState & CodeNodeDialogActions>((set) => ({
    isOpen: false,
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
}));
