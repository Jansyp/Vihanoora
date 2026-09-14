import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { Gift } from "lucide-react";

export default function GiftReveal({ onDone }) {
  const [open, setOpen] = useState(false);
  const confetti = Array.from({ length: 26 });
  return (
    <div className="relative flex flex-col items-center py-6">
      <AnimatePresence>
        {open && confetti.map((_, i) => (
          <motion.span key={i}
            initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            animate={{ opacity: 0, x: (Math.random() - 0.5) * 320, y: -Math.random() * 260 - 40, rotate: Math.random() * 360 }}
            transition={{ duration: 1.1 + Math.random() * 0.6 }}
            className="absolute top-16 w-2.5 h-2.5 rounded-sm"
            style={{ background: ["#D9777F", "#E07A5F", "#D9933B", "#7B62A3", "#617052"][i % 5] }}
          />
        ))}
      </AnimatePresence>
      <motion.button
        data-testid="gift-reveal-btn"
        onClick={() => { setOpen(true); onDone?.(); }}
        whileTap={{ scale: 0.9 }}
        animate={open ? { rotate: [0, -8, 8, -4, 0], scale: [1, 1.15, 1] } : {}}
        transition={{ duration: 0.6 }}
        className="w-28 h-28 rounded-3xl bg-[var(--brand)] flex items-center justify-center soft-shadow"
      >
        <motion.div animate={open ? { y: [0, -30], opacity: [1, 0] } : {}} transition={{ duration: 0.5 }}>
          <Gift size={52} className="text-white" />
        </motion.div>
      </motion.button>
      {!open && <p className="mt-4 text-sm text-[var(--ink-soft)]">Tap to unwrap your order 🎉</p>}
    </div>
  );
}
