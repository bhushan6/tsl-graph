'use client';

import { useEffect, useState } from 'react';
import { useTutorialStore } from '@/store/tutorial-store';
import { useEditorStore } from '@/store/editor';
import type { TutorialEditorState } from '@/lib/tutorial-definitions';

type Rect = { top: number; left: number; width: number; height: number };

const selectorsByTask: Record<string, (state: TutorialEditorState) => string> = {
  t1_add_float: () => '[data-tutorial-target="node-picker"]',
  t1_change_float_val: () => '[data-tutorial-target="properties-panel"]',
  t1_add_color: () => '[data-tutorial-target="node-picker"]',
  t1_change_color_val: () => '[data-tutorial-target="properties-panel"]',
  t2_connect_color: (state) => (state.nodes.length > 0 ? '.react-flow__renderer' : '.react-flow__renderer'),
  t2_add_second_color: () => '[data-tutorial-target="node-picker"]',
  t2_replace_connection: () => '.react-flow__renderer',
  t2_select_material: (state) => {
    const matNode = state.nodes.find((n) => n.data?.type?.startsWith('material/'));
    return matNode ? `.react-flow__node[data-id="${matNode.id}"]` : '.react-flow__renderer';
  },
  t2_enable_roughness: () => '[data-tutorial-target="property-input-roughnessNode"]',
  t2_quick_add: () => '.react-flow__renderer',
  t3_add_uv: () => '[data-tutorial-target="node-picker"]',
  t3_add_mix: () => '[data-tutorial-target="node-picker"]',
  t3_connect_uv_mix: () => '.react-flow__renderer',
  t3_add_colors: () => '[data-tutorial-target="node-picker"]',
  t3_connect_colors_mix: () => '.react-flow__renderer',
  t3_connect_mix_material: () => '[data-tutorial-target="preview-panel"]',
  t4_pan_canvas: () => '[data-tutorial-target="canvas"]',
  t4_zoom: () => '[data-tutorial-target="canvas"]',
  t4_move_node: (state) => {
    const floatNode = state.nodes.find((n) => n.data?.type === 'const/float');
    return floatNode ? `.react-flow__node[data-id="${floatNode.id}"]` : '[data-tutorial-target="canvas"]';
  },
  t4_delete_node: (state) => {
    const floatNode = state.nodes.find((n) => n.data?.type === 'const/float');
    return floatNode ? `.react-flow__node[data-id="${floatNode.id}"]` : '[data-tutorial-target="canvas"]';
  },
  t4_undo: () => '[data-tutorial-target="canvas"]',
  t5_open_preview: () => '[data-tutorial-target="preview-panel"]',
  t5_change_geometry: () => '[data-tutorial-target="preview-panel"]',
  t5_change_hdri: () => '[data-tutorial-target="preview-panel"]',
  t5_toggle_background: () => '[data-tutorial-target="preview-panel"]',
  t5_fullscreen: () => '[data-tutorial-target="preview-panel"]',
};

export function TutorialHighlight() {
  const isActive = useTutorialStore((s) => s.isActive);
  const currentTask = useTutorialStore((s) => s.getCurrentTask());
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!isActive || !currentTask) {
      setRect(null);
      return;
    }

    let cancelled = false;
    let observedElement: Element | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const updatePosition = () => {
      if (cancelled) return;

      const state = useEditorStore.getState();
      const selector = selectorsByTask[currentTask.id]?.(state) ?? '';

      if (!selector) {
        setRect(null);
        return;
      }

      const el = document.querySelector(selector);
      if (!el) {
        setRect(null);
        return;
      }

      if (observedElement !== el && typeof ResizeObserver !== 'undefined') {
        resizeObserver?.disconnect();
        observedElement = el;
        resizeObserver = new ResizeObserver(() => updatePosition());
        resizeObserver.observe(el);
      }

      const nextRect = el.getBoundingClientRect();
      setRect((prev) => {
        if (
          prev &&
          prev.top === nextRect.top &&
          prev.left === nextRect.left &&
          prev.width === nextRect.width &&
          prev.height === nextRect.height
        ) {
          return prev;
        }

        return {
          top: nextRect.top,
          left: nextRect.left,
          width: nextRect.width,
          height: nextRect.height,
        };
      });
    };

    updatePosition();

    const unsubscribe = useEditorStore.subscribe(() => {
      updatePosition();
    });

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      unsubscribe();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isActive, currentTask]);

  if (!rect) return null;

  return (
    <div
      className="fixed pointer-events-none z-[60] rounded-md border border-primary/80 bg-primary/5 ring-2 ring-primary/15 transition-all duration-150 ease-out"
      style={{
        top: rect.top - 4,
        left: rect.left - 4,
        width: rect.width + 8,
        height: rect.height + 8,
      }}
    />
  );
}
