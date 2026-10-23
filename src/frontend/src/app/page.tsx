"use client";

import { useState } from "react";
import { Preloader } from "@/components/loader/Preloader";
import { Navbar } from "@/components/nav/Navbar";
import { Hero } from "@/components/hero/Hero";
import { Stats } from "@/components/sections/Stats";
import { Problem } from "@/components/sections/Problem";
import { Pipeline } from "@/components/sections/Pipeline";
import { Features } from "@/components/sections/Features";
import { DemoSection } from "@/components/demo/DemoSection";
import { OpenSource } from "@/components/sections/OpenSource";
import { CTA } from "@/components/sections/CTA";
import { Footer } from "@/components/sections/Footer";
import { DriftField } from "@/components/fx/DriftField";
import { GlowCursor, ScrollProgress } from "@/components/fx/Chrome";

export default function Home() {
  const [booted, setBooted] = useState(false);

  return (
    <div className="relative flex min-h-screen flex-col">
      <Preloader onDone={() => setBooted(true)} />
      <ScrollProgress />
      <GlowCursor />
      <DriftField />
      <div className="noise-overlay" aria-hidden />

      <Navbar />
      <main className={booted ? "" : "overflow-hidden"}>
        <Hero />
        <Stats />
        <Problem />
        <Pipeline />
        <Features />
        <DemoSection />
        <OpenSource />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
