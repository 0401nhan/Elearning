type QuestionMediaProps = {
  src?: string | null;
  alt: string;
  variant?: "question" | "answer" | "thumbnail";
};

export function QuestionMedia({ src, alt, variant = "question" }: QuestionMediaProps) {
  if (!src) {
    return null;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`question-media question-media-${variant}`}
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
}
