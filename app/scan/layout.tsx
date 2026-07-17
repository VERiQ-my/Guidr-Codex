import Header from "@/app/components/Header";
import BottomNav from "@/app/components/BottomNav";

export default function ScanLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="guidr-container"><Header />{children}<BottomNav /></div>;
}

