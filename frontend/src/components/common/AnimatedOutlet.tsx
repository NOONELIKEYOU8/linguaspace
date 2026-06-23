import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Outlet, useLocation } from "react-router-dom";

const easeEmphasized = [0.16, 1, 0.3, 1] as const;

export function AnimatedOutlet() {
  const location = useLocation();
  const reducedMotion = useReducedMotion();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        className="motion-route"
        initial={reducedMotion ? false : { opacity: 0, y: 14, scale: 0.992, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        exit={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 8, scale: 0.996, filter: "blur(4px)" }}
        transition={reducedMotion ? { duration: 0 } : { duration: 0.42, ease: easeEmphasized }}
      >
        <Outlet />
      </motion.div>
    </AnimatePresence>
  );
}
