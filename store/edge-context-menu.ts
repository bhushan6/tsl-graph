import { create } from 'zustand';

type EdgeContextMenuState = {
    isOpen: boolean;
    edgeId: string | null;
    screenPosition: { x: number; y: number };
};

type EdgeContextMenuActions = {
    open: (params: { edgeId: string; screenPosition: { x: number; y: number } }) => void;
    close: () => void;
};

const initialState: EdgeContextMenuState = {
    isOpen: false,
    edgeId: null,
    screenPosition: { x: 0, y: 0 },
};

export const useEdgeContextMenuStore = create<EdgeContextMenuState & EdgeContextMenuActions>((set) => ({
    ...initialState,
    open: (params) => set({ isOpen: true, ...params }),
    close: () => set({ ...initialState }),
}));
