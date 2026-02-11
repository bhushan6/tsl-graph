
import { describe, it, expect } from 'vitest';
import { parseCodeNodeCode } from './code-parser';

describe('parseCodeNodeCode', () => {
    it('should parse valid Fn with arguments', () => {
        const code = `Fn(([a, b]) => { return a.add(b); })`;
        const result = parseCodeNodeCode(code);
        expect(result.isValid).toBe(true);
        expect(result.arguments).toEqual(['a', 'b']);
    });

    it('should parse valid Fn with single argument', () => {
        const code = `Fn(([in1]) => { return in1.add(1); })`;
        const result = parseCodeNodeCode(code);
        expect(result.isValid).toBe(true);
        expect(result.arguments).toEqual(['in1']);
    });

    it('should parse valid Fn with no arguments (empty array)', () => {
        const code = `Fn(([]) => { return 1; })`;
        const result = parseCodeNodeCode(code);
        expect(result.isValid).toBe(true);
        expect(result.arguments).toEqual([]);
    });

    it('should NOT extract arguments from nested Fn when outer Fn has no arguments (array)', () => {
        const code = `Fn(([]) => {
      const inner = Fn(([a]) => { return a; });
      return inner(1);
    })`;
        const result = parseCodeNodeCode(code);
        expect(result.isValid).toBe(true);
        expect(result.arguments).toEqual([]); // Should be empty, but bug might make it ['a'] if logic is flawed
    });

    it('should failing or handle Fn without array destructuring if that is supported (Fn(() => ...))', () => {
        // If user intends Fn(() => ...) to be valid 0 args:
        const code = `Fn(() => { return 1; })`;
        const result = parseCodeNodeCode(code);
        // Current behavior might be invalid or buggy.
        // If we want to support this as 0 args:
        expect(result.isValid).toBe(true);
        expect(result.arguments).toEqual([]);
    });

    it('should NOT extract arguments from nested Fn when outer Fn has no arguments (arrow)', () => {
        const code = `Fn(() => {
        const inner = Fn(([a]) => { return a; });
        return inner(1);
      })`;
        const result = parseCodeNodeCode(code);
        // If we support F(() => ...), this should be valid and empty args.
        // Currently, it likely picks 'a' from inner Fn.

        // We expect it to be handled correctly (either invalid top level, OR valid top level with 0 args).
        // Assuming valid top level with 0 args is better UX:
        expect(result.arguments).toEqual([]);
    });

    it('should fail if argument is a reserved keyword (syntax error)', () => {
        const code = `Fn(([class]) => { return class; })`;
        const result = parseCodeNodeCode(code);
        expect(result.isValid).toBe(false);
        // Acorn throws syntax error for 'class'
        expect(result.error).toMatch(/Syntax Error|Reserved keyword/);
    });

    it('should fail if argument is a reserved keyword (custom check)', () => {
        // 'await' is valid identifier in script mode (default for acorn) but reserved in modules/async
        // robust parser should block it if we want to be safe
        const code = `Fn(([await]) => { return await; })`;
        const result = parseCodeNodeCode(code);
        expect(result.isValid).toBe(false);
        // This should hit my custom check if acorn allows it
        expect(result.error).toMatch(/Reserved keyword|Syntax Error/);
    });

    it('should fail if syntax is invalid', () => {
        const code = `Fn(([a]) => { return a.add(1) }`; // Missing closing parenthesis
        const result = parseCodeNodeCode(code);
        expect(result.isValid).toBe(false);
        // Error message might vary depending on parser but should be present
        expect(result.error).toBeTruthy();
    });

    it('should fail if arguments are invalid JS identifiers', () => {
        const code = `Fn(([1a]) => { return 1a; })`;
        const result = parseCodeNodeCode(code);
        expect(result.isValid).toBe(false);
        expect(result.error).toBeTruthy();
    });

    it('should parse WGSL and infer argument/return types', () => {
        const code = `fn colorFn(baseColor: vec4f, uv: vec2f) -> vec4f {
  return mix(baseColor, vec4f(1.0), uv.x);
}`;
        const result = parseCodeNodeCode(code, 'wgsl');
        expect(result.isValid).toBe(true);
        expect(result.arguments).toEqual(['baseColor', 'uv']);
        expect(result.argTypes).toEqual({ baseColor: 'vec4', uv: 'vec2' });
        expect(result.returnType).toBe('vec4');
    });

    it('should map WGSL generic types', () => {
        const code = `fn mapFn(a: vec2<f32>, b: vec3<i32>) -> mat4x4<f32> {
  return mat4x4<f32>(1.0);
}`;
        const result = parseCodeNodeCode(code, 'wgsl');
        expect(result.isValid).toBe(true);
        expect(result.argTypes?.a).toBe('vec2');
        expect(result.argTypes?.b).toBe('ivec3');
        expect(result.returnType).toBe('mat4');
    });

    it('should fail WGSL without a function signature', () => {
        const code = `let x = 1.0;`;
        const result = parseCodeNodeCode(code, 'wgsl');
        expect(result.isValid).toBe(false);
        expect(result.error).toMatch(/function signature/i);
    });

    it('should fail WGSL with invalid argument names', () => {
        const code = `fn bad(1a: vec4f) -> vec4f { return vec4f(1.0); }`;
        const result = parseCodeNodeCode(code, 'wgsl');
        expect(result.isValid).toBe(false);
        expect(result.error).toBeTruthy();
    });
});
