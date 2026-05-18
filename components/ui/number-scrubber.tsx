import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export interface NumericScrubberChangeMeta {
  mode: "scrub" | "blur" | "enter";
}

export interface NumericScrubberProps
  extends Omit<React.HTMLAttributes<HTMLInputElement>, "onChange"> {
  /**
   * Current numeric value
   */
  value: number;
  /**
   * Callback whenever the value changes
   */
  onChange: (value: number, meta?: NumericScrubberChangeMeta) => void;
  /**
   * Minimum allowable value (clamped)
   */
  min?: number;
  /**
   * Maximum allowable value (clamped)
   */
  max?: number;
  /**
   * Step for increments (e.g., 1, 0.1, etc.)
   */
  step?: number;
  /**
   * Whether to quantize typed input to the step size.
   * Defaults to true only when an explicit integer step is provided.
   */
  quantizeInput?: boolean;
  /**
   * Additional class names for the outer wrapper
   */
  className?: string;

  /**
   * Controls the number of pixels required to increase/decrease a step.
   * A value of 1.0 means 1 pixel per step; 0.1 means 10 pixels per step
   *
   * * For fine-grained control (like opacity: 0-1): use a small value like 0.001
   * * For medium control (like rotation: 0-360): use a medium value like 0.1
   * * For coarse control (like integer counts): use a larger value like 0.5
   */
  scrubSensitivity?: number;
}

export const NumericScrubber = React.forwardRef<
  HTMLInputElement,
  NumericScrubberProps
