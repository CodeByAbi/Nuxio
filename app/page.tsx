import { Bell, TrendingUp } from "lucide-react";

const CALENDAR_DAYS = [
  [30, 31, 1, 2, 3, 4, 5],
  [6, 7, 8, 9, 10, 11, 12],
  [13, 14, 15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24, 25, 26],
  [27, 28, 29, 30, 1, 2, 3],
  [4, 5, 6, 7, 8, 9, 10],
];

const MARKED_DAYS: Record<number, "income" | "expense"> = {
  1: "income",
  3: "income",
  8: "income",
  10: "income",
  11: "income",
  13: "income",
  14: "income",
  16: "income",
  17: "income",
  20: "expense",
  21: "expense",
};

export default function Home() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[#faf8fe] text-[#1a1b1f] antialiased">
      <div className="pointer-events-none absolute top-0 right-0 -z-10 h-[800px] w-[800px] -translate-y-1/4 translate-x-1/4 rounded-full bg-gradient-to-bl from-teal-100/50 via-cyan-50/30 to-transparent opacity-80 blur-3xl" />

      <main className="z-10 flex flex-grow items-center justify-center px-6 py-16 sm:px-12 lg:py-24">
        <div className="mx-auto grid w-full max-w-300 grid-cols-1 items-center gap-16 md:grid-cols-12">
          {/* Left column: content & form */}
          <div className="z-20 flex flex-col space-y-10 md:col-span-5 md:col-start-2">
            <div className="flex flex-col gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo, no next/image optimization needed */}
              <img src="/logo.svg" alt="Nuxio" className="h-9 w-auto" />
              <p className="text-[11px] text-[#414753]">
                Financial planning, organized around your calendar.
              </p>
            </div>

            <div className="space-y-4 border-t border-[#c1c6d6] pt-6">
              <h2 className="text-4xl leading-[1.1] font-semibold tracking-tight text-[#1a1b1f] sm:text-[40px]">
                We are coming soon
              </h2>
              <p className="text-[17px] leading-relaxed tracking-tight text-[#5f5e60]">
                Stay tuned and get an email once we launch. Nuxio menyatukan transaksi, tagihan
                berulang, budget, dan tujuan finansial dalam satu kalender.
              </p>
            </div>

            <form className="w-full max-w-sm space-y-6 pt-2">
              <div className="flex w-full gap-2">
                <div className="w-full">
                  <label
                    htmlFor="name"
                    className="mb-1 block text-xs font-medium tracking-wide text-[#5f5e60]"
                  >
                    Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    placeholder="John Doe"
                    className="h-10 w-full rounded-lg border border-[#c1c6d6] bg-white px-2 text-sm text-[#1a1b1f] transition-colors placeholder:text-[#5f5e60]/60 focus:border-[#0071e3] focus:ring-1 focus:ring-[#0071e3] focus:outline-none"
                  />
                </div>
                <div className="w-full">
                  <label
                    htmlFor="email"
                    className="mb-1 block text-xs font-medium tracking-wide text-[#5f5e60]"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="john@example.com"
                    className="h-10 w-full rounded-lg border border-[#c1c6d6] bg-white px-2 text-sm text-[#1a1b1f] transition-colors placeholder:text-[#5f5e60]/60 focus:border-[#0071e3] focus:ring-1 focus:ring-[#0071e3] focus:outline-none"
                  />
                </div>
              </div>
              <button
                type="button"
                className="flex h-10 w-full items-center justify-center rounded-lg bg-[#0071e3] px-6 text-xs font-medium text-white shadow-sm transition-colors hover:bg-[#0071e3]/90 sm:w-auto"
              >
                Notify me
              </button>
            </form>
          </div>

          {/* Right column: calendar visual */}
          <div className="relative z-10 hidden h-150 md:col-span-6 md:block">
            <div className="absolute inset-0 translate-x-8 rounded-3xl bg-linear-to-bl from-emerald-200/60 via-teal-100/40 to-transparent" />

            <div className="absolute top-1/2 left-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rotate-2 overflow-hidden rounded-xl border border-[#e3e2e7] bg-white shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)] transition-transform duration-500 ease-out hover:rotate-0">
              <div className="flex items-center justify-between border-b border-[#e3e2e7] px-5 pt-4 pb-3">
                <span className="text-xs font-semibold tracking-wide text-[#1a1b1f]">
                  FINANCIAL OVERVIEW
                </span>
                <span className="text-xs text-[#5f5e60]">SEPTEMBER 2024</span>
              </div>
              <div className="px-5 pt-3 pb-4">
                <div className="grid grid-cols-7 gap-y-2 text-center text-[11px] text-[#5f5e60]">
                  {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                  {CALENDAR_DAYS.flat().map((day, i) => {
                    const mark = MARKED_DAYS[day];
                    const isCurrentMonth = i >= 2 && i < 32;
                    return (
                      <span
                        key={i}
                        className={`flex flex-col items-center gap-0.5 ${
                          isCurrentMonth ? "text-[#1a1b1f]" : "text-[#c1c6d6]"
                        } ${day === 1 && i === 2 ? "font-semibold" : ""}`}
                      >
                        {day}
                        <span
                          className={`h-0.5 w-3 rounded-full ${
                            mark === "income"
                              ? "bg-emerald-500"
                              : mark === "expense"
                                ? "bg-rose-500"
                                : "bg-transparent"
                          }`}
                        />
                      </span>
                    );
                  })}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-[#e3e2e7] pt-3 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                      <TrendingUp className="size-3" />
                    </span>
                    <div>
                      <div className="text-[#5f5e60]">Income</div>
                      <div className="font-semibold text-[#1a1b1f]">$8,450</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                      <TrendingUp className="size-3 rotate-180" />
                    </span>
                    <div>
                      <div className="text-[#5f5e60]">Expenses</div>
                      <div className="font-semibold text-[#1a1b1f]">$3,200</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-[#5f5e60]">Savings</div>
                    <div className="font-semibold text-[#1a1b1f]">$5,250</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute top-1/4 -left-8 flex h-24 w-24 -rotate-6 animate-pulse flex-col items-center justify-center rounded-xl border border-[#c1c6d6] bg-white shadow-sm">
              <Bell className="mb-1 size-6 text-[#0071e3]" fill="currentColor" />
              <span className="text-[11px] text-[#5f5e60]">Alerts</span>
            </div>

            <div className="absolute right-0 bottom-1/4 flex h-16 w-32 rotate-3 items-center gap-2 rounded-lg border border-[#c1c6d6] bg-white px-2 shadow-sm">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0071e3]/10">
                <TrendingUp className="size-4 text-[#0071e3]" />
              </div>
              <div>
                <div className="text-xs text-[#1a1b1f]">Growth</div>
                <div className="text-[11px] text-[#5f5e60]">+12%</div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="z-10 mx-auto mt-auto flex w-full max-w-300 items-center justify-center border-t border-[#c1c6d6] px-6 py-10 sm:px-12">
        <div className="flex w-full flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex gap-6 text-xs tracking-widest text-[#5f5e60] uppercase">
            <a className="opacity-80 transition-opacity hover:text-[#1a1b1f] hover:opacity-100" href="#">
              Privacy policy
            </a>
            <a className="opacity-80 transition-opacity hover:text-[#1a1b1f] hover:opacity-100" href="#">
              Terms and conditions
            </a>
            <a className="opacity-80 transition-opacity hover:text-[#1a1b1f] hover:opacity-100" href="#">
              Get in touch
            </a>
          </div>
          <div className="text-sm text-[#1a1b1f]">Phase 0 — Foundation</div>
        </div>
      </footer>
    </div>
  );
}
