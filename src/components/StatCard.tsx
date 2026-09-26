"use client";
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Boxes, Puzzle, Users, Package, TrendingUp, TrendingDown, type LucideIcon } from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  Boxes,
  Puzzle,
  Users,
  Package,
};

interface StatCardProps {
  href?: string;
  title: string;
  value: React.ReactNode;
  icon?: string;
  trend?: { value: number; label?: string };
  description?: string;
}

export default function StatCard({ href, title, value, icon, trend, description }: StatCardProps) {
  const Icon = icon ? iconMap[icon] : undefined;
  const content = (
    <Card className="group h-auto min-h-20 w-full overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] sm:min-h-24 md:min-h-28 lg:min-h-32">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-muted-foreground text-xs font-medium sm:text-sm">
            {title}
          </CardTitle>
          {Icon && <Icon className="h-4 w-4 text-muted-foreground/60" />}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-primary origin-left truncate text-xl font-bold transition-transform duration-200 group-hover:scale-105 sm:text-2xl md:text-3xl lg:text-4xl">
          {value}
        </div>
        {trend && (
          <div className={`mt-1 flex items-center gap-1 text-xs ${trend.value >= 0 ? 'text-success-foreground' : 'text-destructive'}`}>
            {trend.value >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            <span>{trend.value >= 0 ? '+' : ''}{trend.value}%</span>
            {trend.label && <span className="text-muted-foreground">{trend.label}</span>}
          </div>
        )}
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block w-full">
        {content}
      </Link>
    );
  }

  return content;
}
