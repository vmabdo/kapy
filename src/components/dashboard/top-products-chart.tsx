"use client";

import { useMemo } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "@/lib/utils";

interface TopProductsChartProps {
  data: { name: string; revenue: number; quantity: number }[];
}

export function TopProductsChart({ data }: TopProductsChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-[300px] w-full flex flex-col items-center justify-center text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border/50 mt-4">
        <p className="text-sm">لا توجد بيانات مبيعات في هذه الفترة</p>
      </div>
    );
  }

  return (
    <div className="h-[300px] w-full mt-4" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis 
            type="category" 
            dataKey="name" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 12, fill: "hsl(var(--foreground))", textAnchor: 'end' }}
            width={80}
            dx={-10}
          />
          <Tooltip cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} content={<CustomTooltip />} />
          <Bar 
            dataKey="revenue" 
            fill="hsl(var(--primary))" 
            radius={[0, 4, 4, 0]} 
            barSize={20}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-background border border-border rounded-xl shadow-lg p-3 text-right" dir="rtl">
        <p className="text-sm font-semibold text-foreground mb-1 truncate max-w-[200px]">{data.name}</p>
        <div className="space-y-1 text-xs">
          <p className="flex justify-between gap-4">
            <span className="text-muted-foreground">الكمية المباعة:</span>
            <span className="font-medium text-foreground">{data.quantity}</span>
          </p>
          <p className="flex justify-between gap-4">
            <span className="text-muted-foreground">الإيرادات:</span>
            <span className="font-bold text-primary">{formatCurrency(data.revenue.toString())}</span>
          </p>
        </div>
      </div>
    );
  }
  return null;
}
