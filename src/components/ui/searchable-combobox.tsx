"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Check, ChevronDown, Search, SearchX, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeSearchText } from "@/lib/search";

export interface SearchableComboboxOption {
  /** Stable value stored in the form. */
  value: string;
  /** Main text shown in the trigger and option row. */
  label: string;
  /** Muted secondary text shown under the label in the option row. */
  description?: string;
  /** Extra text included in search matching (e.g. SKU, employee code). */
  searchText?: string;
  /** Optional leading icon for the option row and selected trigger. */
  icon?: ReactNode;
  /** Optional trailing content (e.g. a stock or status chip). */
  badge?: ReactNode;
}

interface SearchableComboboxProps {
  options: readonly SearchableComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyHint?: string;
  noOptionsTitle?: string;
  noOptionsHint?: string;
  /** Noun used in the footer count, e.g. "مندوب" -> "3 من 12 مندوب". */
  resultsNoun?: string;
  ariaLabel?: string;
  listboxLabel?: string;
  className?: string;
  panelClassName?: string;
  id?: string;
}

/**
 * Accessible, RTL-friendly searchable select.
 *
 * All filtering is local and memoized: the options are normalized once per
 * options change, so typing filters instantly even for large product lists.
 */
export function SearchableCombobox({
  options,
  value,
  onChange,
  onBlur,
  invalid = false,
  disabled = false,
  placeholder = "اختر...",
  searchPlaceholder = "ابحث...",
  emptyTitle = "لا توجد نتائج مطابقة",
  emptyHint = "جرّب البحث بكلمة مختلفة",
  noOptionsTitle = "لا توجد خيارات متاحة",
  noOptionsHint,
  resultsNoun,
  ariaLabel,
  listboxLabel,
  className,
  panelClassName,
  id,
}: SearchableComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const baseId = useId();
  const listboxId = `${id ?? "combobox"}-listbox-${baseId}`;
  const searchInputId = `${id ?? "combobox"}-search-${baseId}`;

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value]
  );

  // Normalize each option once per options change — not on every keystroke.
  const searchIndex = useMemo(
    () =>
      options.map((option) => ({
        option,
        haystack: normalizeSearchText(
          [option.label, option.description, option.searchText]
            .filter(Boolean)
            .join(" ")
        ),
      })),
    [options]
  );

  const filteredOptions = useMemo(() => {
    const tokens = normalizeSearchText(query).split(" ").filter(Boolean);
    if (tokens.length === 0) return options;

    return searchIndex
      .filter(({ haystack }) => tokens.every((token) => haystack.includes(token)))
      .map(({ option }) => option);
  }, [options, query, searchIndex]);

  const hasSearchQuery = normalizeSearchText(query).length > 0;

  // Focus the search box as soon as the dropdown opens.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  // Keep the keyboard-active option valid whenever results change.
  useEffect(() => {
    if (!open) return;
    setActiveIndex(filteredOptions.length > 0 ? 0 : -1);
  }, [filteredOptions, open]);

  // Close on outside click / touch.
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setQuery("");
        onBlur?.();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open, onBlur]);

  // Keep the keyboard-active option in view.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const openDropdown = () => {
    if (disabled) return;
    setQuery("");
    setOpen(true);
  };

  const closeDropdown = (restoreFocus = false) => {
    setOpen(false);
    setQuery("");
    if (restoreFocus) triggerRef.current?.focus();
  };

  const handleSelect = (option: SearchableComboboxOption) => {
    onChange(option.value);
    closeDropdown(true);
    onBlur?.();
  };

  const handleClear = () => {
    onChange("");
    closeDropdown(true);
    onBlur?.();
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((current) =>
          filteredOptions.length === 0
            ? -1
            : current >= filteredOptions.length - 1
              ? 0
              : current + 1
        );
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((current) =>
          filteredOptions.length === 0
            ? -1
            : current <= 0
              ? filteredOptions.length - 1
              : current - 1
        );
        break;
      case "Home":
        if (filteredOptions.length > 0) {
          event.preventDefault();
          setActiveIndex(0);
        }
        break;
      case "End":
        if (filteredOptions.length > 0) {
          event.preventDefault();
          setActiveIndex(filteredOptions.length - 1);
        }
        break;
      case "Enter": {
        // Always prevent the surrounding <form> from submitting while searching.
        event.preventDefault();
        const activeOption = filteredOptions[activeIndex];
        if (activeOption) handleSelect(activeOption);
        break;
      }
      case "Escape":
        event.preventDefault();
        closeDropdown(true);
        break;
      case "Tab":
        closeDropdown();
        break;
      default:
        break;
    }
  };

  const handleContainerBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      onBlur?.();
    }
  };

  const resultsCount = filteredOptions.length;
  const footerCount = resultsNoun
    ? `${resultsCount} من ${options.length} ${resultsNoun}`
    : `${resultsCount} من ${options.length}`;

  return (
    <div
      ref={containerRef}
      className={cn("relative", className)}
      onBlur={handleContainerBlur}
      dir="rtl"
    >
      <div
        className={cn(
          "flex h-10 w-full items-stretch overflow-hidden rounded-xl border bg-background transition-shadow",
          "focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/30",
          invalid ? "border-red-400" : "border-border",
          open && "border-primary/50 ring-2 ring-primary/30",
          disabled && "cursor-not-allowed opacity-60"
        )}
      >
        <button
          ref={triggerRef}
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-label={ariaLabel}
          disabled={disabled}
          onClick={() => (open ? closeDropdown(true) : openDropdown())}
          onKeyDown={(event) => {
            if (
              event.key === "ArrowDown" ||
              event.key === "Enter" ||
              event.key === " "
            ) {
              event.preventDefault();
              if (!open) openDropdown();
            }
            if (event.key === "Escape" && open) {
              event.preventDefault();
              closeDropdown(true);
            }
          }}
          className="flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-right focus:outline-none disabled:cursor-not-allowed"
        >
          {selectedOption?.icon && (
            <span className="flex shrink-0 items-center text-muted-foreground">
              {selectedOption.icon}
            </span>
          )}

          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm",
              selectedOption
                ? "font-medium text-foreground"
                : "text-muted-foreground"
            )}
          >
            {selectedOption?.label ?? placeholder}
          </span>

          {selectedOption?.badge && (
            <span className="shrink-0">{selectedOption.badge}</span>
          )}
        </button>

        {selectedOption && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="مسح الاختيار"
            title="مسح الاختيار"
            className="flex shrink-0 items-center px-1.5 text-muted-foreground transition-colors hover:text-red-500 focus:outline-none focus-visible:text-red-500"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        <span className="pointer-events-none flex shrink-0 items-center px-2.5 text-muted-foreground">
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
          />
        </span>
      </div>

      {open && (
        <div
          className={cn(
            "absolute inset-x-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-black/5 dark:shadow-black/30",
            panelClassName
          )}
        >
          <div className="border-b border-border/70 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={inputRef}
                id={searchInputId}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={searchPlaceholder}
                autoComplete="off"
                role="searchbox"
                aria-label={ariaLabel ? `البحث في ${ariaLabel}` : "البحث"}
                aria-autocomplete="list"
                aria-controls={listboxId}
                aria-activedescendant={
                  activeIndex >= 0 && filteredOptions[activeIndex]
                    ? `${listboxId}-option-${filteredOptions[activeIndex].value}`
                    : undefined
                }
                className="h-10 w-full rounded-lg border border-border bg-background py-2 pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  aria-label="مسح البحث"
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div
            id={listboxId}
            role="listbox"
            aria-label={listboxLabel ?? ariaLabel ?? "الخيارات"}
            className="max-h-64 overflow-y-auto p-1.5"
          >
            {filteredOptions.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 px-4 py-8 text-center">
                <SearchX className="h-6 w-6 text-muted-foreground/60" />
                <p className="text-sm font-medium text-foreground">
                  {hasSearchQuery ? emptyTitle : noOptionsTitle}
                </p>
                {(hasSearchQuery ? emptyHint : noOptionsHint) && (
                  <p className="text-[11px] text-muted-foreground">
                    {hasSearchQuery ? emptyHint : noOptionsHint}
                  </p>
                )}
              </div>
            ) : (
              filteredOptions.map((option, index) => {
                const isSelected = value === option.value;

                return (
                  <button
                    key={option.value}
                    ref={(node) => {
                      optionRefs.current[index] = node;
                    }}
                    id={`${listboxId}-option-${option.value}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(option)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-right transition-colors",
                      index === activeIndex && "bg-primary/10",
                      isSelected && index !== activeIndex && "bg-primary/5"
                    )}
                  >
                    {option.icon && (
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        {option.icon}
                      </span>
                    )}

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {option.label}
                      </span>
                      {option.description && (
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {option.description}
                        </span>
                      )}
                    </span>

                    {option.badge && (
                      <span className="shrink-0">{option.badge}</span>
                    )}

                    {isSelected && (
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-1 border-t border-border/70 px-3 py-1.5 text-[10px] text-muted-foreground">
            <span>{footerCount}</span>
            <span>↑ ↓ للتنقل · Enter للاختيار · Esc للإغلاق</span>
          </div>
        </div>
      )}
    </div>
  );
}
