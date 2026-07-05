interface Props {
  onBack: () => void;
}

interface Announcement {
  date: string;      // display date
  isoDate: string;   // sortable
  title: string;
  description: string;
}

// Latest first. Add new entries at the top.
const ANNOUNCEMENTS: Announcement[] = [
  {
    date: '1 July 2026',
    isoDate: '2026-07-01',
    title: 'PHI Castle Development Started',
    description: 'Transforming the Mars map into PHI Castle: "The Castle of Pros."',
  },
  {
    date: '18 June 2026',
    isoDate: '2026-06-18',
    title: 'Football Mode Added',
    description: 'Added football mode for the brightest glory of FIFA.',
  },
  {
    date: '7 May 2026',
    isoDate: '2026-05-07',
    title: 'Visual & Gameplay Upgrade',
    description: 'Improved visuals and made gameplay more interactive.',
  },
  {
    date: '10 April 2026',
    isoDate: '2026-04-10',
    title: 'Asteron First Playable Version',
    description: 'Asteron was created as a chaos game featuring roles such as Crew, Shooter, and Protector.',
  },
];

export default function TutorialScreen({ onBack }: Props) {
  const sorted = [...ANNOUNCEMENTS].sort((a, b) => b.isoDate.localeCompare(a.isoDate));
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/95 backdrop-blur-sm overflow-y-auto py-8">
      <div className="relative max-w-2xl w-full mx-4 p-6 sm:p-8 rounded-xl border border-border bg-card shadow-2xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl sm:text-3xl font-bold font-mono tracking-wider text-primary">
            ANNOUNCEMENTS
          </h2>
          <button
            onClick={onBack}
            aria-label="Close announcements"
            className="px-3 py-1.5 rounded border border-white/30 text-white/80 text-sm hover:bg-white/10 font-mono"
          >
            ← Back
          </button>
        </div>

        <div className="space-y-4">
          {sorted.map((a) => (
            <article
              key={a.isoDate + a.title}
              className="rounded-lg border border-border bg-background/60 p-4 sm:p-5 shadow-md"
            >
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <h3 className="font-mono font-bold text-base sm:text-lg text-foreground">
                  {a.title}
                </h3>
                <time
                  dateTime={a.isoDate}
                  className="font-mono text-[11px] sm:text-xs text-muted-foreground whitespace-nowrap"
                >
                  {a.date}
                </time>
              </div>
              <p className="font-mono text-xs sm:text-sm text-muted-foreground leading-relaxed">
                {a.description}
              </p>
            </article>
          ))}
        </div>

        <div className="pt-2 border-t border-border">
          <p className="font-mono text-xs text-muted-foreground">
            Questions or feedback? Email{' '}
            <a
              href="mailto:inquiryshadowav@gmail.com"
              className="text-primary underline"
            >
              inquiryshadowav@gmail.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
