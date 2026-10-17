import { afterEach, describe, expect, it } from 'vitest';
import {
    applyUniformEvent,
    clearUniforms,
    ensureUniform,
    removeUniform,
    setUniformFactory,
    subscribeUniformEvents,
    updateUniformValue,
    type UniformEvent,
} from './uniform-store';

setUniformFactory((value) => ({ value }));

describe('uniform events', () => {
    afterEach(() => clearUniforms());

    it('mirrors updates, removals and clears to subscribers', () => {
        const events: UniformEvent[] = [];
        const unsubscribe = subscribeUniformEvents((event) => events.push(event));
        updateUniformValue('u1', 'float', 0.5);
        removeUniform('u1');
        clearUniforms();
        unsubscribe();
        updateUniformValue('u1', 'float', 1);

        expect(events).toEqual([
            { type: 'update', id: 'u1', kind: 'float', value: 0.5 },
            { type: 'remove', id: 'u1' },
            { type: 'clear' },
        ]);
    });

    it('applies mirrored events to the local uniform nodes', () => {
        const node = ensureUniform('u1', 0, 'float');
        applyUniformEvent({ type: 'update', id: 'u1', kind: 'float', value: 0.75 });
        expect(node.value).toBe(0.75);

        // A removed or cleared uniform must not hand its stale value to the next build.
        applyUniformEvent({ type: 'remove', id: 'u1' });
        expect(ensureUniform('u1', 0.1, 'float')).not.toBe(node);
        applyUniformEvent({ type: 'clear' });
        expect(ensureUniform('u1', 0.2, 'float').value).toBe(0.2);
    });
});
