interface TripTimelineIntroProps {
  title: string;
  text: string;
}

export function TripTimelineIntro({ title, text }: TripTimelineIntroProps) {
  return (
    <section
      aria-labelledby="trip-timeline-intro-heading"
      className="rounded-card border border-caption/10 bg-bg-secondary p-4"
      data-testid="trip-timeline-intro"
    >
      <h2
        id="trip-timeline-intro-heading"
        className="font-ui text-xs font-semibold text-caption uppercase tracking-wide mb-2"
      >
        {title}
      </h2>
      <p className="font-ui text-body text-heading whitespace-pre-wrap">{text}</p>
    </section>
  );
}
