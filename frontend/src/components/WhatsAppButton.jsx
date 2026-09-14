import { MessageCircle } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";

export default function WhatsAppButton() {
  const { settings } = useSettings();
  const num = settings?.whatsapp || "919000000000";
  const msg = encodeURIComponent("Hi JAVE HOUSE! I'd love to know more about your products 🎁");
  return (
    <a
      data-testid="whatsapp-float-btn"
      href={`https://wa.me/${num}?text=${msg}`}
      target="_blank"
      rel="noreferrer"
      className="fixed bottom-20 lg:bottom-6 right-4 z-40 w-14 h-14 rounded-full bg-[#25D366] flex items-center justify-center shadow-lg hover:scale-110 transition-transform animate-float-slow"
      aria-label="Chat on WhatsApp"
    >
      <MessageCircle size={26} className="text-white fill-white" />
    </a>
  );
}
