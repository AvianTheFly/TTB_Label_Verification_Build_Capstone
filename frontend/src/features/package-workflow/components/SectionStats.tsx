interface SectionStatsProps {
  items: Array<{
    active: boolean;
    filterKey: string;
    label: string;
    tone: "neutral" | "fail" | "review" | "passed" | "pending";
    value: number;
  }>;
  onToggle: (filterKey: string) => void;
}

export function SectionStats({ items, onToggle }: SectionStatsProps) {
  return (
    <div className="section-stats" aria-label="Section summary">
      {items.map((item) => (
        <button
          aria-pressed={item.active}
          className={`section-stat section-stat--${item.tone} ${
            item.active ? "is-active" : "is-inactive"
          }`}
          key={item.label}
          onClick={() => onToggle(item.filterKey)}
          type="button"
        >
          <strong>{item.value}</strong> {item.label}
        </button>
      ))}
    </div>
  );
}