>(
  (
    {
      value,
      onChange,
      min = -Infinity,
      max = Infinity,
      step: stepProp,
      quantizeInput,
      className,
      scrubSensitivity = 0.5,
      onBlur,
      onKeyDown,
      onPointerDown,
      ...rest
    },
    ref
  ) => {
    const step = stepProp ?? 1;
    const shouldQuantizeInput =
      quantizeInput ?? (stepProp !== undefined && Number.isInteger(step));
    const inputStep =
      stepProp === undefined ? undefined : (Number.isInteger(step) ? step : "any");
    const fallbackValue = React.useMemo(
      () => (Number.isFinite(min) ? min : 0),
      [min]
    );
    const [inputValue, setInputValue] = React.useState<string>(() => String(value));

    const inputRef = React.useRef<HTMLInputElement>(null);
    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    const isDraggingRef = React.useRef(false);
    const isTypingRef = React.useRef(false);
    const initialXRef = React.useRef(0);
    const initialValueRef = React.useRef(value);
    const internalValueRef = React.useRef(value);
    const inputValueRef = React.useRef(String(value));

    const decimals = React.useMemo(() => {
      if (!Number.isFinite(step)) return 0;
      const stepString = step.toString();
      const decimalPart = stepString.split(".")[1];
      return decimalPart ? decimalPart.length : 0;
    }, [step]);

    const clampValue = React.useCallback(
      (n: number) => Math.max(min, Math.min(n, max)),
      [max, min]
    );

    const clampAndQuantize = React.useCallback(
      (n: number) => {
        const quantized = step !== 0 ? Math.round(n / step) * step : n;
        const clamped = Math.max(min, Math.min(quantized, max));
        return parseFloat(clamped.toFixed(decimals));
      },
      [decimals, max, min, step]
    );

    const parseInputValue = React.useCallback(
      (rawValue: string) => {
        if (
          rawValue === "" ||
          rawValue === "-" ||
          rawValue === "." ||
          rawValue === "-."
        ) {
          return fallbackValue;
        }

        const parsed = Number.parseFloat(rawValue);
        if (Number.isNaN(parsed)) {
          return fallbackValue;
        }

        return shouldQuantizeInput ? clampAndQuantize(parsed) : clampValue(parsed);
      },
      [clampAndQuantize, clampValue, fallbackValue, shouldQuantizeInput]
    );

    const commitInputValue = React.useCallback(
      (rawValue: string, mode: "blur" | "enter") => {
        const nextValue = parseInputValue(rawValue);
        const normalizedValue = String(nextValue);
        const previousValue = internalValueRef.current;

        isTypingRef.current = false;
        internalValueRef.current = nextValue;
        inputValueRef.current = normalizedValue;
        setInputValue(normalizedValue);

        if (!Object.is(previousValue, nextValue)) {
          onChange(nextValue, { mode });
        }
      },
      [onChange, parseInputValue]
    );

    const handlePointerMove = React.useCallback(
      (e: PointerEvent) => {
        if (!isDraggingRef.current) return;

        const deltaX = e.clientX - initialXRef.current;
        const nextValue = clampAndQuantize(
          initialValueRef.current + deltaX * step * scrubSensitivity
        );

        if (Object.is(internalValueRef.current, nextValue)) {
          return;
        }

        const normalizedValue = String(nextValue);
        isTypingRef.current = false;
        internalValueRef.current = nextValue;
        inputValueRef.current = normalizedValue;
        setInputValue(normalizedValue);
        onChange(nextValue, { mode: "scrub" });
      },
      [clampAndQuantize, onChange, scrubSensitivity, step]
    );

    const handlePointerUp = React.useCallback(
      function handlePointerUpEvent() {
        isDraggingRef.current = false;
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUpEvent);
      },
      [handlePointerMove]
    );

    const handlePointerDown = React.useCallback(
      (e: React.PointerEvent<HTMLElement>) => {
        if (e.button !== 0) return;

        isDraggingRef.current = true;
        isTypingRef.current = false;
        initialXRef.current = e.clientX;

        const parsedDraftValue = Number.parseFloat(inputValueRef.current);
        initialValueRef.current = Number.isNaN(parsedDraftValue)
          ? internalValueRef.current
          : clampValue(parsedDraftValue);

        document.addEventListener("pointermove", handlePointerMove);
        document.addEventListener("pointerup", handlePointerUp);
      },
      [clampValue, handlePointerMove, handlePointerUp]
    );

    const handleInputPointerDown = React.useCallback(
      (e: React.PointerEvent<HTMLInputElement>) => {
        onPointerDown?.(e);
        if (e.defaultPrevented) {
          return;
        }

        handlePointerDown(e);
      },
      [handlePointerDown, onPointerDown]
    );

    const handleInputChange = React.useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const nextInputValue = e.target.value;
        isTypingRef.current = true;
        inputValueRef.current = nextInputValue;
        setInputValue(nextInputValue);
      },
      []
    );

    const handleInputBlur = React.useCallback(
      (e: React.FocusEvent<HTMLInputElement>) => {
        commitInputValue(inputValueRef.current, "blur");
        onBlur?.(e);
      },
      [commitInputValue, onBlur]
    );

    const handleInputKeyDown = React.useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        onKeyDown?.(e);
        if (e.defaultPrevented || e.key !== "Enter") {
          return;
        }

        commitInputValue(inputValueRef.current, "enter");
        e.currentTarget.blur();
      },
      [commitInputValue, onKeyDown]
    );

    React.useEffect(() => {
      return () => {
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
      };
    }, [handlePointerMove, handlePointerUp]);

    React.useEffect(() => {
      if (isDraggingRef.current || isTypingRef.current) {
        return;
      }

      const normalizedValue = String(value);
      internalValueRef.current = value;
      inputValueRef.current = normalizedValue;
      setInputValue(normalizedValue);
    }, [value]);

    return (
      <div className={cn("relative group w-fill")}>
        <div
          className="absolute inset-y-0 left-0 flex items-center px-2 text-gray-400 cursor-ew-resize select-none"
          onPointerDown={handlePointerDown}
        >
          ↔
        </div>
        <Input
          ref={inputRef}
          type="number"
          /**
           * Hide the default spinners in Chrome/Edge/Safari
           */
          className={cn(
            `[appearance:textfield]
             [&::-webkit-inner-spin-button]:appearance-none
             [&::-webkit-outer-spin-button]:appearance-none
             pl-6
             hover:cursor-ew-resize
             active:cursor-none
             text-right
             `,
            className
          )}
          step={inputStep}
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          onPointerDown={handleInputPointerDown}
          {...rest}
        />
      </div>
    );
  }
);

NumericScrubber.displayName = "NumericScrubber";
