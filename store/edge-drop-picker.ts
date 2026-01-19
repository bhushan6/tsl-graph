import { create } from 'zustand';
import { TSLType } from '@/lib/types';

type EdgeDropPickerState = {
    isOpen: boolean;
    screenPosition: { x: number; y: number };
    flowPosition: { x: number; y: number };
    sourceDataType: TSLType | '';
    sourceNodeId: string;
    sourceHandleId: string;
    handleDirection: 'input' | 'output';
};

type EdgeDropPickerActions = {
    open: (params: Omit<EdgeDropPickerState, 'isOpen'>) => void;
    close: () => void;
};

const initialState: EdgeDropPickerState = {
    isOpen: false,
    screenPosition: { x: 0, y: 0 },
    flowPosition: { x: 0, y: 0 },
    sourceDataType: '',
    sourceNodeId: '',
    sourceHandleId: '',
    handleDirection: 'output',
};

export const useEdgeDropPickerStore = create<EdgeDropPickerState & EdgeDropPickerActions>((set) => ({
    ...initialState,
    open: (params) => set({ isOpen: true, ...params }),
    close: () => set({ ...initialState }), // Reset state on close
}));
