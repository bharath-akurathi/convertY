import { AudioLines } from 'lucide-react';

export function FileArtwork() {
  return (
    <div
      aria-hidden="true"
      className="relative hidden h-44 w-80 shrink-0 select-none sm:block"
    >
      <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-300 dark:border-slate-700" />
      <div className="file-sheet absolute top-9 left-7 -rotate-[18deg] bg-[#dfd7ee] text-[#4e3b65]">
        <AudioLines className="mt-1 size-12" strokeWidth={1.5} />
        <span className="sheet-format">WAV</span>
      </div>
      <div className="file-sheet absolute top-8 right-6 rotate-[17deg] bg-[#f0c6ab] text-[#6b412d]">
        <div className="mt-2 grid w-full gap-1.5 [&>i]:h-[3px] [&>i]:rounded-full [&>i]:bg-current">
          <i className="w-7" />
          <i className="w-12 opacity-60" />
          <i className="w-10 opacity-50" />
          <i className="w-8 opacity-40" />
        </div>
        <span className="sheet-format self-end">PDF</span>
      </div>
      <div className="absolute top-3 left-[107px] -rotate-[6deg] drop-shadow-[0_7px_5px_#18372925]">
        <div className="file-sheet relative bg-[#c6dda9] text-[#324b35]">
          <div className="relative mt-2 h-11 w-16 overflow-hidden rounded-sm bg-[#e6efc7]">
            <span className="absolute top-1.5 right-2 size-2.5 rounded-full bg-[#eeb76a]" />
            <span className="absolute inset-0 bg-[#85ae7e] [clip-path:polygon(0_85%,35%_30%,77%_100%,0_100%)]" />
            <span className="absolute inset-0 bg-[#466b51] [clip-path:polygon(12%_100%,70%_35%,100%_77%,100%_100%)]" />
          </div>
          <span className="sheet-format">PNG</span>
        </div>
      </div>
    </div>
  );
}
