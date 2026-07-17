import Image from "next/image";
import NotificationsBell from "@/app/components/NotificationsBell";

export default function Header() {
  return (
    <header className="lg:hidden sticky top-0 z-40 flex items-center justify-between gap-3 px-4 pb-3 pt-safe-top bg-white/90 backdrop-blur-md border-b border-gray-100">
      <Image
        src="/images/Brand Logo.png"
        alt="Guidr"
        width={400}
        height={100}
        className="h-7 w-auto"
        priority
      />

      <NotificationsBell placement="header" />
    </header>
  );
}
