import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Sparkles, Clock, CheckCircle2 } from 'lucide-react';

interface FeatureCard {
  title: string;
  description: string;
  milestone: string;
}

interface ComingSoonModuleProps {
  moduleName: string;
  subtitle: string;
  badge: string;
  description: string;
  features: FeatureCard[];
}

export const ComingSoonModule: React.FC<ComingSoonModuleProps> = ({
  moduleName,
  subtitle,
  badge,
  description,
  features,
}) => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-serif font-bold text-[#d49a24] uppercase tracking-widest">
              {subtitle}
            </span>
            <span className="px-2 py-0.5 bg-[#fff0dc] border border-[#f1d394] text-[#73501b] rounded text-[10px] font-bold">
              {badge}
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-serif font-bold text-[#542047]">
            {moduleName}
          </h1>
          <p className="text-xs text-[#68647a] max-w-2xl leading-relaxed mt-1">
            {description}
          </p>
        </div>

        <Link
          href="/dashboard"
          className="px-3.5 py-2 bg-white border border-[#eee2dc] hover:border-[#d49a24] text-[#542047] rounded-xl text-xs font-semibold flex items-center gap-1.5 transition self-start shadow-xs"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Dashboard</span>
        </Link>
      </div>

      {/* Planned Feature Breakdown Cards */}
      <div className="bg-white border border-[#eee2dc] rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold text-[#542047] pb-2 border-b border-[#eee2dc]">
          <Clock className="w-4 h-4 text-[#d49a24]" />
          <span>Planned Architecture & Roadmap Capabilities</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {features.map((f, i) => (
            <div
              key={i}
              className="p-4 bg-[#fffaf5] border border-[#eee2dc] rounded-xl flex flex-col justify-between"
            >
              <div>
                <span className="px-2 py-0.5 bg-[#fff0dc] text-[#82510b] font-bold text-[10px] rounded inline-block mb-2">
                  {f.milestone}
                </span>
                <h3 className="font-serif font-bold text-sm text-[#542047] mb-1">
                  {f.title}
                </h3>
                <p className="text-xs text-[#68647a] leading-relaxed">
                  {f.description}
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-[#eee2dc]/60 flex items-center gap-1.5 text-[10px] text-[#246743] font-semibold">
                <CheckCircle2 className="w-3 h-3" />
                <span>Architecture Verified in Milestone 1</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
