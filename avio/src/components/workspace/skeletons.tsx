import { LogoMark } from "@/components/ui/logo";

/** Static stand-ins shown while the signed-in parts of a page stream in. */

export function WorkspaceSkeleton() {
  return (
    <div className="flex h-dvh overflow-hidden bg-bg" aria-busy="true" aria-label="Loading workspace">
      <aside className="hidden w-[17rem] shrink-0 flex-col border-r border-line bg-panel lg:flex">
        <div className="flex h-14 items-center gap-2 px-4 text-fg">
          <LogoMark />
          <span className="text-[0.9375rem] font-semibold tracking-[0.16em]">AVIO</span>
        </div>
        <div className="flex flex-col gap-2 px-3">
          <div className="skeleton h-9 w-full" />
          <div className="skeleton h-9 w-full" />
        </div>
        <div className="mt-6 flex flex-1 flex-col gap-3 px-5">
          {["w-[80%]", "w-[62%]", "w-[74%]", "w-[50%]", "w-[68%]"].map((width) => (
            <div key={width} className={`skeleton h-2.5 ${width}`} />
          ))}
        </div>
        <div className="border-t border-line p-5">
          <div className="skeleton h-2.5 w-full" />
          <div className="skeleton mt-4 h-7 w-[70%]" />
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center border-b border-line px-4">
          <div className="skeleton h-8 w-40" />
        </div>
        <div className="flex-1" />
        <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-4 sm:px-6">
          <div className="skeleton h-[5.25rem] w-full rounded-2xl" />
        </div>
      </main>
    </div>
  );
}

export function ThreadSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy="true" aria-label="Loading conversation">
      <div className="flex h-14 shrink-0 items-center border-b border-line px-4">
        <div className="skeleton h-8 w-40" />
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 pt-8 sm:px-6">
        <div className="skeleton h-10 w-[55%] self-end rounded-2xl" />
        <div className="flex flex-col gap-3">
          <div className="skeleton h-2.5 w-28" />
          <div className="skeleton h-2.5 w-[92%]" />
          <div className="skeleton h-2.5 w-[84%]" />
          <div className="skeleton h-2.5 w-[60%]" />
        </div>
      </div>
      <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-4 sm:px-6">
        <div className="skeleton h-[5.25rem] w-full rounded-2xl" />
      </div>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6" aria-busy="true" aria-label="Loading settings">
      {[0, 1, 2].map((section) => (
        <div key={section} className="border-b border-line py-8 first:pt-0">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton mt-5 h-16 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}
