"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { changeAssignedRep } from "@/actions/pharmacies";
import { RefreshCw, Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createPortal } from "react-dom";

interface Props {
  pharmacyId: string;
  currentRepId?: string;
  salesReps: { id: string; name: string }[];
}

export function ChangeRepForm({ pharmacyId, currentRepId, salesReps }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [selectedRepId, setSelectedRepId] = useState(currentRepId || "");
  const [search, setSearch] = useState("");
  
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [styles, setStyles] = useState<React.CSSProperties>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setStyles({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
      });
    }
  }, [open]);

  const handleSelect = async (repId: string) => {
    if (repId === currentRepId) {
      setOpen(false);
      return;
    }
    
    setSelectedRepId(repId);
    setIsPending(true);
    
    try {
      const result = await changeAssignedRep({ pharmacyId, salesRepId: repId });
      if (result.success) {
        setOpen(false);
      } else {
        alert(result.error);
        setSelectedRepId(currentRepId || "");
      }
    } catch (e) {
      alert("حدث خطأ غير متوقع");
      setSelectedRepId(currentRepId || "");
    } finally {
      setIsPending(false);
    }
  };

  const filteredReps = salesReps.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        disabled={isPending}
        className="flex items-center gap-1.5 px-2 py-1 h-7 border border-border rounded-md text-[10px] font-medium hover:bg-muted transition-colors disabled:opacity-50"
      >
        <RefreshCw className={cn("w-3 h-3", isPending && "animate-spin")} />
        تغيير المندوب
      </button>

      {open && mounted && createPortal(
        <>
          <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setOpen(false)} />
          <div 
            className="absolute z-50 w-56 bg-card border border-border rounded-xl shadow-xl overflow-hidden flex flex-col"
            dir="rtl"
            style={styles}
          >
            <div className="flex items-center p-2 border-b border-border">
              <Search className="w-4 h-4 text-muted-foreground ml-2" />
              <input
                type="text"
                placeholder="ابحث عن مندوب..."
                className="w-full bg-transparent text-xs focus:outline-none"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            
            <div className="max-h-60 overflow-y-auto p-1">
              {filteredReps.length === 0 ? (
                <p className="text-xs text-center text-muted-foreground py-4">لم يتم العثور على مناديب</p>
              ) : (
                filteredReps.map((rep) => (
                  <button
                    key={rep.id}
                    onClick={() => handleSelect(rep.id)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs rounded-md hover:bg-muted transition-colors text-right"
                  >
                    <span>{rep.name}</span>
                    {selectedRepId === rep.id && (
                      <Check className="w-3 h-3 text-primary" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
