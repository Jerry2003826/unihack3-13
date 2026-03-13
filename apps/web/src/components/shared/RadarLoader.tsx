"use client";

import { motion } from "framer-motion";

export function RadarLoader({
  statusText,
  title,
  description,
}: {
  statusText: string;
  title: string;
  description: string;
}) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col items-center justify-center p-4">
      <div className="relative flex items-center justify-center w-64 h-64 mb-8">
        <motion.div
          className="absolute w-full h-full rounded-full border-[1.5px] border-accent/20"
          initial={{ scale: 0.5, opacity: 1 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut" }}
        />
        <motion.div
          className="absolute w-full h-full rounded-full border-[1.5px] border-accent/40"
          initial={{ scale: 0.5, opacity: 1 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ duration: 2.5, delay: 0.8, repeat: Infinity, ease: "easeOut" }}
        />
        <motion.div
          className="absolute w-full h-full rounded-full border-[1.5px] border-accent/60"
          initial={{ scale: 0.5, opacity: 1 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ duration: 2.5, delay: 1.6, repeat: Infinity, ease: "easeOut" }}
        />
        <div className="z-10 bg-card w-20 h-20 rounded-full flex items-center justify-center border border-accent/50 shadow-[0_0_20px_rgba(61,220,255,0.3)]">
          <div className="w-5 h-5 rounded-full bg-accent animate-pulse" />
        </div>
      </div>
      <p className="text-xs uppercase tracking-[0.2em] text-accent/80">{title}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{statusText}</h2>
      <p className="text-sm text-muted-foreground mt-3 text-center max-w-sm">{description}</p>
    </div>
  );
}
