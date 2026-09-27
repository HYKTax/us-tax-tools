import Link from "next/link";
import { Brand } from "@/components/brand";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "grid" },
  { href: "/dashboard/clients", label: "Clients", icon: "users" },
  { href: "/dashboard/templates", label: "Organizer templates", icon: "clipboard" },
];

function Icon({ name }: { name: string }) {
  const common = "h-4 w-4";
  if (name === "users") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  if (name === "clipboard") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M9 9h6M9 13h6M9 17h4"/></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={common}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
}

export function StaffSidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-950 lg:flex lg:min-h-screen lg:flex-col">
      <div className="border-b border-white/10 px-5 py-5">
        <Brand inverse />
        <p className="mt-2 text-xs text-slate-400">Firm workspace</p>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3 py-5">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <Icon name={item.icon} />
            {item.label}
          </Link>
        ))}
        <div className="mt-5 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Coming next
        </div>
        <div className="mt-2 flex flex-col gap-1 text-sm text-slate-500">
          <span className="px-3 py-2">Documents</span>
          <span className="px-3 py-2">Messages</span>
          <span className="px-3 py-2">Work / Returns</span>
        </div>
      </nav>
      <div className="border-t border-white/10 px-5 py-4 text-xs text-slate-500">
        Secure workspace for tax professionals
      </div>
    </aside>
  );
}
