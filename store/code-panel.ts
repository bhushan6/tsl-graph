import { create } from 'zustand';

type CodePanelState = {
    isOpen: boolean;
};

type CodePanelActions = {
    open: () => void;
    close: () => void;
};

export const useCodePanelStore = create<CodePanelState & CodePanelActions>((set) => ({
    isOpen: false,
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
}));
