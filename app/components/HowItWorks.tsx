
const steps = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    ),
    label: "Scan",
    bgStyle: "bg-guidr-primary-light border-2 border-guidr-primary/20",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
    label: "Investigate",
    bgStyle: "bg-guidr-primary",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
        <line x1="4" y1="22" x2="4" y2="15" />
      </svg>
    ),
    label: "Report",
    bgStyle: "bg-guidr-primary-light border-2 border-guidr-primary/20",
  },
];

export default function HowItWorks() {
  return (
    <section className="px-5 py-6 lg:px-0 lg:py-8 guidr-animate-in guidr-stagger-6">
      <h3 className="text-lg font-bold text-guidr-text text-center mb-4">
        How it works
      </h3>

      <div className="bg-white rounded-2xl shadow-sm p-5 flex flex-col gap-0 lg:max-w-lg lg:mx-auto">
        {steps.map((step, i) => (
          <div key={step.label}>
            <div className="flex items-center gap-4">
              {/* Icon Circle */}
              <div
                className={`shrink-0 w-11 h-11 flex items-center justify-center rounded-full ${step.bgStyle}`}
              >
                {step.icon}
              </div>

              {/* Label */}
              <span className="text-base font-semibold text-guidr-text">
                {step.label}
              </span>
            </div>

            {/* Arrow connector */}
            {i < steps.length - 1 && (
              <div className="flex flex-col items-center w-11 py-1">
                <div className="w-0.5 h-4 bg-guidr-primary/30 rounded-full" />
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0d7377" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="-mt-1 opacity-60">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
