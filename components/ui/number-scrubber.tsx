import * as React from "react";
import { createPortal } from "react-dom";
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

/**
 * Cap on fractional digits so we clean up floating-point noise (e.g. the classic
 * 0.1 + 0.2 = 0.30000000000000004) while still showing small values the user
 * cares about (0.01, 0.001, 0.0001, ...) exactly as they are.
 */
const MAX_DISPLAY_DECIMALS = 6;

function getDecimalDigits(value: number): number {
  if (!Number.isFinite(value)) return 0;

  const fixedText = value.toFixed(10);
  const fraction = fixedText.split(".")[1];
  return fraction ? fraction.replace(/0+$/, "").length : 0;
}

// Precision used only when quantizing scrub/arrow-key values to the step size,
// so a multiple of the step (e.g. 0.1 * 3) is cleaned up rather than displayed
// with float noise. Display precision is handled separately by formatNumber.
function getQuantizeDecimals(step: number | undefined) {
  return step !== undefined
    ? Math.min(getDecimalDigits(step), MAX_DISPLAY_DECIMALS)
    : MAX_DISPLAY_DECIMALS;
}

function getSuitablePointerScale(step: number | undefined, rawValue: number) {
  const base = Math.abs(step ?? rawValue);
  return base === 0 ? 0.1 : Math.pow(10, Math.floor(Math.log10(base)) - 1);
}

function getStepForKey(step: number, e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return 0;

  const scaledStep = step * (e.altKey ? 0.1 : 1) * (e.shiftKey ? 10 : 1);
  return e.key === "ArrowUp" ? scaledStep : -scaledStep;
}

// Renders the value as-is: no padding, no forced precision — just trailing
// zeros stripped and float noise trimmed at MAX_DISPLAY_DECIMALS.
function formatNumber(value: number, maxDecimals: number = MAX_DISPLAY_DECIMALS) {
  if (!Number.isFinite(value)) return "0";
  const fixed = value.toFixed(Math.max(Math.min(maxDecimals, 20), 0));
  return fixed.includes(".")
    ? fixed.replace(/0+$/, "").replace(/\.$/, "")
    : fixed;
}

