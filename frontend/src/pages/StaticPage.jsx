import { useParams } from "react-router-dom";
import { Section } from "@/components/common";
import { useSettings } from "@/context/SettingsContext";

const CONTENT = {
  about: { title: "About JAVE HOUSE", body: [
    "JAVE HOUSE is a curated lifestyle & gifting brand built for little things that make beautiful moments.",
    "We handpick Instagram-trending jewellery, crystal bracelets, hair accessories, cute kids' toys and thoughtful gift hampers — all at premium-but-affordable prices.",
    "Every order is packed with love and delivered across India with flat, transparent shipping.",
  ]},
  contact: { title: "Contact Us", body: [
    "We'd love to hear from you! Reach us anytime:",
  ]},
  shipping: { title: "Shipping Policy", body: [
    "We offer flat ₹50 delivery across India, with FREE shipping on orders above our threshold.",
    "Orders are processed within 1-2 business days and delivered in 4-6 business days via trusted couriers (Professional Couriers, Blue Dart & more).",
    "You'll receive a tracking number once your order ships — track it anytime on our Track Order page.",
  ]},
  returns: { title: "Returns & Refunds", body: [
    "We accept returns within 7 days of delivery for unused items in original packaging.",
    "Refunds are processed to the original payment method within 5-7 business days after we receive the returned item.",
    "Personalised or hygiene products (like certain hair accessories) may not be eligible for return.",
  ]},
  privacy: { title: "Privacy Policy", body: [
    "Your privacy matters. We only collect the information needed to process your orders and improve your experience.",
    "We never store card data. Payments are processed securely via Razorpay.",
    "We do not sell your personal information to third parties.",
  ]},
  terms: { title: "Terms & Conditions", body: [
    "By using JAVE HOUSE, you agree to our terms of service.",
    "All prices are in INR and inclusive of applicable taxes unless stated otherwise.",
    "Discounts are auto-calculated from MRP and selling price. Offers may change or expire without prior notice.",
  ]},
  faq: { title: "Frequently Asked Questions", body: [
    "Q: Do I need an account to order? — No! Guest checkout is always available.",
    "Q: How do I track my order? — Use the Track Order page with your Order ID + mobile/email.",
    "Q: What payment methods are accepted? — UPI, cards, net banking and more via Razorpay.",
    "Q: Is the delivery charge fixed? — Delivery starts at ₹50 and is free above our threshold.",
  ]},
};

export default function StaticPage() {
  const { slug } = useParams();
  const { settings } = useSettings();
  const c = CONTENT[slug] || { title: "Page", body: ["Content coming soon."] };
  return (
    <Section className="max-w-3xl">
      <h1 className="font-serif text-4xl font-semibold mb-6">{c.title}</h1>
      <div className="space-y-4 text-[var(--ink-soft)] leading-relaxed">
        {c.body.map((p, i) => <p key={i}>{p}</p>)}
        {slug === "contact" && settings && (
          <div className="bg-white rounded-2xl p-6 border border-[var(--line)] mt-4 space-y-2 text-[var(--ink)]">
            <p><b>Phone:</b> {settings.contact_number}</p>
            <p><b>Email:</b> {settings.email}</p>
            <p><b>WhatsApp:</b> +{settings.whatsapp}</p>
            <p><b>Instagram:</b> <a href={settings.instagram_url} className="text-[var(--brand)]">@javehouse</a></p>
          </div>
        )}
      </div>
    </Section>
  );
}
