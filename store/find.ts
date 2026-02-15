import { create } from 'zustand';

type FindState = {
    isOpen: boolean;
};

type FindActions = {
    open: () => void;
    close: () => void;
};

export const useFindStore = create<FindState & FindActions>((set) => ({
    isOpen: false,
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
}));
