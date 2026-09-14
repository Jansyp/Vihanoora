import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Gem, Baby, Gift, Package, Flame, Tag } from "lucide-react";

const TILES = [
  { label: "Women", to: "/women", icon: Gem, bg: "var(--blush)", ic: "var(--brand)" },
  { label: "Kids", to: "/kids", icon: Baby, bg: "var(--sage)", ic: "var(--sage-dark)" },
  { label: "Gifts", to: "/gifts", icon: Gift, bg: "var(--butter)", ic: "var(--amber)" },
  { label: "Combos", to: "/combo-offers", icon: Package, bg: "var(--lavender)", ic: "var(--lavender-dark)" },
  { label: "Trending", to: "/trending", icon: Flame, bg: "var(--blush)", ic: "var(--terracotta)" },
  { label: "Offer Zone", to: "/offer-zone", icon: Tag, bg: "var(--sage)", ic: "var(--sage-dark)" },
];

export default function CategoryTiles() {
  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-4 sm:gap-6">
      {TILES.map((t, i) => (
        <motion.div key={t.label}
          initial={{ opacity: 0, scale: 0.8 }} whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }} transition={{ delay: i * 0.06, type: "spring", stiffness: 120 }}>
          <Link to={t.to} data-testid={`category-tile-${t.label.toLowerCase().replace(/\s/g, "-")}`}
            className="flex flex-col items-center gap-3 group">
            <div className="clay w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300"
              style={{ background: t.bg }}>
              <t.icon size={30} style={{ color: t.ic }} />
            </div>
            <span className="text-xs sm:text-sm font-semibold text-[var(--ink)]">{t.label}</span>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
