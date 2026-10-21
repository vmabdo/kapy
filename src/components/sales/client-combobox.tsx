"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  MapPin,
  Search,
  SearchX,
  Store,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ClientComboboxOption {
  id: string;
  name: string;
  clientType: string;
  address: string | null;
  governorate: { id: string; name: string } | null;
}

interface ClientComboboxProps {
  /** Options shown in the dropdown (already filtered by client type). */
  options: ClientComboboxOption[];
  /** The currently selected client, resolved from the full client list. */
  selectedClient: ClientComboboxOption | null;
  value: string;
  onChange: (clientId: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  placeholder?: string;
}

/**
 * Normalizes Arabic/Latin text for forgiving, diacritic-insensitive search.
 * Handles alef/hamza variants, taa marbuta, yaa, tatweel and harakat.
 */
function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "") // harakat + tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

function getClientTypeIcon(clientType: string) {
  return clientType === "EXTERNAL_WAREHOUSE" ? Building2 : Store;
}

export function ClientCombobox({
  options,
  selectedClient,
  value,
  onChange,
  onBlur,
  invalid = false,
  placeholder = "ابحث واختر العميل...",
}: ClientComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const baseId = useId();
  const listboxId = `client-combobox-listbox-${baseId}`;
  const searchInputId = `client-combobox-search-${baseId}`;

  const filteredOptions = useMemo(() => {
    const tokens = normalizeSearchText(query).split(" ").filter(Boolean);
    if (tokens.length === 0) return options;

    return options.filter((option) => {
      const haystack = normalizeSearchText(
        [option.name, option.governorate?.name ?? "", option.address ?? ""].join(" ")
      );
      return tokens.every((token) => haystack.includes(token));
    });
  }, [options, query]);

  // Focus the search box as soon as the dropdown opens.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    setActiveIndex(filteredOptions.length > 0 ? 0 : -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reset/clamp the active option whenever the results change.
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
    setQuery("");
    setOpen(true);
  };

  const closeDropdown = (restoreFocus = false) => {
    setOpen(false);
    setQuery("");
    if (restoreFocus) triggerRef.current?.focus();
  };

  const handleSelect = (client: ClientComboboxOption) => {
    onChange(client.id);
    closeDropdown(true);
    onBlur?.();
  };

  const handleClear = () => {
    onChange("");
    closeDropdown(true);
    onBlur?.();
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((current) =>
          filteredOptions.length === 0
            ? -1
            : (current + 1 + filteredOptions.length) % filteredOptions.length
        );
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((current) =>
          filteredOptions.length === 0
            ? -1
            : (current - 1 + filteredOptions.length) % filteredOptions.length
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

  const handleContainerBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      onBlur?.();
    }
  };

  const selectedGovernorate = selectedClient?.governorate?.name;
  const SelectedIcon = selectedClient
    ? getClientTypeIcon(selectedClient.clientType)
    : Search;
  const hasSearchQuery = normalizeSearchText(query).length > 0;

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={handleContainerBlur}
      dir="rtl"
    >
      <div
        className={cn(
          "flex w-full items-stretch overflow-hidden rounded-xl border bg-background transition-shadow",
          "focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/30",
          invalid ? "border-red-400" : "border-border",
          open && "border-primary/50 ring-2 ring-primary/30"
        )}
      >
        <button
          ref={triggerRef}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          onClick={() => (open ? closeDropdown() : openDropdown())}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (!open) openDropdown();
            }
            if (event.key === "Escape" && open) {
              event.preventDefault();
              closeDropdown();
            }
          }}
          className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-right focus:outline-none"
        >
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              selectedClient
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            )}
          >
            <SelectedIcon className="h-4 w-4" />
          </span>

          <span className="min-w-0 flex-1">
            {selectedClient ? (
              <>
                <span className="block truncate text-sm font-semibold text-foreground">
                  {selectedClient.name}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  {selectedGovernorate && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {selectedGovernorate}
                    </span>
                  )}
                  {selectedClient.address ? (
                    <span className="break-words">
                      {selectedGovernorate ? "• " : ""}
                      {selectedClient.address}
                    </span>
                  ) : (
                    !selectedGovernorate && <span>لا توجد بيانات عنوان</span>
                  )}
                </span>
              </>
            ) : (
              <span className="block truncate text-sm text-muted-foreground">
                {placeholder}
              </span>
            )}
          </span>
        </button>

        {selectedClient && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="مسح العميل المحدد"
            title="مسح الاختيار"
            className="flex shrink-0 items-center px-2 text-muted-foreground transition-colors hover:text-red-500 focus:outline-none focus-visible:text-red-500"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        <span className="pointer-events-none flex shrink-0 items-center px-3 text-muted-foreground">
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
          />
        </span>
      </div>

      {open && (
        <div className="absolute inset-x-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-black/5 dark:shadow-black/30">
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
                placeholder="ابحث بالاسم أو المحافظة أو العنوان..."
                autoComplete="off"
                role="searchbox"
                aria-label="البحث عن عميل"
                aria-autocomplete="list"
                aria-controls={listboxId}
                aria-activedescendant={
                  activeIndex >= 0 && filteredOptions[activeIndex]
                    ? `${listboxId}-option-${filteredOptions[activeIndex].id}`
                    : undefined
                }
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
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
            aria-label="قائمة العملاء"
            className="max-h-64 overflow-y-auto p-1.5"
          >
            {filteredOptions.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 px-4 py-8 text-center">
                <SearchX className="h-6 w-6 text-muted-foreground/60" />
                <p className="text-sm font-medium text-foreground">
                  {hasSearchQuery
                    ? "لا توجد نتائج مطابقة"
                    : "لا يوجد عملاء في هذا التصنيف"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {hasSearchQuery
                    ? "جرّب البحث باسم العميل أو المحافظة أو العنوان"
                    : "غيّر تصنيف العميل أو أضف عميلاً جديداً أولاً"}
                </p>
              </div>
            ) : (
              filteredOptions.map((client, index) => {
                const OptionIcon = getClientTypeIcon(client.clientType);
                const isSelected = value === client.id;

                return (
                  <button
                    key={client.id}
                    ref={(node) => {
                      optionRefs.current[index] = node;
                    }}
                    id={`${listboxId}-option-${client.id}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(client)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-right transition-colors",
                      index === activeIndex && "bg-primary/10",
                      isSelected && index !== activeIndex && "bg-primary/5"
                    )}
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <OptionIcon className="h-3.5 w-3.5" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-medium text-foreground">
                        {client.name}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-relaxed text-muted-foreground">
                        {client.governorate?.name && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3 shrink-0" />
                            {client.governorate.name}
                          </span>
                        )}
                        {client.address ? (
                          <span className="break-words">
                            {client.governorate?.name ? "• " : ""}
                            {client.address}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/70">
                            {client.governorate?.name ? "• لا يوجد عنوان مسجل" : "لا توجد بيانات عنوان"}
                          </span>
                        )}
                      </span>
                    </span>

                    {isSelected && (
                      <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-1 border-t border-border/70 px-3 py-1.5 text-[10px] text-muted-foreground">
            <span>
              {filteredOptions.length} من {options.length} عميل
            </span>
            <span>↑ ↓ للتنقل · Enter للاختيار · Esc للإغلاق</span>
          </div>
        </div>
      )}
    </div>
  );
}
