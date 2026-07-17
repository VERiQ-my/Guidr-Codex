"use client";

const CHANNELS = [
  { value: "WhatsApp", label: "WhatsApp" },
  { value: "LinkedIn", label: "LinkedIn" },
  { value: "SMS", label: "SMS" },
  { value: "Email", label: "Email" },
  { value: "Other", label: "Other platform" },
] as const;

interface ChannelPillsProps {
  selected: string;
  onSelect: (channel: string) => void;
}

function ChannelIcon({ channel, active }: { channel: string; active: boolean }) {
  const stroke = active ? "#0d7377" : "#7b8794";

  switch (channel) {
    case "WhatsApp":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="#25D366" aria-hidden="true">
          <path d="M12 2a9.9 9.9 0 0 0-8.4 15.2L2 22l4.9-1.5A9.9 9.9 0 1 0 12 2Zm0 18.1c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-2.9.9.9-2.8-.2-.3A8.1 8.1 0 1 1 12 20.1Zm4.5-6.1c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1-.2.2-.6.8-.8.9-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.2-.4.2-.4.6-1.2.1-.1 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5c-.2 0-.4.1-.6.3-.8.8-.8 2 0 3.2a9 9 0 0 0 3.5 3.1c1.3.6 1.8.6 2.5.5.4-.1 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1-.1-.1-.2-.2-.4-.3Z" />
        </svg>
      );
    case "LinkedIn":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "#0d7377" : "#0A66C2"} aria-hidden="true">
          <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2ZM8.3 18.3H5.7V9.8h2.6v8.5ZM7 8.6a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm11.3 9.7h-2.6v-4.1c0-1-.4-1.7-1.3-1.7-.7 0-1.1.5-1.3 1-.1.2-.1.4-.1.6v4.2h-2.6V9.8h2.6v1.1c.3-.5 1-1.3 2.3-1.3 1.7 0 2.9 1.1 2.9 3.4v5.3Z" />
        </svg>
      );
    case "SMS":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
        </svg>
      );
    case "Email":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m22 7-10 5L2 7" />
        </svg>
      );
    default: // Other
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <circle cx="8" cy="12" r="1.1" fill={stroke} stroke="none" />
          <circle cx="12" cy="12" r="1.1" fill={stroke} stroke="none" />
          <circle cx="16" cy="12" r="1.1" fill={stroke} stroke="none" />
        </svg>
      );
  }
}

export default function ChannelPills({ selected, onSelect }: ChannelPillsProps) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {CHANNELS.map((channel) => {
        const isActive = selected === channel.value;
        return (
          <button
            key={channel.value}
            type="button"
            onClick={() => onSelect(channel.value)}
            aria-pressed={isActive}
            className={`
              flex items-center gap-3 px-4 py-3.5 rounded-xl
              text-sm font-semibold border
              transition-all duration-200 ease-out active:scale-[0.98]
              ${channel.value === "Other" ? "col-span-2" : ""}
              ${
                isActive
                  ? "border-guidr-primary bg-guidr-primary-light/60 text-guidr-primary shadow-sm"
                  : "border-gray-200 bg-white text-guidr-text hover:border-guidr-primary/40 hover:bg-guidr-primary-light/30"
              }
            `}
          >
            <ChannelIcon channel={channel.value} active={isActive} />
            {channel.label}
          </button>
        );
      })}
    </div>
  );
}
