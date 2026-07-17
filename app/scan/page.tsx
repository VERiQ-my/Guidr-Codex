import BottomNav from "@/app/components/BottomNav";
import ScanForm from "./ScanForm";

export default function ScanPage() {
  return (
    <div className="guidr-container">
      <main className="flex-1 overflow-y-auto no-scrollbar px-5 pb-safe">
        <ScanForm />
      </main>
      <BottomNav />
    </div>
  );
}
