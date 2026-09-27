import { MessageCircle } from "lucide-react";
import { viauraWhatsAppUrl } from "@/lib/whatsappOrder";

export default function WhatsAppButton() {
  const msg = encodeURIComponent("Hi Viaura! I'd love to know more about your products 🎁");
  const href = viauraWhatsAppUrl(decodeURIComponent(msg));
  return (
    <a
      data-testid="whatsapp-float-btn"
      href={href}
      target="_blank"
      rel="noreferrer"
      className="fixed bottom-24 lg:bottom-6 right-4 z-30 w-14 h-14 rounded-full bg-[#25D366] flex items-center justify-center shadow-lg hover:scale-110 transition-transform animate-float-slow"
      aria-label="Chat on WhatsApp"
    >
      <MessageCircle size={26} className="text-white fill-white" />
    </a>
  );
}
