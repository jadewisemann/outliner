import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";

export type FocusHint = { caret: number | "end"; seq: number } | null;

type Props = {
  value: string;
  className: string;
  placeholder?: string;
  ariaLabel: string;
  focusHint: FocusHint;
  onChange: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>, element: HTMLTextAreaElement) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onPaste?: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
};

/**
 * An auto-growing textarea that stays *uncontrolled* while it has focus.
 *
 * React re-rendering a controlled textarea mid-composition is what breaks
 * Korean/Japanese/Chinese IME input, so the DOM value is only overwritten when
 * the incoming text differs from what this field last emitted.
 */
export function Editable({
  value,
  className,
  placeholder,
  ariaLabel,
  focusHint,
  onChange,
  onKeyDown,
  onFocus,
  onBlur,
  onPaste
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const emitted = useRef(value);
  const composing = useRef(false);
  const appliedSeq = useRef(-1);

  const resize = () => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${element.scrollHeight}px`;
  };

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || composing.current) return;
    if (value !== emitted.current && element.value !== value) {
      element.value = value;
      emitted.current = value;
    }
    resize();
  }, [value]);

  useEffect(() => {
    const element = ref.current;
    if (!element || !focusHint || focusHint.seq === appliedSeq.current) return;
    appliedSeq.current = focusHint.seq;
    element.focus({ preventScroll: true });
    const caret = focusHint.caret === "end" ? element.value.length : Math.min(focusHint.caret, element.value.length);
    element.setSelectionRange(caret, caret);
    element.scrollIntoView({ block: "nearest" });
  }, [focusHint]);

  const emit = () => {
    const element = ref.current;
    if (!element) return;
    emitted.current = element.value;
    resize();
    onChange(element.value);
  };

  return (
    <textarea
      ref={ref}
      rows={1}
      className={className}
      aria-label={ariaLabel}
      placeholder={placeholder}
      defaultValue={value}
      spellCheck={false}
      onInput={() => {
        if (composing.current) {
          resize();
          return;
        }
        emit();
      }}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
        emit();
      }}
      onKeyDown={(event) => {
        // Never intercept keys while the IME is assembling a syllable.
        if (event.nativeEvent.isComposing || composing.current) return;
        onKeyDown?.(event, event.currentTarget);
      }}
      onFocus={onFocus}
      onBlur={onBlur}
      onPaste={onPaste}
    />
  );
}
