"use client";
import { AtSign, Mail, MessageSquareMore, MessagesSquare, MoreHorizontal } from "lucide-react";

const channels = [
  { label: "WhatsApp", icon: MessagesSquare }, { label: "SMS", icon: MessageSquareMore },
  { label: "Email", icon: Mail }, { label: "Telegram", icon: AtSign }, { label: "Other", icon: MoreHorizontal },
];
export default function ChannelPills({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{channels.map(({ label, icon: Icon }) => {
    const selected = value === label;
    return <button type="button" key={label} onClick={() => onChange(label)} aria-pressed={selected} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border px-2 text-sm font-medium transition-colors ${selected ? "border-guidr-primary bg-guidr-primary text-white shadow-sm" : "border-black/10 bg-white text-guidr-ink hover:border-guidr-primary/45 hover:bg-guidr-primary/5"}`}><Icon size={16} aria-hidden="true" />{label}</button>;
  })}</div>;
}