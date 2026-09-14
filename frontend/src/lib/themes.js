// Homepage section background themes (all light for readable dark text)
export const SECTION_THEMES = {
  cream: { label: "Cream", bg: "#FAF7F2" },
  white: { label: "White", bg: "#FFFFFF" },
  blush: { label: "Blush", bg: "#FCEEE9" },
  sage: { label: "Sage", bg: "#E3E8DC" },
  butter: { label: "Butter", bg: "#FFF4DC" },
  lavender: { label: "Lavender", bg: "#EBE6F5" },
};

export const themeBg = (key) => (SECTION_THEMES[key] || SECTION_THEMES.cream).bg;
