import { useState } from "react";
import { useReducedEffects } from "./useReducedEffects";
import { MotionConfig, motion } from "motion/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ArrowRight, ArrowUpRight, Menu, X } from "lucide-react";
import { Brand, github } from "./components/Primitives";
import { SignalField } from "./components/SignalField";
import { Terminal } from "./components/Terminal";
import {
  Closing,
  Integrations,
  Mechanism,
  Projection,
} from "./components/Sections";

import { BenchmarkExplorer } from "./components/BenchmarkExplorer";
import { StudyExplorer } from "./components/StudyExplorer";

export default function App() {
  const reduced = useReducedEffects();
  const [launch, setLaunch] = useState(0);
  const [menu, setMenu] = useState(false);
  const run = () => {
    setLaunch((value) => value + 1);
    setMenu(false);
  };
  return (
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>
      <Tooltip.Provider delayDuration={350}>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <header className="site-header">
          <div className="nav-inner">
            <a className="brand-link" href="#" aria-label="C4 home">
              <Brand />
            </a>
            <nav className={menu ? "open" : ""} aria-label="Main navigation">
              <a href="#demo" onClick={() => setMenu(false)}>
                Experience
              </a>
              <a href="#how-it-works" onClick={() => setMenu(false)}>
                How it works
              </a>
              <a href="#evidence" onClick={() => setMenu(false)}>
                Evidence
              </a>
            </nav>
            <div className="nav-actions">
              <a
                className="github-link"
                href={github}
                target="_blank"
                rel="noreferrer"
              >
                GitHub <ArrowUpRight size={14} />
              </a>
              <button className="nav-try" onClick={run}>
                Try C4 <ArrowRight size={14} />
              </button>
              <button
                className="mobile-menu"
                aria-label={menu ? "Close navigation" : "Open navigation"}
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
              >
                {menu ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </header>
        <main id="main">
          <section className="hero page-width">
            <motion.div
              className="hero-copy"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="hero-eyebrow mono">
                <span className="status-dot" />
                EVIDENCE-AWARE AGENT CONTROL
              </div>
              <h1>
                Control
                <br />
                <em>every crossing.</em>
              </h1>
              <p>
                Trace the evidence. Review the action.
                <br />
                Keep useful work moving.
              </p>
              <div className="hero-actions">
                <button className="button dark" onClick={run}>
                  Run a scenario <ArrowRight size={16} />
                </button>
                <a className="hero-secondary" href="#how-it-works">
                  Explore the mechanism <ArrowUpRight size={14} />
                </a>
              </div>
            </motion.div>
            <SignalField />
          </section>
          <div className="page-width">
            <Terminal launch={launch} />
            <div className="capability-strip">
              <span className="mono">CONTROL, ACROSS THE LOOP.</span>
              <span>Flow Ledger</span>
              <i>+</i>
              <span>Exact-input review</span>
              <i>+</i>
              <span>Fact Projection</span>
              <i>+</i>
              <span>Hash-linked audit</span>
            </div>
            <Mechanism />
            <Projection />
            <BenchmarkExplorer />
            <StudyExplorer />
            <Integrations />
          </div>
          <Closing onRun={run} />
        </main>
        <footer className="site-footer page-width">
          <div className="footer-top">
            <a className="brand-link" href="#" aria-label="Back to top">
              <Brand />
            </a>
            <p>
              Control at four crossings.
              <br />
              And across the steps between them.
            </p>
            <div>
              <a href={github} target="_blank" rel="noreferrer">
                Source <ArrowUpRight size={13} />
              </a>
              <a
                href={`${github}#quick-start`}
                target="_blank"
                rel="noreferrer"
              >
                Documentation <ArrowUpRight size={13} />
              </a>
              <a
                href={`${github}/blob/main/LICENSE`}
                target="_blank"
                rel="noreferrer"
              >
                MIT License <ArrowUpRight size={13} />
              </a>
            </div>
          </div>
          <div className="footer-bottom mono">
            <span>C4 © {new Date().getFullYear()}</span>
            <span>RESEARCH PROTOTYPE · BUILT WITH JEV</span>
            <a href="#main">BACK TO TOP ↑</a>
          </div>
        </footer>
      </Tooltip.Provider>
    </MotionConfig>
  );
}