interface GuideOrigin {
  x: number;
  y: number;
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
      scrubSensitivity,
      onBlur,
      onKeyDown,
      onPointerDown,
      ...rest
    },
    ref
  ) => {
    const keyStep = stepProp ?? 1;
    const shouldQuantizeInput =
      quantizeInput ?? (stepProp !== undefined && Number.isInteger(stepProp));
    const fallbackValue = React.useMemo(
      () => (Number.isFinite(min) ? min : 0),
      [min]
    );
    const quantizeDecimals = React.useMemo(
      () => getQuantizeDecimals(stepProp),
      [stepProp]
    );
    const [inputValue, setInputValue] = React.useState<string>(() =>
      formatNumber(value)
    );
    const [draggingDelta, setDraggingDelta] = React.useState<number | null>(null);
    const [guideOrigin, setGuideOrigin] = React.useState<GuideOrigin | null>(null);

    const wrapperRef = React.useRef<HTMLDivElement>(null);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const knobRef = React.useRef<HTMLDivElement>(null);
    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    const isDraggingRef = React.useRef(false);
    const isTypingRef = React.useRef(false);
    const initialValueRef = React.useRef(value);
    const internalValueRef = React.useRef(value);
    const inputValueRef = React.useRef(formatNumber(value));

    const clampValue = React.useCallback(
      (n: number) => Math.max(min, Math.min(n, max)),
      [max, min]
    );

    const clampAndQuantize = React.useCallback(
      (n: number) => {
        const quantized =
          stepProp !== undefined && stepProp !== 0
            ? Math.round(n / stepProp) * stepProp
            : n;
        const clamped = Math.max(min, Math.min(quantized, max));
        return parseFloat(clamped.toFixed(quantizeDecimals));
      },
      [quantizeDecimals, max, min, stepProp]
    );

    const normalizeValue = React.useCallback(
      (n: number, quantize = stepProp !== undefined) =>
        quantize ? clampAndQuantize(n) : clampValue(n),
      [clampAndQuantize, clampValue, stepProp]
    );

    // Refs for latest callback values – keeps document listeners stable
    // across re-renders so they never go stale mid-scrub.
    const onChangeRef = React.useRef(onChange);
    const normalizeValueRef = React.useRef(normalizeValue);
    const clampValueRef = React.useRef(clampValue);
    const keyStepRef = React.useRef(keyStep);
    const pointerScaleRef = React.useRef(
      scrubSensitivity ?? getSuitablePointerScale(stepProp, value)
    );

    onChangeRef.current = onChange;
    normalizeValueRef.current = normalizeValue;
    clampValueRef.current = clampValue;
    keyStepRef.current = keyStep;
    pointerScaleRef.current =
      scrubSensitivity ?? getSuitablePointerScale(stepProp, internalValueRef.current);

    const setDisplayValue = React.useCallback((nextValue: number) => {
      const normalizedValue = formatNumber(nextValue);
      inputValueRef.current = normalizedValue;
      setInputValue(normalizedValue);
    }, []);

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

        return normalizeValue(parsed, shouldQuantizeInput);
      },
      [fallbackValue, normalizeValue, shouldQuantizeInput]
    );

    const commitInputValue = React.useCallback(
      (rawValue: string, mode: "blur" | "enter") => {
        const nextValue = parseInputValue(rawValue);
        const previousValue = internalValueRef.current;

        isTypingRef.current = false;
        internalValueRef.current = nextValue;
        setDisplayValue(nextValue);

        if (!Object.is(previousValue, nextValue)) {
          onChange(nextValue, { mode });
        }
      },
      [onChange, parseInputValue, setDisplayValue]
    );

    const handlePointerMove = React.useCallback(
      (e: PointerEvent) => {
        if (!isDraggingRef.current) return;

        e.preventDefault();
        const knobElement = knobRef.current;
        if (!knobElement) return;

        const bounds = knobElement.getBoundingClientRect();
        const pointerX = e.clientX - bounds.left;
        const deltaX = pointerX - bounds.width / 2;
        const nextValue = normalizeValueRef.current(
          initialValueRef.current + deltaX * pointerScaleRef.current
        );

        if (Object.is(internalValueRef.current, nextValue)) {
          return;
        }

        isTypingRef.current = false;
        internalValueRef.current = nextValue;
        setDisplayValue(nextValue);
        setDraggingDelta(nextValue - initialValueRef.current);
        onChangeRef.current(nextValue, { mode: "scrub" });
      },
      [setDisplayValue]
    );

    const handlePointerUp = React.useCallback(
      function handlePointerUpEvent() {
        isDraggingRef.current = false;
        setDraggingDelta(null);
        setGuideOrigin(null);
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUpEvent);
      },
      [handlePointerMove]
    );

    const handlePointerDown = React.useCallback(
      (e: React.PointerEvent<HTMLElement>) => {
        if (e.button !== 0) return;

        e.preventDefault();
        inputRef.current?.focus();
        isDraggingRef.current = true;
        isTypingRef.current = false;
        const wrapperRect = wrapperRef.current?.getBoundingClientRect();
        if (wrapperRect) {
          setGuideOrigin({
            x: wrapperRect.left + 10,
            y: wrapperRect.top + wrapperRect.height / 2,
          });
        }

        const parsedDraftValue = Number.parseFloat(inputValueRef.current);
        initialValueRef.current = Number.isNaN(parsedDraftValue)
          ? internalValueRef.current
          : clampValueRef.current(parsedDraftValue);
        setDraggingDelta(0);

        document.addEventListener("pointermove", handlePointerMove);
        document.addEventListener("pointerup", handlePointerUp);
      },
      [handlePointerMove, handlePointerUp]
    );

    const handleInputPointerDown = React.useCallback(
      (e: React.PointerEvent<HTMLInputElement>) => {
        onPointerDown?.(e);
      },
      [onPointerDown]
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
        if (e.defaultPrevented) {
          return;
        }

        if (e.key === "Enter") {
          commitInputValue(inputValueRef.current, "enter");
          e.currentTarget.blur();
          return;
        }

        const stepDelta = getStepForKey(keyStepRef.current, e);
        if (stepDelta === 0) {
          return;
        }

        e.preventDefault();
        const nextValue = normalizeValueRef.current(
          internalValueRef.current + stepDelta
        );
        internalValueRef.current = nextValue;
        isTypingRef.current = false;
        setDisplayValue(nextValue);
        onChangeRef.current(nextValue, { mode: "scrub" });
      },
      [commitInputValue, onKeyDown, setDisplayValue]
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

      internalValueRef.current = value;
      setDisplayValue(value);
    }, [setDisplayValue, value]);

    const guideOffset =
      draggingDelta === null ? 0 : draggingDelta / pointerScaleRef.current;
    const guideHeadOffset =
      guideOffset + (guideOffset > 0 ? -1 : guideOffset < 0 ? 1 : 0);
    const guideArrowOffset = Math.min(Math.max(-guideHeadOffset, -4), 4);
    const formattedTooltip =
      draggingDelta === null
        ? ""
        : formatNumber(internalValueRef.current);
    const guideOverlay =
      draggingDelta !== null && guideOrigin && typeof document !== "undefined"
        ? createPortal(
            <div
              className="pointer-events-none fixed z-50 flex items-center"
              style={{
                left: guideOrigin.x,
                top: guideOrigin.y,
                transform: "translateY(-50%)",
              }}
            >
              <svg
                className="absolute overflow-visible text-foreground/70"
                width="1"
                height="8"
                viewBox="0 0 1 8"
                style={{ transform: `translateX(${guideOffset}px)` }}
              >
                <path
                  d={`M ${-guideOffset},4 L0,4`}
                  fill="none"
                  stroke="currentColor"
                  strokeDasharray="1"
                />
                <path
                  d={[
                    `M ${guideHeadOffset - guideOffset + guideArrowOffset},0`,
                    `L${guideHeadOffset - guideOffset},4`,
                    `L${guideHeadOffset - guideOffset + guideArrowOffset},8`,
                    `M 0,-1 L0,9`,
                  ].join(" ")}
                  fill="none"
                  stroke="currentColor"
                />
              </svg>
              <div
                className="absolute left-2 rounded bg-popover px-1.5 py-0.5 text-[10px] font-mono text-popover-foreground shadow-sm"
                style={{ transform: `translateX(${guideOffset}px)` }}
              >
                {formattedTooltip}
              </div>
            </div>,
            document.body
          )
        : null;

    return (
      <div ref={wrapperRef} className={cn("relative group w-fill")}>
        <div
          ref={knobRef}
          aria-hidden="true"
          className={cn(
            "absolute inset-y-0 left-1 z-10 flex w-3 cursor-ew-resize select-none items-center justify-center",
            "before:h-[calc(100%-8px)] before:w-0.5 before:rounded-full before:bg-foreground before:opacity-15 before:transition-all",
            "hover:before:opacity-80",
            draggingDelta !== null &&
              "before:h-1 before:w-1 before:rounded-full before:opacity-90"
          )}
          onPointerDown={handlePointerDown}
        />
        {guideOverlay}
        <Input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          className={cn(
            "pl-6 text-right font-mono",
            draggingDelta !== null && "opacity-50",
            className
          )}
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
