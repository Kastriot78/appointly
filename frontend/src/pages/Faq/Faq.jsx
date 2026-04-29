import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

const faqs = [
  {
    question: "Can I switch plans later?",
    answer:
      "Absolutely. You can upgrade or downgrade your plan at any time. When upgrading, you'll get immediate access to new features. When downgrading, the change takes effect at your next billing cycle.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "Yes! The Professional and Enterprise plans come with a 14-day free trial. No credit card required. You can explore all features before committing.",
  },
  {
    question: "What payment methods do you accept?",
    answer:
      "We accept all major credit cards (Visa, Mastercard, American Express) through Stripe. For Enterprise plans, we also offer invoicing and bank transfer options.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes, there are no long-term contracts. You can cancel your subscription at any time from your account settings. Your access continues until the end of your current billing period.",
  },
  {
    question: "Do my clients need an account to book?",
    answer:
      "No! Your clients can book as guests using just their email. They can optionally create an account to manage their bookings and view history.",
  },
  {
    question: "What happens when I reach my staff limit?",
    answer:
      "You'll receive a notification when you're approaching your limit. You can easily upgrade to a higher plan to add more staff members without losing any existing data.",
  },
];

function FAQItem({ faq, index, isVisible }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className={`faq-item ${isOpen ? "open" : ""} ${isVisible ? "visible" : ""}`}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <button className="faq-question" onClick={() => setIsOpen(!isOpen)}>
        <span>{faq.question}</span>
        <div className={`faq-icon ${isOpen ? "rotated" : ""}`}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M5 7.5L10 12.5L15 7.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </button>
      <div className="faq-answer">
        <div className="faq-answer-inner">
          <p>{faq.answer}</p>
        </div>
      </div>
    </div>
  );
}

const Faq = () => {
  const faqRef = useRef(null);
  const [faqVisible, setFaqVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setFaqVisible(true);
        }
      },
      { threshold: 0.1 },
    );

    if (faqRef.current) observer.observe(faqRef.current);

    return () => observer.disconnect();
  }, []);
  return (
    <section className="pricing-faq-section" ref={faqRef} data-section="faq">
      <div className="container">
        <div className={`faq-header ${faqVisible ? "visible" : ""}`}>
          <h2>Frequently Asked Questions</h2>
          <p>Everything you need to know about our pricing</p>
        </div>

        <div className="faq-grid">
          {faqs.map((faq, index) => (
            <FAQItem
              key={index}
              faq={faq}
              index={index}
              isVisible={faqVisible}
            />
          ))}
        </div>

        <div className={`faq-cta-box ${faqVisible ? "visible" : ""}`}>
          <h3>Still have questions?</h3>
          <p>
            Can't find the answer you're looking for? Our team is happy to help.
          </p>
          <Link to="/contact" className="faq-cta-btn">
            Get in Touch
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M3 8H13M13 8L9 4M13 8L9 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default Faq;
