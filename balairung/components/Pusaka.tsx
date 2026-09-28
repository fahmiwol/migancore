"use client";
import { motion } from "motion/react";

// Pusaka — a Balairung HUD panel (glass card). Denyut gives it entrance motion.
export function Pusaka({
  title, icon, children, className = "", delay = 0,
}: {
  title: string; icon?: React.ReactNode; children: React.ReactNode; className?: string; delay?: number;
}) {
  return (
    <motion.section
      className={`pusaka p-3 ${className}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
    >
      <header className="pusaka-hd mb-2 flex items-center gap-2">
        {icon}
        <span>{title}</span>
      </header>
      {children}
    </motion.section>
  );
}
